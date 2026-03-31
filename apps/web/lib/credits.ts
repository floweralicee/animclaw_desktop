import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// $5 = 500 cents = 5,000,000 microcents (1 microcent = 1/10,000 of a cent)
const FREE_CREDIT_MICROCENTS = 5_000_000;

export type CreditCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Check whether a user is allowed to make a gateway request.
 * Passes if the user has an active/trialing subscription OR has remaining free credits.
 */
export async function checkUserCredit(userId: string): Promise<CreditCheckResult> {
  const [subResult, usageResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("usage_logs")
      .select("cost_microcents")
      .eq("user_id", userId),
  ]);

  const status = subResult.data?.status;
  if (status === "active" || status === "trialing") {
    return { allowed: true };
  }

  const rows = usageResult.data ?? [];
  const totalSpentMicrocents = rows.reduce(
    (sum, r) => sum + Number(r.cost_microcents),
    0,
  );

  if (totalSpentMicrocents < FREE_CREDIT_MICROCENTS) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      "Your $5 free credits have been used. Please subscribe to continue using AnimClaw.",
  };
}

/**
 * Return the remaining free credit in microcents for a user.
 * Returns 0 if the user has an active subscription (unlimited usage).
 */
export async function getRemainingCreditMicrocents(userId: string): Promise<number> {
  const { data: usage } = await supabase
    .from("usage_logs")
    .select("cost_microcents")
    .eq("user_id", userId);

  const totalSpent = (usage ?? []).reduce(
    (sum, r) => sum + Number(r.cost_microcents),
    0,
  );

  return Math.max(0, FREE_CREDIT_MICROCENTS - totalSpent);
}

export { FREE_CREDIT_MICROCENTS };
