import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/auth/paths";

/** Same value as SESSION_COOKIE in src/lib/auth/session.ts (that module is server-only). */
const SESSION_COOKIE_NAME = "fan_session";

/**
 * Optimistic gate: no session cookie → redirect to /login.
 * Real validation (expiry, deactivated users, roles) happens in requireUser()/assertUser().
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE_NAME)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
