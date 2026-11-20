/** Paths reachable without signing in. Everything else needs a (2FA-complete) session. */
const PUBLIC_EXACT = new Set([
  "/login",
  "/setup",
  "/api/health",
  "/api/company/logo",
  "/favicon.ico",
  // Batch 2: 2FA step (needs the half-done sign-in cookie, checked on the page), email links, request access
  "/login/verify",
  "/login/setup-2fa",
  "/forgot-password",
  "/reset-password",
  "/set-password",
  "/request-access",
  "/access/approve",
  "/access/decline",
  // Vercel Cron (batch 7): checked by CRON_SECRET inside the handler
  "/api/cron/tick",
]);
// /api/v1/ is authenticated by API key inside each handler (lib/apikeys), not by the session cookie
const PUBLIC_PREFIXES = ["/_next/", "/brand/", "/api/v1/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

const NO_RETURN = ["/login", "/setup", "/forgot-password", "/reset-password", "/set-password", "/request-access", "/access/"];

/** Only allow same-site relative redirects after login (no open redirects, never back to a sign-in page). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (NO_RETURN.some((p) => next.startsWith(p))) return "/";
  return next;
}
