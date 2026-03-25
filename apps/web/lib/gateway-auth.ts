import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type GatewayAuthResult =
  | { ok: true; userId: string; apiKeyId: string }
  | { ok: false; response: NextResponse };

/**
 * Authenticate an incoming gateway request via Bearer token.
 * Hashes the token with SHA-256 and looks it up in public.api_keys.
 */
export async function authenticateGatewayRequest(
  req: Request,
): Promise<GatewayAuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { message: "Missing or invalid Authorization header", type: "invalid_request_error" } },
        { status: 401 },
      ),
    };
  }

  const token = authHeader.slice(7);
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const { data: apiKey, error } = await supabase
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", tokenHash)
    .is("revoked_at", null)
    .single();

  if (error || !apiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { message: "Invalid API key", type: "invalid_request_error" } },
        { status: 401 },
      ),
    };
  }

  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKey.id)
    .then(() => {});

  return { ok: true, userId: apiKey.user_id, apiKeyId: apiKey.id };
}
