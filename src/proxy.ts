import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/** Every page and API route requires a signed-in visitor — the whole site is private. */
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/login";

  if (!isLoggedIn && !isLoginPage) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  // Everything except NextAuth's own API routes, the login page itself, and
  // static assets — those all need to stay reachable pre-login.
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico|logo-mark.png|apple-icon.png|icon.png).*)"],
};
