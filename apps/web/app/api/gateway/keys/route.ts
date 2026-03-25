import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateApiKey, listApiKeys } from "@/lib/api-keys";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const keys = await listApiKeys(session.user.id);
    return NextResponse.json({ keys });
  } catch (err) {
    console.error("[gateway/keys] list error:", err);
    return NextResponse.json({ error: "Failed to list keys" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let name = "Default";
  try {
    const body = await req.json();
    if (body.name && typeof body.name === "string") {
      name = body.name.trim().slice(0, 64);
    }
  } catch {
    // empty body is fine, use default name
  }

  try {
    const result = await generateApiKey(session.user.id, name);
    return NextResponse.json({
      key: result.key,
      id: result.id,
      prefix: result.prefix,
      name,
    });
  } catch (err) {
    console.error("[gateway/keys] create error:", err);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
