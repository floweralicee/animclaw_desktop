import { NextResponse } from "next/server";
import { validateApiKey, touchKeyUsage, type ValidatedKey } from "./api-keys";
import { isSubscriptionActive } from "./subscription";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type GatewayAuthResult =
  | { ok: true; userId: string; apiKeyId: string }
  | { ok: false; response: NextResponse };

/**
 * Authenticate an incoming gateway request via Bearer token.
 * Validates the API key and checks the user has an active subscription.
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
  let validated: ValidatedKey | null;
  try {
    validated = await validateApiKey(token);
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { message: "Internal authentication error", type: "api_error" } },
        { status: 500 },
      ),
    };
  }

  if (!validated) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { message: "Invalid API key", type: "invalid_request_error" } },
        { status: 401 },
      ),
    };
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", validated.userId)
    .single();

  if (!isSubscriptionActive(sub?.status)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { message: "Active subscription required. Subscribe at animclaw.com/subscribe", type: "invalid_request_error" } },
        { status: 403 },
      ),
    };
  }

  touchKeyUsage(validated.apiKeyId);

  return { ok: true, userId: validated.userId, apiKeyId: validated.apiKeyId };
}
