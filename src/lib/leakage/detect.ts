import { prisma } from "@/lib/db";
import { getRules } from "@/lib/model/store";
import { buildInput } from "@/lib/cost/load";

/**
 * Leakage detection (brief §7), read-only against Xero and the WMS:
 *   Under-billing — per client per service per month: WMS volume × rate (CLM / Settings) vs billed in Xero
 *                   (lines mapped to the service by item code). Without item mapping: the client total instead.
 *   Weekly minimum — per client per week: invoice total (postage + processing) below the client's minimum, after any
 *                   levy period, and no top-up line → the top-up is the gap.
 * Gaps under the tolerance (Settings → Rules) are ignored. Runs are idempotent: a finding's status, cause, owner and
 * notes are never overwritten; open findings that disappear on a re-run are removed.
 */

export interface Finding {
  key: string;
  kind: "UNDER_BILLING" | "WEEKLY_MINIMUM";
  clientId: string;
  serviceCode: string | null;
  period: string;
  expected: number;
  billed: number;
  gap: number;
  working: string;
}

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
const n2 = (n: number) => n.toLocaleString("en-AU", { maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Pure: compare expected (volume × rate) with billed lines per service. */
export function compareService(p: { clientId: string; month: string; code: string; name: string; unit: string; qty: number; rate: number; billed: number; invoices: string[]; tolerance: number }): Finding | null {
  const expected = r2(p.qty * p.rate);
  const gap = r2(expected - p.billed);
  if (gap <= p.tolerance) return null;
  return {
    key: `UNDER_BILLING|${p.clientId}|${p.code}|${p.month}`,
    kind: "UNDER_BILLING",
    clientId: p.clientId,
    serviceCode: p.code,
    period: p.month,
    expected,
    billed: r2(p.billed),
    gap,
    working: `Should bill = ${n2(p.qty)} ${p.unit}s (WMS) × ${aud(p.rate)} (rate) = ${aud(expected)} · Billed in Xero = ${aud(p.billed)}${p.invoices.length ? ` (${p.invoices.slice(0, 6).join(", ")}${p.invoices.length > 6 ? "…" : ""})` : " (no lines for this service)"} · Gap = ${aud(gap)}`,
  };
}

/** ISO week "2026-W37" of a date. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const wk = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(wk).padStart(2, "0")}`;
}

/** Monday (YYYY-MM-DD) of an ISO week "2026-W37". */
export function weekMonday(week: string): string {
  const [y, w] = week.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const mon = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000 + (w - 1) * 7 * 86400000);
  return mon.toISOString().slice(0, 10);
}

/** Pure: weekly totals below the minimum without a top-up line. */
export function weeklyMinimumFindings(p: { clientId: string; minimum: number; levyUntil: string | null; invoices: Array<{ number: string | null; date: string; total: number; hasTopUp: boolean }>; tolerance: number }): Finding[] {
  const weeks = new Map<string, { total: number; numbers: string[]; topUp: boolean; first: string }>();
  for (const i of p.invoices) {
    if (p.levyUntil && i.date <= p.levyUntil) continue;
    const w = isoWeek(new Date(i.date + "T00:00:00Z"));
    const cur = weeks.get(w) ?? { total: 0, numbers: [], topUp: false, first: i.date };
    cur.total += i.total;
    if (i.number) cur.numbers.push(i.number);
    cur.topUp ||= i.hasTopUp;
    weeks.set(w, cur);
  }
  const out: Finding[] = [];
  for (const [w, x] of weeks) {
    if (x.topUp) continue;
    const gap = r2(p.minimum - x.total);
    if (gap <= p.tolerance) continue;
    out.push({
      key: `WEEKLY_MINIMUM|${p.clientId}||${w}`,
      kind: "WEEKLY_MINIMUM",
      clientId: p.clientId,
      serviceCode: null,
      period: w,
      expected: p.minimum,
      billed: r2(x.total),
      gap,
      working: `Week ${w}: invoiced ${aud(x.total)} (postage + processing${x.numbers.length ? `, ${x.numbers.join(", ")}` : ""}) · Weekly minimum ${aud(p.minimum)} → top-up ${aud(gap)} · No top-up line in Xero`,
    });
  }
  return out;
}

export async function detectMonth(month: string): Promise<Finding[]> {
  const rules = await getRules();
  const tolerance = rules.tolerance ?? 5;
  const { input } = await buildInput(month);
  const from = new Date(`${month}-01T00:00:00Z`);
  const [y, m] = month.split("-").map(Number);
  const to = new Date(Date.UTC(y, m, 1));
  const [clients, itemMaps, accMaps] = await Promise.all([prisma.client.findMany({ where: { status: { not: "INACTIVE" } } }), prisma.xeroItemMap.findMany(), prisma.xeroAccountMap.findMany({ where: { side: "INCOME" } })]);
  const svc = new Map(input.services.map((s) => [s.code, s]));
  const itemSvc = new Map(itemMaps.filter((i) => i.serviceCode && !i.excluded).map((i) => [i.itemCode, i.serviceCode!]));
  const excludedItems = new Set(itemMaps.filter((i) => i.excluded).map((i) => i.itemCode));
  const processing = new Set(accMaps.filter((a) => a.treatment === "INCLUDE").map((a) => a.accountCode));
  const findings: Finding[] = [];
  for (const ec of input.clients) {
    const c = clients.find((x) => x.id === ec.id);
    if (!c?.xeroContactId) continue;
    const sales = await prisma.xeroSale.findMany({ where: { contactId: c.xeroContactId, date: { gte: from, lt: to }, status: { in: ["AUTHORISED", "PAID"] } }, include: { lines: true } });
    const byService = new Map<string, { amount: number; invoices: Set<string> }>();
    let anyMapped = false;
    let processingBilled = 0;
    for (const s of sales)
      for (const l of s.lines) {
        if (l.itemCode && excludedItems.has(l.itemCode)) continue;
        if (l.accountCode && processing.has(l.accountCode)) processingBilled += Number(l.amount);
        const code = l.itemCode ? itemSvc.get(l.itemCode) : undefined;
        if (!code) continue;
        anyMapped = true;
        const cur = byService.get(code) ?? { amount: 0, invoices: new Set<string>() };
        cur.amount += Number(l.amount);
        if (s.number) cur.invoices.add(s.number);
        byService.set(code, cur);
      }
    const qtyByCode = new Map<string, number>();
    for (const v of ec.volumes) qtyByCode.set(v.serviceCode, (qtyByCode.get(v.serviceCode) ?? 0) + v.qty);
    if (anyMapped) {
      for (const [code, qty] of qtyByCode) {
        const s = svc.get(code);
        const rate = ec.rates[code];
        if (!s?.billable || rate == null || !qty) continue;
        const b = byService.get(code);
        const f = compareService({ clientId: c.id, month, code, name: s.name, unit: s.unit, qty, rate, billed: b?.amount ?? 0, invoices: [...(b?.invoices ?? [])], tolerance });
        if (f) findings.push(f);
      }
    } else if (processing.size) {
      // No item mapping for this client's lines: compare the client total of rated services with processing billed
      const rated = [...qtyByCode].filter(([code]) => svc.get(code)?.billable && ec.rates[code] != null);
      if (rated.length) {
        const expected = r2(rated.reduce((a, [code, q]) => a + q * ec.rates[code], 0));
        const gap = r2(expected - processingBilled);
        if (gap > tolerance)
          findings.push({
            key: `UNDER_BILLING|${c.id}||${month}`,
            kind: "UNDER_BILLING",
            clientId: c.id,
            serviceCode: null,
            period: month,
            expected,
            billed: r2(processingBilled),
            gap,
            working: `Rated services (WMS volume × rate): ${rated.map(([code, q]) => `${code} ${n2(q)} × ${aud(ec.rates[code])}`).join(" + ")} = ${aud(expected)} · Processing billed in Xero = ${aud(processingBilled)} · Gap = ${aud(gap)} (Xero item codes aren't mapped to services yet, so this is the client total)`,
          });
      }
    }
  }
  // Weekly minimum (all clients with one, whether or not they had WMS volumes). Weeks belong to the month of their Monday.
  const wFrom = new Date(from.getTime() - 6 * 86400000);
  const wTo = new Date(to.getTime() + 6 * 86400000);
  for (const c of clients) {
    if (c.weeklyMinimum == null || !c.xeroContactId) continue;
    const sales = await prisma.xeroSale.findMany({ where: { contactId: c.xeroContactId, kind: "INVOICE", date: { gte: wFrom, lt: wTo }, status: { in: ["AUTHORISED", "PAID"] } }, include: { lines: true } });
    const topUpItems = new Set(itemMaps.filter((i) => i.serviceCode && /MIN/i.test(i.serviceCode)).map((i) => i.itemCode));
    findings.push(
      ...weeklyMinimumFindings({
        clientId: c.id,
        minimum: Number(c.weeklyMinimum),
        levyUntil: c.levyUntil ? c.levyUntil.toISOString().slice(0, 10) : null,
        tolerance,
        invoices: sales.map((s) => ({ number: s.number, date: s.date.toISOString().slice(0, 10), total: Number(s.total), hasTopUp: s.lines.some((l) => (l.itemCode && topUpItems.has(l.itemCode)) || /minimum|top.?up/i.test(l.description ?? "")) })),
      }).filter((f) => weekMonday(f.period).slice(0, 7) === month),
    );
  }
  return findings;
}

/** Detect and save for the given months. Returns counts. */
export async function runDetection(months: string[], by: string | null = null): Promise<{ found: number; added: number; updated: number; removed: number }> {
  const run = await prisma.sourceRun.create({ data: { source: "leakage", label: `detection ${months.join(", ")}`, startedBy: by } });
  try {
    let added = 0;
    let updated = 0;
    let removed = 0;
    let found = 0;
    for (const month of months) {
      const fs = await detectMonth(month);
      found += fs.length;
      const keys = new Set(fs.map((f) => f.key));
      for (const f of fs) {
        const cur = await prisma.leakageItem.findUnique({ where: { key: f.key } });
        if (!cur) {
          await prisma.leakageItem.create({ data: { ...f } });
          added++;
        } else if (cur.status === "OPEN" || cur.status === "TASK") {
          await prisma.leakageItem.update({ where: { key: f.key }, data: { expected: f.expected, billed: f.billed, gap: f.gap, working: f.working } });
          updated++;
        }
      }
      // Open findings for this month (and its weeks) that no longer show up were fixed in the source
      const [yy, mm] = month.split("-").map(Number);
      const weeks = new Set<string>();
      for (let d = new Date(Date.UTC(yy, mm - 1, 1)); d.getUTCMonth() === mm - 1; d = new Date(d.getTime() + 86400000)) weeks.add(isoWeek(d));
      const stale = await prisma.leakageItem.findMany({ where: { status: "OPEN", imported: false, OR: [{ period: month }, { period: { in: [...weeks] } }] }, select: { key: true } });
      const gone = stale.filter((s) => !keys.has(s.key)).map((s) => s.key);
      if (gone.length) removed += (await prisma.leakageItem.deleteMany({ where: { key: { in: gone } } })).count;
    }
    const stats = { found, added, updated, removed };
    await prisma.sourceRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), stats } });
    return stats;
  } catch (err) {
    await prisma.sourceRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}

export function recentMonths(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
}
