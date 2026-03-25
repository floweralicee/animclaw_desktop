import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUsageSummary } from "@/lib/usage";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const now = new Date();
  const from =
    url.searchParams.get("from") ??
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = url.searchParams.get("to") ?? now.toISOString();

  try {
    const summary = await getUsageSummary(session.user.id, from, to);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[gateway/usage] error:", err);
    return NextResponse.json({ error: "Failed to fetch usage" }, { status: 500 });
  }
}
