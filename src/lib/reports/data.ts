import { prisma } from "@/lib/db";
import { getRules } from "@/lib/model/store";

/**
 * Report data from the local copies (WMS orders, Xero sales). Every figure is a count or a sum of real rows;
 * forecasts are labelled and use a simple seasonal method (same period last year × recent growth).
 */

export type Period = "WEEK" | "MONTH" | "QUARTER" | "YEAR";
export interface Range {
  from: Date;
  to: Date; // exclusive
  label: string;
}

const D = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const au = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

/** The last complete period before `now`, and the one before it (k = 1 → previous, 12 months back for "same period last year"). */
export function periodRange(p: Period, now = new Date(), back = 0): Range {
  if (p === "WEEK") {
    const day = now.getUTCDay() || 7;
    const mon = addDays(D(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()), -(day - 1) - 7 * (1 + back));
    return { from: mon, to: addDays(mon, 7), label: `Week of ${au(mon)}` };
  }
  if (p === "MONTH") {
    const f = D(now.getUTCFullYear(), now.getUTCMonth() - 1 - back);
    return { from: f, to: D(f.getUTCFullYear(), f.getUTCMonth() + 1), label: f.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }) };
  }
  if (p === "QUARTER") {
    const q = Math.floor(now.getUTCMonth() / 3);
    const f = D(now.getUTCFullYear(), (q - 1 - back) * 3);
    const fyq = ((Math.floor(f.getUTCMonth() / 3) + 2) % 4) + 1; // Jul–Sep = Q1 of the financial year
    const fy = f.getUTCMonth() >= 6 ? f.getUTCFullYear() + 1 : f.getUTCFullYear();
    return { from: f, to: D(f.getUTCFullYear(), f.getUTCMonth() + 3), label: `Q${fyq} FY${String(fy).slice(2)} (${f.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })}–${D(f.getUTCFullYear(), f.getUTCMonth() + 2).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" })})` };
  }
  const t = D(now.getUTCFullYear(), now.getUTCMonth() - 12 * back);
  return { from: D(t.getUTCFullYear() - 1, t.getUTCMonth()), to: t, label: `12 months to ${au(addDays(t, -1))}` };
}

export function previous(p: Period, r: Range): Range {
  if (p === "WEEK") return { from: addDays(r.from, -7), to: r.from, label: `Week of ${au(addDays(r.from, -7))}` };
  const months = p === "MONTH" ? 1 : p === "QUARTER" ? 3 : 12;
  const f = D(r.from.getUTCFullYear(), r.from.getUTCMonth() - months);
  return { from: f, to: r.from, label: "previous" };
}
export function lastYear(r: Range): Range {
  return { from: D(r.from.getUTCFullYear() - 1, r.from.getUTCMonth(), r.from.getUTCDate()), to: D(r.to.getUTCFullYear() - 1, r.to.getUTCMonth(), r.to.getUTCDate()), label: "same period last year" };
}

export interface ClientRef {
  id: string;
  name: string;
}
export async function tenantMap(): Promise<(source: string, tenant: string) => ClientRef | null> {
  const clients = await prisma.client.findMany({ select: { id: true, name: true, shortName: true, dyspatchCustomerId: true, thomaxTenantId: true, p3lClientId: true, logiwaClientId: true } });
  const m = new Map<string, ClientRef>();
  for (const c of clients) {
    const ref = { id: c.id, name: c.shortName || c.name };
    for (const [src, ids] of [["THOMAX", [c.thomaxTenantId, c.dyspatchCustomerId]], ["P3L", [c.p3lClientId]], ["LOGIWA", [c.logiwaClientId, c.dyspatchCustomerId]]] as const) for (const id of ids) if (id) m.set(`${src}|${id}`, ref);
  }
  return (s, t) => m.get(`${s}|${t}`) ?? null;
}

export interface OrderRow {
  client: ClientRef;
  date: Date;
  skus: number;
  units: number;
}

export async function ordersIn(r: Range, clientId?: string | null): Promise<OrderRow[]> {
  const tm = await tenantMap();
  const rows = await prisma.orderFact.findMany({ where: { date: { gte: r.from, lt: r.to } }, select: { source: true, tenant: true, date: true, skus: true, units: true } });
  const out: OrderRow[] = [];
  for (const o of rows) {
    const c = tm(o.source, o.tenant) ?? { id: `tenant:${o.tenant}`, name: `${o.tenant} (no client)` };
    if (clientId && c.id !== clientId) continue;
    out.push({ client: c, date: o.date, skus: o.skus, units: Number(o.units) });
  }
  return out;
}

export const SKU_BUCKETS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "10+"];
export const UNIT_BUCKETS: Array<[string, number, number]> = [["1", 1, 1], ["2", 2, 2], ["3", 3, 3], ["4–5", 4, 5], ["6–10", 6, 10], ["11–20", 11, 20], ["21–50", 21, 50], ["50+", 51, Infinity]];
const skuBucket = (n: number) => (n >= 11 ? 10 : Math.max(0, n - 1));
const unitBucket = (u: number) => UNIT_BUCKETS.findIndex(([, a, b]) => Math.round(u) >= a && Math.round(u) <= b);

export type WorkloadFilter = "all" | "single" | "b2c" | "b2b";
export interface WorkloadRow {
  client: ClientRef;
  orders: number;
  prev: number;
  sku: number[];
  units: number[];
  b2b: number;
  single: number;
}
export interface Workload {
  range: Range;
  prevRange: Range;
  b2bUnits: number;
  filter: WorkloadFilter;
  totals: { orders: number; prev: number; single: number; b2c: number; b2b: number; units: number };
  rows: WorkloadRow[];
}

/** Client workload (brief §9): orders by number of SKUs (1–10, 10+) and by units; B2B = more than the threshold. */
export async function workload(p: Period, opts: { filter?: WorkloadFilter; clientId?: string | null; now?: Date } = {}): Promise<Workload> {
  const range = periodRange(p, opts.now);
  const prevRange = previous(p, range);
  const b2bUnits = (await getRules()).b2bUnits ?? 20;
  const filter = opts.filter ?? "all";
  const [cur, prev] = await Promise.all([ordersIn(range, opts.clientId), ordersIn(prevRange, opts.clientId)]);
  const keep = (o: OrderRow) => filter === "all" || (filter === "single" && o.skus === 1) || (filter === "b2b" && o.units > b2bUnits) || (filter === "b2c" && o.units <= b2bUnits);
  const by = new Map<string, WorkloadRow>();
  const row = (c: ClientRef) => by.get(c.id) ?? by.set(c.id, { client: c, orders: 0, prev: 0, sku: SKU_BUCKETS.map(() => 0), units: UNIT_BUCKETS.map(() => 0), b2b: 0, single: 0 }).get(c.id)!;
  let units = 0;
  for (const o of cur) {
    if (!keep(o)) continue;
    const r = row(o.client);
    r.orders++;
    r.sku[skuBucket(o.skus)]++;
    const ub = unitBucket(o.units);
    if (ub >= 0) r.units[ub]++;
    if (o.units > b2bUnits) r.b2b++;
    if (o.skus === 1) r.single++;
    units += o.units;
  }
  for (const o of prev) if (keep(o)) row(o.client).prev++;
  const rows = [...by.values()].filter((r) => r.orders || r.prev).sort((a, b) => b.orders - a.orders);
  const all = cur;
  return {
    range,
    prevRange,
    b2bUnits,
    filter,
    rows,
    totals: { orders: rows.reduce((a, r) => a + r.orders, 0), prev: rows.reduce((a, r) => a + r.prev, 0), single: all.filter((o) => o.skus === 1).length, b2b: all.filter((o) => o.units > b2bUnits).length, b2c: all.filter((o) => o.units <= b2bUnits).length, units },
  };
}

export interface TrendRow {
  client: ClientRef;
  now: number;
  prev: number;
  ly: number;
  months: number[];
  status: "new" | "lost" | "growing" | "declining" | "steady";
}

/** Monthly client trends: vs last month and the same month last year; new / lost; weekday pattern; peak days. */
export async function trends(now = new Date(), clientId?: string | null) {
  const r = periodRange("MONTH", now);
  const six = { from: D(r.from.getUTCFullYear(), r.from.getUTCMonth() - 5), to: r.to, label: "" };
  const [cur, prev, ly, hist] = await Promise.all([ordersIn(r, clientId), ordersIn(previous("MONTH", r), clientId), ordersIn(lastYear(r), clientId), ordersIn(six, clientId)]);
  const count = (rows: OrderRow[]) => rows.reduce((m, o) => m.set(o.client.id, (m.get(o.client.id) ?? 0) + 1), new Map<string, number>());
  const [cN, cP, cL] = [count(cur), count(prev), count(ly)];
  const names = new Map([...cur, ...prev, ...ly].map((o) => [o.client.id, o.client]));
  const rows: TrendRow[] = [...names.values()].map((c) => {
    const n = cN.get(c.id) ?? 0;
    const pv = cP.get(c.id) ?? 0;
    const l = cL.get(c.id) ?? 0;
    const months = Array.from({ length: 6 }, (_, i) => {
      const f = D(r.from.getUTCFullYear(), r.from.getUTCMonth() - 5 + i);
      const t = D(f.getUTCFullYear(), f.getUTCMonth() + 1);
      return hist.filter((o) => o.client.id === c.id && o.date >= f && o.date < t).length;
    });
    const base = l || pv;
    const status: TrendRow["status"] = !pv && !l && n ? "new" : n === 0 && pv ? "lost" : base && n > base * 1.1 ? "growing" : base && n < base * 0.9 ? "declining" : "steady";
    return { client: c, now: n, prev: pv, ly: l, months, status };
  });
  rows.sort((a, b) => b.now - a.now);
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  const byDay = new Map<string, number>();
  for (const o of cur) {
    weekday[(o.date.getUTCDay() + 6) % 7]++;
    const k = o.date.toISOString().slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const peaks = [...byDay.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const b2bUnits = (await getRules()).b2bUnits ?? 20;
  const mix = (rows: OrderRow[]) => ({ b2b: rows.length ? rows.filter((o) => o.units > b2bUnits).length / rows.length : null, single: rows.length ? rows.filter((o) => o.skus === 1).length / rows.length : null, upo: rows.length ? rows.reduce((a, o) => a + o.units, 0) / rows.length : null });
  return { range: r, rows, totals: { now: cur.length, prev: prev.length, ly: ly.length }, weekday, peaks, mix: { now: mix(cur), prev: mix(prev) } };
}

/** Orders per month for the last n months (oldest first), FA-wide or one client. */
export async function monthlyOrders(n: number, now = new Date(), clientId?: string | null): Promise<Array<{ month: string; orders: number }>> {
  const end = D(now.getUTCFullYear(), now.getUTCMonth());
  const start = D(end.getUTCFullYear(), end.getUTCMonth() - n);
  const rows = await ordersIn({ from: start, to: end, label: "" }, clientId);
  return Array.from({ length: n }, (_, i) => {
    const f = D(start.getUTCFullYear(), start.getUTCMonth() + i);
    const m = f.toISOString().slice(0, 7);
    return { month: m, orders: rows.filter((o) => o.date.toISOString().startsWith(m)).length };
  });
}

/**
 * Seasonal forecast: next k months = same month last year × growth of the last 12 months vs the 12 before.
 * Needs 24 months of history; otherwise returns null (never a made-up line). Range ±8%.
 */
export function seasonalForecast(series: number[], k: number): Array<{ value: number; low: number; high: number }> | null {
  if (series.length < 24 || series.slice(-24).some((v) => v === 0)) return null;
  const last12 = series.slice(-12).reduce((a, b) => a + b, 0);
  const prev12 = series.slice(-24, -12).reduce((a, b) => a + b, 0);
  if (!prev12) return null;
  const g = last12 / prev12;
  return Array.from({ length: k }, (_, i) => {
    const v = series[series.length - 12 + (i % 12)] * g;
    return { value: Math.round(v), low: Math.round(v * 0.92), high: Math.round(v * 1.08) };
  });
}

/** Year in review: churn = clients with orders at the start of the year and none in the last 2 months. */
export async function yearInReview(now = new Date()) {
  const series = await monthlyOrders(24, now);
  const r = periodRange("YEAR", now);
  const startQ = { from: r.from, to: D(r.from.getUTCFullYear(), r.from.getUTCMonth() + 3), label: "" };
  const lastTwo = { from: D(r.to.getUTCFullYear(), r.to.getUTCMonth() - 2), to: r.to, label: "" };
  const prevYear = { from: D(r.from.getUTCFullYear() - 1, r.from.getUTCMonth()), to: r.from, label: "" };
  const [atStart, recent, year, before] = await Promise.all([ordersIn(startQ), ordersIn(lastTwo), ordersIn(r), ordersIn(prevYear)]);
  const ids = (rows: OrderRow[]) => new Map(rows.map((o) => [o.client.id, o.client]));
  const startIds = ids(atStart);
  const recentIds = ids(recent);
  const beforeIds = ids(before);
  const lost = [...startIds.values()].filter((c) => !recentIds.has(c.id) && !c.id.startsWith("tenant:"));
  const won = [...ids(year).values()].filter((c) => !beforeIds.has(c.id) && !c.id.startsWith("tenant:"));
  const lostDetail = await Promise.all(
    lost.map(async (c) => {
      const mine = year.filter((o) => o.client.id === c.id);
      const last = mine.reduce((a, o) => (o.date > a ? o.date : a), new Date(0));
      const cl = await prisma.client.findUnique({ where: { id: c.id }, select: { xeroContactId: true } });
      const rev = cl?.xeroContactId ? await prisma.xeroSale.aggregate({ where: { contactId: cl.xeroContactId, date: { gte: r.from, lt: r.to }, status: { in: ["AUTHORISED", "PAID"] } }, _sum: { total: true } }) : null;
      return { client: c, lastOrder: last, ordersPerMonth: mine.length / 12, revenue: rev?._sum.total ? Number(rev._sum.total) : null };
    }),
  );
  const totalRev = await prisma.xeroSale.aggregate({ where: { date: { gte: r.from, lt: r.to }, status: { in: ["AUTHORISED", "PAID"] } }, _sum: { total: true } });
  const lostRev = lostDetail.reduce((a, l) => a + (l.revenue ?? 0), 0);
  return {
    range: r,
    series,
    forecast: seasonalForecast(series.map((s) => s.orders), 12),
    clientsAtStart: startIds.size,
    clientsNow: recentIds.size,
    won,
    lost: lostDetail,
    churnRate: startIds.size ? lost.length / startIds.size : null,
    revenueChurn: totalRev._sum.total && lostDetail.some((l) => l.revenue != null) ? lostRev / Number(totalRev._sum.total) : null,
    orders: year.length,
    ordersBefore: before.length,
  };
}
