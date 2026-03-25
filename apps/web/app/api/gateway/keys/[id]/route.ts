import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { revokeApiKey } from "@/lib/api-keys";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const revoked = await revokeApiKey(session.user.id, id);
    if (!revoked) {
      return NextResponse.json({ error: "Key not found or already revoked" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[gateway/keys] revoke error:", err);
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }
}
