import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { SupabaseAdapter } from "@auth/supabase-adapter";
import { createClient } from "@supabase/supabase-js";
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
        try {
          await ensureApiKey(user.id);
        } catch (err) {
          console.error("[auth] Failed to provision API key:", err);
        }
      }
    },
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;

        const [subResult, keyResult] = await Promise.all([
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
        ]);

        (session as any).subscriptionStatus = subResult.data?.status ?? "inactive";
        (session as any).subscriptionEnd = subResult.data?.current_period_end ?? null;
        (session as any).gatewayApiKey = keyResult.data?.gateway_api_key ?? null;
      }
      return session;
    },
  },
});
