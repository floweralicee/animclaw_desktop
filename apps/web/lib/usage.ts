import { createClient } from "@supabase/supabase-js";
import { stripe } from "./stripe";
import { calculateCost, resolveModel, type ModelPricing } from "./gateway-models";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type UsageEntry = {
  userId: string;
  apiKeyId: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  pricing: ModelPricing;
  /** Routing tier when using model auto-selection */
  tier?: string | null;
  autoRouted?: boolean;
};

/**
 * Record a single gateway request's token usage in the database and report
 * the metered quantity to Stripe.
 */
export async function logUsage(entry: UsageEntry): Promise<void> {
  const totalTokens = entry.promptTokens + entry.completionTokens;
  const costMicrocents = calculateCost(
    entry.pricing,
    entry.promptTokens,
    entry.completionTokens,
  );

  const row: Record<string, unknown> = {
    user_id: entry.userId,
    api_key_id: entry.apiKeyId,
    model: entry.model,
    provider: entry.provider,
    prompt_tokens: entry.promptTokens,
    completion_tokens: entry.completionTokens,
    total_tokens: totalTokens,
    cost_microcents: costMicrocents,
  };
  if (entry.tier != null) row.tier = entry.tier;
  if (entry.autoRouted === true) row.auto_routed = true;

  const dbInsert = supabase.from("usage_logs").insert(row);

  const stripeReport = reportToStripe(entry.userId, totalTokens);

  await Promise.allSettled([dbInsert, stripeReport]);
}

async function reportToStripe(
  userId: string,
  totalTokens: number,
): Promise<void> {
  const meteredPriceId = process.env.STRIPE_METERED_PRICE_ID;
  const meterEventName = process.env.STRIPE_USAGE_METER_EVENT_NAME;
  if (!meteredPriceId || !meterEventName) return;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, stripe_customer_id")
    .eq("user_id", userId)
    .single();

  if (!sub?.stripe_subscription_id || !sub.stripe_customer_id) return;

  try {
    const subscription = await stripe.subscriptions.retrieve(
      sub.stripe_subscription_id,
    );
    const meteredItem = subscription.items.data.find(
      (item) => item.price.id === meteredPriceId,
    );
    if (!meteredItem) return;

    await stripe.billing.meterEvents.create({
      event_name: meterEventName,
      payload: {
        stripe_customer_id: sub.stripe_customer_id,
        value: String(totalTokens),
      },
      timestamp: Math.floor(Date.now() / 1000),
      identifier: crypto.randomUUID(),
    });
  } catch (err) {
    console.error("[gateway] Stripe usage report failed:", err);
  }
}

export type UsageSummary = {
  totalTokens: number;
  totalCostMicrocents: number;
  byModel: Array<{
    model: string;
    provider: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costMicrocents: number;
    requestCount: number;
  }>;
};

/**
 * Aggregate usage for a user within a date range (inclusive).
 */
export type UsageSummaryExtended = UsageSummary & {
  byTier: Array<{
    tier: string;
    requestCount: number;
    costMicrocents: number;
    totalTokens: number;
  }>;
  autoRouted: {
    requestCount: number;
    costMicrocents: number;
    /** Estimated cost if each auto-routed request used the most expensive gateway model (Claude Opus proxy). */
    savingsMicrocents: number;
  };
};

/**
 * Aggregate usage including tier breakdown and estimated savings from auto-routing.
 */
export async function getUsageSummaryExtended(
  userId: string,
  from: string,
  to: string,
): Promise<UsageSummaryExtended> {
  const { data, error } = await supabase
    .from("usage_logs")
    .select(
      "model, provider, prompt_tokens, completion_tokens, total_tokens, cost_microcents, tier, auto_routed",
    )
    .eq("user_id", userId)
    .gte("created_at", from)
    .lte("created_at", to);

  if (error) throw new Error(`Failed to fetch usage: ${error.message}`);

  const rows = data ?? [];
  const opus = resolveModel("anthropic/claude-4-opus-20250514").pricing;

  const byModelMap = new Map<
    string,
    {
      model: string;
      provider: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costMicrocents: number;
      requestCount: number;
    }
  >();

  const byTierMap = new Map<
    string,
    { tier: string; requestCount: number; costMicrocents: number; totalTokens: number }
  >();

  let totalTokens = 0;
  let totalCostMicrocents = 0;
  let autoCount = 0;
  let autoCost = 0;
  let hypotheticalAutoCost = 0;

  for (const row of rows) {
    totalTokens += row.total_tokens;
    totalCostMicrocents += Number(row.cost_microcents);

    const existing = byModelMap.get(row.model);
    if (existing) {
      existing.promptTokens += row.prompt_tokens;
      existing.completionTokens += row.completion_tokens;
      existing.totalTokens += row.total_tokens;
      existing.costMicrocents += Number(row.cost_microcents);
      existing.requestCount += 1;
    } else {
      byModelMap.set(row.model, {
        model: row.model,
        provider: row.provider,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
        totalTokens: row.total_tokens,
        costMicrocents: Number(row.cost_microcents),
        requestCount: 1,
      });
    }

    const tierKey = (row as { tier?: string | null }).tier ?? "unspecified";
    const tierAgg = byTierMap.get(tierKey);
    const cm = Number(row.cost_microcents);
    if (tierAgg) {
      tierAgg.requestCount += 1;
      tierAgg.costMicrocents += cm;
      tierAgg.totalTokens += row.total_tokens;
    } else {
      byTierMap.set(tierKey, {
        tier: tierKey,
        requestCount: 1,
        costMicrocents: cm,
        totalTokens: row.total_tokens,
      });
    }

    if ((row as { auto_routed?: boolean }).auto_routed === true) {
      autoCount += 1;
      autoCost += cm;
      hypotheticalAutoCost += calculateCost(
        opus,
        row.prompt_tokens,
        row.completion_tokens,
      );
    }
  }

  const savingsMicrocents = Math.max(0, hypotheticalAutoCost - autoCost);

  return {
    totalTokens,
    totalCostMicrocents,
    byModel: Array.from(byModelMap.values()).sort(
      (a, b) => b.costMicrocents - a.costMicrocents,
    ),
    byTier: Array.from(byTierMap.values()).sort(
      (a, b) => b.costMicrocents - a.costMicrocents,
    ),
    autoRouted: {
      requestCount: autoCount,
      costMicrocents: autoCost,
      savingsMicrocents,
    },
  };
}

export async function getUsageSummary(
  userId: string,
  from: string,
  to: string,
): Promise<UsageSummary> {
  const { data, error } = await supabase
    .from("usage_logs")
    .select("model, provider, prompt_tokens, completion_tokens, total_tokens, cost_microcents")
    .eq("user_id", userId)
    .gte("created_at", from)
    .lte("created_at", to);

  if (error) throw new Error(`Failed to fetch usage: ${error.message}`);

  const rows = data ?? [];

  const byModelMap = new Map<
    string,
    {
      model: string;
      provider: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costMicrocents: number;
      requestCount: number;
    }
  >();

  let totalTokens = 0;
  let totalCostMicrocents = 0;

  for (const row of rows) {
    totalTokens += row.total_tokens;
    totalCostMicrocents += Number(row.cost_microcents);

    const existing = byModelMap.get(row.model);
    if (existing) {
      existing.promptTokens += row.prompt_tokens;
      existing.completionTokens += row.completion_tokens;
      existing.totalTokens += row.total_tokens;
      existing.costMicrocents += Number(row.cost_microcents);
      existing.requestCount += 1;
    } else {
      byModelMap.set(row.model, {
        model: row.model,
        provider: row.provider,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
        totalTokens: row.total_tokens,
        costMicrocents: Number(row.cost_microcents),
        requestCount: 1,
      });
    }
  }

  return {
    totalTokens,
    totalCostMicrocents,
    byModel: Array.from(byModelMap.values()).sort(
      (a, b) => b.costMicrocents - a.costMicrocents,
    ),
  };
}
