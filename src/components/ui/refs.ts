/**
 * Reference numbers → links (brief §12.2). Pure, so screens and digest emails share it.
 * Tickets (AC-/SU-/SA-/DTSAC-) → the Front conversation. Invoices (INV-), credit notes (CN-) and bills → the Xero document.
 * A supplier invoice that is in Front but not in Xero → the Front email.
 */

export type RefKind = "front" | "front-email" | "xero-invoice" | "xero-credit-note" | "xero-bill";

export interface RefContext {
  /** Ticket number → Front conversation id (cnv_…) */
  tickets?: Record<string, string>;
  /** Sales invoice number → Xero InvoiceID */
  invoices?: Record<string, string>;
  /** Credit note number → Xero CreditNoteID */
  creditNotes?: Record<string, string>;
  /** Bill (supplier invoice) number → Xero InvoiceID. Only these bill numbers are linked. */
  bills?: Record<string, string>;
  /** Supplier invoice number found in Front but not in Xero → Front conversation id */
  notInXero?: Record<string, string>;
}

export interface RefMatch {
  text: string;
  kind: RefKind;
  url: string;
  title: string;
}

export const FRONT_OPEN_URL = "https://app.frontapp.com/open/";
/** Used when the app does not know the conversation id of a ticket yet. */
export const FRONT_SEARCH_URL = "https://app.frontapp.com/search/global?q=";
export const XERO_SEARCH_URL = "https://go.xero.com/Search/Search.aspx?q=";

export const TICKET_RE_SOURCE = "(?:DTSAC|AC|SU|SA)-\\d{3,}";

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function xeroInvoiceUrl(id: string): string {
  return `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(id)}`;
}
export function xeroBillUrlFor(id: string): string {
  return `https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=${encodeURIComponent(id)}`;
}
export function xeroCreditNoteUrl(id: string): string {
  return `https://go.xero.com/AccountsReceivable/ViewCreditNote.aspx?creditNoteID=${encodeURIComponent(id)}`;
}
export function xeroContactUrl(contactId: string): string {
  return `https://go.xero.com/Contacts/View/${encodeURIComponent(contactId)}`;
}

/** Resolve one reference to its link, or null when it is not a reference this context knows. */
export function resolveRef(ref: string, ctx: RefContext = {}): RefMatch | null {
  if (new RegExp(`^${TICKET_RE_SOURCE}$`).test(ref)) {
    const id = ctx.tickets?.[ref];
    return { text: ref, kind: "front", url: id ? FRONT_OPEN_URL + encodeURIComponent(id) : FRONT_SEARCH_URL + encodeURIComponent(ref), title: `Open ticket ${ref} in Front` };
  }
  if (ctx.notInXero?.[ref]) {
    return { text: ref, kind: "front-email", url: FRONT_OPEN_URL + encodeURIComponent(ctx.notInXero[ref]), title: "Not in Xero yet — open the email in Front" };
  }
  if (/^CN-\d{3,}$/.test(ref)) {
    const id = ctx.creditNotes?.[ref];
    return { text: ref, kind: "xero-credit-note", url: id ? xeroCreditNoteUrl(id) : XERO_SEARCH_URL + encodeURIComponent(ref), title: `Open credit note ${ref} in Xero` };
  }
  if (/^INV-\d{3,}$/.test(ref)) {
    const id = ctx.invoices?.[ref];
    return { text: ref, kind: "xero-invoice", url: id ? xeroInvoiceUrl(id) : XERO_SEARCH_URL + encodeURIComponent(ref), title: `Open invoice ${ref} in Xero` };
  }
  const bill = ctx.bills?.[ref];
  if (bill) return { text: ref, kind: "xero-bill", url: xeroBillUrlFor(bill), title: `Open bill ${ref} in Xero` };
  return null;
}

/** Build the matcher for a context (static patterns + the context's known bill / not-in-Xero numbers). */
export function refRegExp(ctx: RefContext = {}): RegExp {
  const extra = [...Object.keys(ctx.bills ?? {}), ...Object.keys(ctx.notInXero ?? {})]
    .filter((s) => s.trim().length >= 3)
    .sort((a, b) => b.length - a.length)
    .map(escRe);
  const alts = [TICKET_RE_SOURCE, "INV-\\d{3,}", "CN-\\d{3,}", ...extra];
  // Not part of a longer token, not a dollar amount ("$609.00"), not followed by a decimal.
  return new RegExp(`(?<![\\w$-])(${alts.join("|")})(?![\\w-]|\\.\\d)`, "g");
}

/** Split text into plain strings and reference links. */
export function linkifyRefs(text: string | null | undefined, ctx: RefContext = {}): Array<string | RefMatch> {
  const s = String(text ?? "");
  if (!s) return [];
  const re = refRegExp(ctx);
  const out: Array<string | RefMatch> = [];
  let last = 0;
  for (const m of s.matchAll(re)) {
    const ref = resolveRef(m[1], ctx);
    if (!ref) continue;
    const at = m.index ?? 0;
    if (at > last) out.push(s.slice(last, at));
    out.push(ref);
    last = at + m[1].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Same as linkifyRefs but as escaped HTML with the shared link style (for digest emails). */
export function linkifyRefsHtml(text: string | null | undefined, ctx: RefContext = {}, colour = "#1F54EE"): string {
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return linkifyRefs(text, ctx)
    .map((p) =>
      typeof p === "string"
        ? esc(p)
        : `<a href="${esc(p.url)}" title="${esc(p.title)}" style="color:${colour};text-decoration:none;border-bottom:1px dotted ${colour};">${esc(p.text)}</a>`,
    )
    .join("");
}
