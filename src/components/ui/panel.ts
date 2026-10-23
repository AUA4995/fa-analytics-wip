/**
 * Details panel addressing: `?panel=<kind>:<id>` (brief §12.1a). Pure helpers shared by server pages
 * (to decide what to render in the Drawer) and client rows (to open it).
 */
export interface PanelRef {
  kind: string;
  id: string;
}

export function parsePanel(raw: string | string[] | null | undefined): PanelRef | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  const at = v.indexOf(":");
  if (at <= 0 || at === v.length - 1) return null;
  const kind = v.slice(0, at);
  if (!/^[a-z][a-z-]{0,29}$/.test(kind)) return null;
  return { kind, id: v.slice(at + 1) };
}

export function panelValue(kind: string, id: string): string {
  return `${kind}:${id}`;
}

/** Same URL with the panel set (or removed when `panel` is null). Keeps every other query param. */
export function withPanel(pathname: string, search: string | URLSearchParams, panel: string | null): string {
  const sp = new URLSearchParams(typeof search === "string" ? search : search.toString());
  if (panel) sp.set("panel", panel);
  else sp.delete("panel");
  const q = sp.toString();
  return q ? `${pathname}?${q}` : pathname;
}

/** Pages that render the Front ticket panel in place (where the client panel opens); others go to the Front inbox. */
const TICKET_PANEL_IN_PLACE = new Set(["/receivables", "/"]);

/**
 * Where a client panel's ticket line opens: on the same page when it can show the ticket panel (filters kept, `back` =
 * the client panel it came from), else the Front inbox.
 */
export function ticketLineHref(pathname: string, search: string, ticketId: string): string {
  const panel = panelValue("ticket", ticketId);
  if (!TICKET_PANEL_IN_PLACE.has(pathname)) return `/front?panel=${encodeURIComponent(panel)}`;
  const q = new URLSearchParams(search);
  const current = q.get("panel");
  if (current && current.startsWith("client:")) q.set("back", current);
  else q.delete("back");
  return withPanel(pathname, q, panel);
}
