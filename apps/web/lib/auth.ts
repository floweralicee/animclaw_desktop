import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { SupabaseAdapter } from "@auth/supabase-adapter";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import { FREE_CREDIT_MICROCENTS } from "@/lib/credits";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return "ac_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureStripeCustomerAndCreditGrant(
  userId: string,
  email: string | null | undefined,
  name: string | null | undefined,
): Promise<void> {
  const { data: existing } = await supabase
    .from("credit_grants")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (existing) return;

  let stripeCustomerId: string;
  try {
    const customer = await stripe.customers.create({
      email: email ?? undefined,
      name: name ?? undefined,
      metadata: { userId },
    });
    stripeCustomerId = customer.id;
  } catch (err) {
    console.error("[auth] Failed to create Stripe customer:", err);
    return;
  }

  let creditGrantId: string | null = null;
  try {
    const grant = await stripe.billing.creditGrants.create({
      customer: stripeCustomerId,
      amount: {
        type: "monetary",
        monetary: { value: 500, currency: "usd" },
      },
      applicability_config: { scope: { price_type: "metered" } },
      category: "promotional",
      name: "Welcome Credits",
    });
    creditGrantId = grant.id;
  } catch (err) {
    console.error("[auth] Failed to create Stripe credit grant:", err);
  }

  await supabase.from("credit_grants").insert({
    user_id: userId,
    stripe_customer_id: stripeCustomerId,
    stripe_credit_grant_id: creditGrantId,
    amount_cents: 500,
  });
}

async function ensureApiKey(userId: string): Promise<string> {
  const { data: existingUser } = await supabase
    .schema("next_auth")
    .from("users")
    .select("gateway_api_key")
    .eq("id", userId)
    .single();

  if (existingUser?.gateway_api_key) {
    return existingUser.gateway_api_key;
  }

  const rawKey = generateApiKey();
  const keyHash = await hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 8) + "...";

  await supabase.from("api_keys").insert({
    user_id: userId,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    name: "Default",
  });

  await supabase
    .schema("next_auth")
    .from("users")
    .update({ gateway_api_key: rawKey })
    .eq("id", userId);

  return rawKey;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  logger: {
    error(error) {
      console.error("[auth][detail]", error);
    },
  },
  adapter: SupabaseAdapter({
    url: process.env.SUPABASE_URL!,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: { prompt: "select_account" },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  events: {
    async signIn({ user }) {
      if (user.id) {
        await Promise.allSettled([
          ensureApiKey(user.id).catch((err) =>
            console.error("[auth] Failed to provision API key:", err),
          ),
          ensureStripeCustomerAndCreditGrant(user.id, user.email, user.name).catch(
            (err) => console.error("[auth] Failed to provision Stripe customer:", err),
          ),
        ]);
      }
    },
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;

        const [subResult, keyResult, usageResult] = await Promise.all([
          supabase
            .from("subscriptions")
            .select("status, current_period_end")
            .eq("user_id", user.id)
            .single(),
          supabase
            .schema("next_auth")
            .from("users")
            .select("gateway_api_key")
            .eq("id", user.id)
            .single(),
          supabase
            .from("usage_logs")
            .select("cost_microcents")
            .eq("user_id", user.id),
        ]);

        const totalSpentMicrocents = (usageResult.data ?? []).reduce(
          (sum, r) => sum + Number(r.cost_microcents),
          0,
        );

        (session as any).subscriptionStatus = subResult.data?.status ?? "inactive";
        (session as any).subscriptionEnd = subResult.data?.current_period_end ?? null;
        (session as any).gatewayApiKey = keyResult.data?.gateway_api_key ?? null;
        (session as any).hasFreeCredits = totalSpentMicrocents < FREE_CREDIT_MICROCENTS;
      }
      return session;
    },
  },
});
