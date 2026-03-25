import { NextResponse } from "next/server";

const PUBLIC_KEY = process.env.ANIMCLAW_PUBLIC_KEY ?? "";

type GatewayAuthResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Authenticate an incoming gateway request via Bearer token.
 * Validates against the single shared ANIMCLAW_PUBLIC_KEY env var.
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

  if (!PUBLIC_KEY || token !== PUBLIC_KEY) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { message: "Invalid API key", type: "invalid_request_error" } },
        { status: 401 },
      ),
    };
  }

  return { ok: true };
}
