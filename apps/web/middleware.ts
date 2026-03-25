import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isSubscriptionActive } from "@/lib/subscription";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/billing/webhook", "/checkout", "/api/v1"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname) || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const session = req.auth;

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const subStatus = (session as any).subscriptionStatus;
  if (!isSubscriptionActive(subStatus) && !pathname.startsWith("/subscribe") && !pathname.startsWith("/api/billing")) {
    return NextResponse.redirect(new URL("/subscribe", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
