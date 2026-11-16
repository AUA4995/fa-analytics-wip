import { cookies } from "next/headers";
import { randomToken } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { XERO_AUTHORIZE_URL, XERO_SCOPES, assertReadOnlyScopes, xeroEnv } from "@/lib/xero/config";

export const dynamic = "force-dynamic";

/** Starts the Xero OAuth 2.0 flow (read-only scopes). */
export async function GET() {
  const user = await getCurrentUser();
  // Batch 2 item 15: connect / reconnect is owner-only.
  if (user?.role !== "OWNER") return new Response("Only an owner can connect Xero.", { status: 403 });
  assertReadOnlyScopes(XERO_SCOPES);
  const { clientId, redirectUri } = xeroEnv();
  const state = randomToken();
  const jar = await cookies();
  jar.set("xero_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });

  const url = new URL(XERO_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", XERO_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return Response.redirect(url.toString(), 302);
}
