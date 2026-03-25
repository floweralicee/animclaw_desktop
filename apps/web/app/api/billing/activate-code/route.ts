import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const code = body?.code?.trim();
  if (!code) {
    return NextResponse.json({ error: "Code is required" }, { status: 400 });
  }

  const hash = hashCode(code);
  const userId = session.user.id;

  const { data: bypassCode } = await supabase
    .from("bypass_codes")
    .select("id, max_uses, uses_count, active, expires_at")
    .eq("code_hash", hash)
    .single();

  if (!bypassCode) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  if (!bypassCode.active) {
    return NextResponse.json({ error: "This code is no longer active" }, { status: 400 });
  }

  if (bypassCode.expires_at && new Date(bypassCode.expires_at) < new Date()) {
    return NextResponse.json({ error: "This code has expired" }, { status: 400 });
  }

  if (bypassCode.uses_count >= bypassCode.max_uses) {
    return NextResponse.json({ error: "This code has reached its usage limit" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("bypass_code_redemptions")
    .select("id")
    .eq("code_id", bypassCode.id)
    .eq("user_id", userId)
    .single();

  if (existing) {
    return NextResponse.json({ error: "You have already redeemed this code" }, { status: 400 });
  }

  const { error: redemptionError } = await supabase
    .from("bypass_code_redemptions")
    .insert({ code_id: bypassCode.id, user_id: userId });

  if (redemptionError) {
    console.error("Redemption insert failed:", redemptionError);
    return NextResponse.json({ error: "Failed to redeem code" }, { status: 500 });
  }

  await supabase
    .from("bypass_codes")
    .update({ uses_count: bypassCode.uses_count + 1 })
    .eq("id", bypassCode.id);

  const farFuture = new Date("2099-12-31T23:59:59Z").toISOString();

  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      status: "active",
      current_period_end: farFuture,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return NextResponse.json({ success: true });
}
