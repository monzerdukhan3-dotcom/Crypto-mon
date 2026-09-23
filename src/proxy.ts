import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Every page and API route requires a signed-in visitor — the whole site is
 * private — with two carve-outs:
 *  - /admin (settings + account management) is restricted further to admin
 *    accounts only; a regular visitor account gets bounced back to the
 *    dashboard instead.
 *  - A logged-in non-admin account whose access_until has passed (trial or
 *    subscription lapsed — billing is manual via Telegram, not automated)
 *    is bounced to /pricing on every other route instead of the app itself.
 * A short public list (login/signup/pricing/track-record/legal pages, and
 * their own APIs) is excluded from this file entirely via `matcher` below,
 * so those stay reachable with no session at all.
 */
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAdmin = Boolean(req.auth?.user?.isAdmin);
  const accessUntil = req.auth?.user?.accessUntil ?? null;
  const hasAccess = isAdmin || accessUntil === null || new Date(accessUntil) > new Date();
  const isLoginPage = req.nextUrl.pathname === "/login";
  const isAdminRoute = req.nextUrl.pathname === "/admin" || req.nextUrl.pathname.startsWith("/api/admin");

  if (!isLoggedIn && !isLoginPage) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  if (isLoggedIn && isAdminRoute && !isAdmin) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  if (isLoggedIn && !hasAccess) {
    return NextResponse.redirect(new URL("/pricing", req.nextUrl.origin));
  }
});

export const config = {
  // Everything except NextAuth's own API routes, the fully-public pages
  // (login/signup/pricing/track-record/legal) and their own APIs, and
  // static assets — those all need to stay reachable with no session.
  matcher: [
    "/((?!api/auth|api/register|api/track-record|login|signup|pricing|track-record|terms|privacy|_next/static|_next/image|favicon.ico|logo-mark.png|apple-icon.png|icon.png).*)",
  ],
};
