import { prisma } from "@/lib/db";

/** "Request access" is only for company emails (Batch 2 item 30). Setting "accessRequestDomain", editable in Settings → Company. */
export const DEFAULT_ACCESS_DOMAIN = "fulfilmentaustralia.com.au";
const SETTING_KEY = "accessRequestDomain";

/** "@FulfilmentAustralia.com.au " → "fulfilmentaustralia.com.au"; null when it isn't a domain. */
export function normaliseDomain(input: string | null | undefined): string | null {
  const d = String(input ?? "").trim().toLowerCase().replace(/^@/, "");
  if (d.length > 120) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d) ? d : null;
}

/** Exact domain only — "x@mail.fulfilmentaustralia.com.au" or "x@fulfilmentaustralia.com.au.evil.com" don't count. */
export function emailInDomain(email: string, domain: string): boolean {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0 || e.indexOf("@") !== at) return false;
  return e.slice(at + 1) === domain.toLowerCase();
}

export async function getAccessDomain(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } }).catch(() => null);
  return normaliseDomain(typeof row?.value === "string" ? row.value : null) ?? DEFAULT_ACCESS_DOMAIN;
}

export async function setAccessDomain(input: string): Promise<string> {
  const d = normaliseDomain(input);
  if (!d) throw new Error("Enter a domain like fulfilmentaustralia.com.au");
  await prisma.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: d }, update: { value: d } });
  return d;
}
