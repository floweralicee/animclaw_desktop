import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const apiKey = (session as any).gatewayApiKey;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No API key found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ apiKey });
}
