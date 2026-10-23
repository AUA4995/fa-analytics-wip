import { prisma } from "@/lib/db";

/**
 * Who may receive which report (brief §10): addresses only from Settings → Contacts & recipients.
 *   Internal      → Internal list or the internal domains
 *   Client-safe   → that client's contacts only
 *   External      → Lenders & advisers only, and only after approval
 */
export async function internalDomains(): Promise<string[]> {
  const s = await prisma.setting.findUnique({ where: { key: "internalDomains" } });
  return Array.isArray(s?.value) ? (s.value as string[]) : ["fulfilmentaustralia.com.au"];
}

export interface Check {
  email: string;
  ok: boolean;
  why?: string;
}

export async function checkRecipients(r: { cls: string; clientId: string | null; approvedAt: Date | null }, emails: string[]): Promise<Check[]> {
  const [list, domains] = await Promise.all([prisma.recipient.findMany(), internalDomains()]);
  return emails.map((raw) => {
    const email = raw.trim().toLowerCase();
    const rec = list.filter((x) => x.email.toLowerCase() === email);
    const internal = rec.some((x) => x.list === "INTERNAL") || domains.some((d) => email.endsWith("@" + d.toLowerCase()));
    if (r.cls === "INTERNAL") return internal ? { email, ok: true } : { email, ok: false, why: rec.length ? "not on the Internal list" : "not on any list" };
    if (r.cls === "CLIENT_SAFE") {
      const mine = rec.some((x) => x.list === "CLIENT" && x.clientId === r.clientId);
      return mine ? { email, ok: true } : { email, ok: false, why: rec.some((x) => x.list === "CLIENT") ? "a different client's contact" : internal ? "internal — not the client" : "not on any list" };
    }
    if (r.cls === "EXTERNAL") {
      if (!rec.some((x) => x.list === "LENDER")) return { email, ok: false, why: "not on Lenders & advisers" };
      return r.approvedAt ? { email, ok: true } : { email, ok: false, why: "needs approval first" };
    }
    return { email, ok: false, why: "unknown report type" };
  });
}

/** Everything a report of this type could be sent to (for the recipients dropdown). */
export async function allowedFor(r: { cls: string; clientId: string | null }): Promise<Array<{ email: string; name: string; group: string }>> {
  const list = await prisma.recipient.findMany({ orderBy: [{ list: "asc" }, { name: "asc" }] });
  return list
    .filter((x) => (r.cls === "INTERNAL" ? x.list === "INTERNAL" : r.cls === "CLIENT_SAFE" ? x.list === "CLIENT" && x.clientId === r.clientId : x.list === "LENDER"))
    .map((x) => ({ email: x.email, name: x.name, group: x.list === "INTERNAL" ? "Internal" : x.list === "CLIENT" ? "Client" : "Lenders & advisers" }));
}
