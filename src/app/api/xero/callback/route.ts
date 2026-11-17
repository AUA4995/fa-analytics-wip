import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { exchangeCode, listTenants, saveConnection } from "@/lib/xero/auth";
import { plainError } from "@/lib/plain-error";

export const dynamic = "force-dynamic";

function back(request: Request, params: Record<string, string>) {
  // Prefer APP_URL so the redirect never carries a bind address such as 0.0.0.0.
  const url = new URL("/settings", process.env.APP_URL || request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.hash = "connections";
  return Response.redirect(url.toString(), 302);
}

/** OAuth 2.0 redirect target. Exchanges the code and stores the (encrypted) tokens. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "OWNER") return back(request, { xero: "error", message: "Only an owner can connect Xero — sign in as an owner and try again." });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const jar = await cookies();
  const expected = jar.get("xero_oauth_state")?.value;
  jar.delete("xero_oauth_state");

  if (error) return back(request, { xero: "error", message: url.searchParams.get("error_description") ?? error });
  if (!code || !state || !expected || state !== expected) {
    return back(request, { xero: "error", message: "State mismatch — please try connecting again." });
  }

  try {
    const tokens = await exchangeCode(code);
    const tenants = await listTenants(tokens.accessToken);
    if (tenants.length === 0) {
      return back(request, { xero: "error", message: "No Xero organisation was authorised." });
    }
    const chosen = tenants[0];
    await saveConnection(chosen, tokens);
    // Batch 2 item 15: a fresh connection clears the old "login expired" style problem.
    await import("@/lib/integrations/status").then((s) => s.clearStatus("xero")).catch(() => {});
    const note = tenants.length > 1 ? ` (${tenants.length} organisations authorised — connected the first; reconnect and pick only one to change)` : "";
    return back(request, { xero: "connected", message: `Connected to ${chosen.tenantName}${note}` });
  } catch (err) {
    return back(request, { xero: "error", message: plainError(err) });
  }
}
