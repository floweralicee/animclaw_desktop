import { NextResponse } from "next/server";
import { authenticateGatewayRequest } from "@/lib/gateway-auth";
import { getUsageSummaryExtended } from "@/lib/usage";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function parseRangeDays(searchParams: URLSearchParams): { from: string; to: string; days: number } {
  const raw = searchParams.get("range") ?? searchParams.get("days") ?? "30d";
  let days = 30;
  const m = /^(\d+)d$/.exec(raw.trim());
  if (m) {
    days = Math.min(365, Math.max(1, parseInt(m[1]!, 10)));
  } else if (/^\d+$/.test(raw)) {
    days = Math.min(365, Math.max(1, parseInt(raw, 10)));
  }

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    days,
  };
}

/**
 * GET /api/usage/summary?range=30d
 * Authenticated via the same Bearer API key as the chat gateway.
 */
export async function GET(req: Request) {
  const authResult = await authenticateGatewayRequest(req);
  if (!authResult.ok) {
    const res = authResult.response;
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      headers.set(k, v);
    }
    return new NextResponse(res.body, { status: res.status, headers });
  }

  const { userId } = authResult;
  const { searchParams } = new URL(req.url);
  const { from, to, days } = parseRangeDays(searchParams);

  try {
    const summary = await getUsageSummaryExtended(userId, from, to);
    return NextResponse.json(
      {
        range: { from, to, days },
        total_tokens: summary.totalTokens,
        total_cost_microcents: summary.totalCostMicrocents,
        total_cost_usd: summary.totalCostMicrocents / 1_000_000,
        by_model: summary.byModel,
        by_tier: summary.byTier,
        auto_routed: summary.autoRouted,
      },
      { headers: corsHeaders },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[usage/summary]", message);
    return NextResponse.json(
      { error: { message: "Failed to load usage summary", detail: message } },
      { status: 500, headers: corsHeaders },
    );
  }
}
