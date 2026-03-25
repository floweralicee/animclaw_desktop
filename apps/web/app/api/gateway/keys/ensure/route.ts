import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureDefaultApiKey } from "@/lib/api-keys";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await ensureDefaultApiKey(session.user.id);
    if (!result) {
      return NextResponse.json({ created: false });
    }
    return NextResponse.json({
      created: true,
      key: result.key,
      id: result.id,
      prefix: result.prefix,
    });
  } catch (err) {
    console.error("[gateway/keys/ensure] error:", err);
    return NextResponse.json({ error: "Failed to ensure key" }, { status: 500 });
  }
}
