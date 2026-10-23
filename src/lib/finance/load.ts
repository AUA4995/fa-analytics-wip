import { prisma } from "@/lib/db";
import { seasonalForecast } from "@/lib/reports/data";
import { AGE_BUCKETS, ageBucket, anonName, balanceByMonth, classify, pnlByMonth, ratios, type Bal, type Line, type Month } from "./calc";

export const monthLabel = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-AU", { month: "short", year: "2-digit", timeZone: "UTC" });
export const addMonth = (m: string, k: number) => {
  const d = new Date(m + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + k);
  return d.toISOString().slice(0, 7);
};

export interface FinanceData {
  months: Month[];
  /** Last complete month with P&L data */
  current: string | null;
  bal: Bal[];
  debts: Awaited<ReturnType<typeof prisma.debtFacility.findMany>>;
  debtBalance: number | null;
  principal12: number;
  forecast: Array<{ month: string; value: number; low: number; high: number }> | null;
  /** Account detail: line → account → month → amount */
  accounts: Array<{ id: string; name: string; line: Line; byMonth: Record<string, number> }>;
  hasBalance: boolean;
}

export async function loadFinance(now = new Date()): Promise<FinanceData> {
  const thisMonth = now.toISOString().slice(0, 7);
  const [pnlRows, balRows, types, debts] = await Promise.all([
    prisma.xeroPnl.findMany({ where: { month: { lt: thisMonth } } }),
    prisma.xeroBalance.findMany({ where: { month: { lt: thisMonth } } }),
    prisma.xeroAccount.findMany({ select: { xeroId: true, type: true } }),
    prisma.debtFacility.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  const typeOf = new Map(types.map((t) => [t.xeroId, t.type]));
  const rows = pnlRows.map((r) => ({ month: r.month, accountId: r.accountId, accountName: r.accountName, section: r.section, amount: Number(r.amount), type: typeOf.get(r.accountId) ?? null }));
  const months = pnlByMonth(rows);
  const acc = new Map<string, { id: string; name: string; line: Line; byMonth: Record<string, number> }>();
  for (const r of rows) {
    const a = acc.get(r.accountId) ?? { id: r.accountId, name: r.accountName, line: classify(r), byMonth: {} };
    a.byMonth[r.month] = (a.byMonth[r.month] ?? 0) + r.amount;
    acc.set(r.accountId, a);
  }
  const bal = balanceByMonth(balRows.map((b) => ({ month: b.month, accountName: b.accountName, section: b.section, amount: Number(b.amount) })));
  const current = months.length ? months[months.length - 1].month : null;
  const rev = months.map((m) => m.revenue);
  const f = seasonalForecast(rev, 6);
  return {
    months,
    current,
    bal,
    debts,
    debtBalance: debts.length ? debts.reduce((a, d) => a + Number(d.balance), 0) : null,
    principal12: debts.reduce((a, d) => a + Number(d.principalMonthly) * 12, 0),
    forecast: f && current ? f.map((x, i) => ({ month: addMonth(current, i + 1), ...x })) : null,
    accounts: [...acc.values()],
    hasBalance: bal.length > 0,
  };
}

export function lastN(months: Month[], n: number, upTo?: string | null): Month[] {
  const idx = upTo ? months.findIndex((m) => m.month === upTo) : months.length - 1;
  return idx < 0 ? [] : months.slice(Math.max(0, idx - n + 1), idx + 1);
}

export function ratiosAt(d: FinanceData, month: string | null) {
  const last12 = lastN(d.months, 12, month);
  const bal = d.bal.find((b) => b.month === month) ?? null;
  return ratios(last12, bal, d.debtBalance != null ? { balance: d.debtBalance, principal12: d.principal12 } : bal ? { balance: bal.debt, principal12: 0 } : null);
}

/** Aged receivables / payables from open invoices and bills (read-only; chasing stays in the Accounts Hub). */
export async function aged(today = new Date()) {
  const [sales, bills, contacts, clients] = await Promise.all([
    prisma.xeroSale.findMany({ where: { kind: "INVOICE", amountDue: { gt: 0 } }, select: { contactId: true, dueDate: true, amountDue: true } }),
    prisma.xeroBill.findMany({ where: { amountDue: { gt: 0 } }, select: { contactId: true, dueDate: true, amountDue: true } }),
    prisma.xeroContact.findMany({ select: { xeroId: true, name: true } }),
    prisma.client.findMany({ select: { xeroContactId: true, name: true, id: true } }),
  ]);
  const cname = new Map(contacts.map((c) => [c.xeroId, c.name]));
  const group = (rows: Array<{ contactId: string; dueDate: Date | null; amountDue: unknown }>) => {
    const totals = AGE_BUCKETS.map(() => 0);
    const by = new Map<string, number[]>();
    for (const r of rows) {
      const b = ageBucket(r.dueDate, today);
      const v = Number(r.amountDue);
      totals[b] += v;
      const arr = by.get(r.contactId) ?? AGE_BUCKETS.map(() => 0);
      arr[b] += v;
      by.set(r.contactId, arr);
    }
    const list = [...by.entries()].map(([id, b]) => ({ id, name: cname.get(id) ?? clients.find((c) => c.xeroContactId === id)?.name ?? id, buckets: b, total: b.reduce((a, x) => a + x, 0), overdue: b.slice(1).reduce((a, x) => a + x, 0) })).sort((a, b) => b.overdue - a.overdue || b.total - a.total);
    return { totals, total: totals.reduce((a, x) => a + x, 0), list };
  };
  return { ar: group(sales), ap: group(bills), any: sales.length + bills.length > 0 };
}

/** Client concentration on Xero sales (last 12 complete months). Names hidden unless `show`. */
export async function concentration(now = new Date(), show = false) {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), 1));
  const [sales, clients, contacts] = await Promise.all([
    prisma.xeroSale.groupBy({ by: ["contactId"], where: { date: { gte: from, lt: to }, status: { in: ["AUTHORISED", "PAID"] } }, _sum: { total: true } }),
    prisma.client.findMany({ select: { xeroContactId: true, name: true } }),
    prisma.xeroContact.findMany({ select: { xeroId: true, name: true } }),
  ]);
  const total = sales.reduce((a, s) => a + Number(s._sum.total ?? 0), 0);
  const rows = sales
    .map((s) => ({ contactId: s.contactId, revenue: Number(s._sum.total ?? 0) }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .map((r, i) => ({ ...r, name: show ? (clients.find((c) => c.xeroContactId === r.contactId)?.name ?? contacts.find((c) => c.xeroId === r.contactId)?.name ?? "—") : anonName(i), share: total ? r.revenue / total : 0 }));
  const top = (n: number) => rows.slice(0, n).reduce((a, r) => a + r.share, 0);
  return { total, rows, top1: top(1), top5: top(5), top10: top(10), count: rows.length };
}
