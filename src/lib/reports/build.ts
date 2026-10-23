import { prisma } from "@/lib/db";
import { loadCostRun } from "@/lib/cost/load";
import { getRules } from "@/lib/model/store";
import { SKU_BUCKETS, UNIT_BUCKETS, lastYear, monthlyOrders, ordersIn, periodRange, previous, seasonalForecast, trends, workload, yearInReview, type Period, type WorkloadFilter } from "./data";

/**
 * A report = title + blocks. The same blocks render on screen (HTML) and in the PDF, so what is sent is exactly
 * what was seen, and the pre-send scan reads one structure.
 */

export type Cell = string | { v: string; s?: string; tone?: "pos" | "neg" };
export type Block =
  | { kind: "kpis"; items: Array<{ label: string; value: string; sub?: string; tone?: "red" | "green" }> }
  | { kind: "table"; title: string; sub?: string; head: string[]; right?: number[]; rows: Cell[][]; total?: Cell[] }
  | { kind: "bars"; title: string; sub?: string; rows: Array<{ label: string; value: number; display: string; forecast?: boolean }> }
  | { kind: "note"; text: string; tone?: "warn" | "ai" };

export interface BuiltReport {
  title: string;
  subtitle: string;
  blocks: Block[];
  /** Client names that appear in the report (for the client-safe brake) */
  clientsShown: string[];
}

export interface ReportSpec {
  name: string;
  template: string;
  period: string;
  cls: string;
  clientId: string | null;
  forecast: boolean;
  costing: string;
}

export const TEMPLATES: Record<string, { label: string; periods: Period[]; clientSafe: boolean; external?: boolean }> = {
  workload: { label: "Client workload (orders by SKUs and units)", periods: ["WEEK", "MONTH", "QUARTER"], clientSafe: true },
  trends: { label: "Client trends (monthly)", periods: ["MONTH"], clientSafe: true },
  quarterly: { label: "Quarterly review", periods: ["QUARTER"], clientSafe: true },
  yearly: { label: "Year in review (with churn)", periods: ["YEAR"], clientSafe: false },
  volumes: { label: "Client volumes", periods: ["WEEK", "MONTH", "QUARTER"], clientSafe: true },
  protection: { label: "Revenue protection (Mark)", periods: ["MONTH"], clientSafe: false },
};

const n = (x: number) => Math.round(x).toLocaleString("en-AU");
const pc = (x: number | null | undefined, dp = 0) => (x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(dp)}%`);
const aud = (x: number | null | undefined) => (x == null ? "—" : x.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }));
const chg = (a: number, b: number): Cell => (b ? { v: `${a >= b ? "▲" : "▼"} ${pc(Math.abs(a - b) / b, 1)}`, tone: a >= b ? "pos" : "neg" } : { v: a ? "new" : "—" });
const big = (v: number, s: string): Cell => ({ v: n(v), s });

export async function buildReport(r: ReportSpec, opts: { filter?: WorkloadFilter; now?: Date } = {}): Promise<BuiltReport> {
  const now = opts.now ?? new Date();
  const p = r.period as Period;
  const clientName = r.clientId ? ((await prisma.client.findUnique({ where: { id: r.clientId } }))?.name ?? "") : null;
  const shown = new Set<string>();
  const note = (rows: Array<{ client: { name: string } }>) => rows.forEach((x) => shown.add(x.client.name));
  const blocks: Block[] = [];
  let subtitle = "";

  if (r.template === "workload") {
    const w = await workload(p, { filter: opts.filter, clientId: r.clientId, now });
    note(w.rows);
    subtitle = `${w.range.label} · compared with the previous ${p.toLowerCase()}`;
    const t = w.totals;
    const all = t.b2c + t.b2b;
    blocks.push({
      kind: "kpis",
      items: [
        { label: "Total orders", value: n(all), sub: `${t.prev ? (all >= t.prev ? "▲ " : "▼ ") + pc(Math.abs(all - t.prev) / t.prev, 1) : ""} vs previous · ${all ? (t.units / Math.max(1, t.orders)).toFixed(2) : "—"} units / order` },
        { label: "Single-SKU orders", value: n(t.single), sub: `${pc(all ? t.single / all : null)} of orders` },
        { label: "B2C orders", value: n(t.b2c), sub: `${pc(all ? t.b2c / all : null)} · ≤ ${w.b2bUnits} units` },
        { label: "B2B orders", value: n(t.b2b), sub: `${pc(all ? t.b2b / all : null)} · more than ${w.b2bUnits} units` },
      ],
    });
    const label = { all: "all orders", single: "single-SKU orders", b2c: "B2C orders", b2b: "B2B orders" }[w.filter];
    const tot = w.totals.orders || 1;
    blocks.push({
      kind: "table",
      title: `Orders by number of SKUs · ${label}`,
      sub: "Orders (big) and share of the client's orders (small).",
      head: ["Client", "Orders", ...SKU_BUCKETS],
      right: Array.from({ length: 12 }, (_, i) => i + 1),
      rows: w.rows.map((x) => [x.client.name, big(x.orders, `${pc(x.orders / tot)} of total`), ...x.sku.map((v) => big(v, x.orders ? pc(v / x.orders) : "—"))]),
      total: ["Total", big(w.totals.orders, "100%"), ...SKU_BUCKETS.map((_, k) => big(w.rows.reduce((a, x) => a + x.sku[k], 0), pc(w.rows.reduce((a, x) => a + x.sku[k], 0) / tot)))],
    });
    blocks.push({
      kind: "table",
      title: `Orders by number of units · ${label}`,
      head: ["Client", "Orders", ...UNIT_BUCKETS.map((u) => u[0])],
      right: Array.from({ length: 9 }, (_, i) => i + 1),
      rows: w.rows.map((x) => [x.client.name, big(x.orders, `${pc(x.orders / tot)} of total`), ...x.units.map((v) => big(v, x.orders ? pc(v / x.orders) : "—"))]),
      total: ["Total", big(w.totals.orders, "100%"), ...UNIT_BUCKETS.map((_, k) => big(w.rows.reduce((a, x) => a + x.units[k], 0), pc(w.rows.reduce((a, x) => a + x.units[k], 0) / tot)))],
    });
    blocks.push({
      kind: "table",
      title: `Compared with the previous ${p.toLowerCase()} · ${label}`,
      head: ["Client", "Previous", "This period", "Change"],
      right: [1, 2, 3],
      rows: [...w.rows].sort((a, b) => b.orders - b.prev - (a.orders - a.prev)).map((x) => [x.client.name, n(x.prev), n(x.orders), chg(x.orders, x.prev)]),
      total: ["Total", n(w.totals.prev), n(w.totals.orders), chg(w.totals.orders, w.totals.prev)],
    });
    if (r.forecast && p === "WEEK") blocks.push({ kind: "note", text: "Weekly forecasts need daily history patterns — shown from the monthly and quarterly reports instead." });
  } else if (r.template === "trends") {
    const t = await trends(now, r.clientId);
    note(t.rows);
    subtitle = `${t.range.label} · vs last month and the same month last year`;
    blocks.push({
      kind: "kpis",
      items: [
        { label: "Orders this month", value: n(t.totals.now) },
        { label: "vs last month", value: t.totals.prev ? `${t.totals.now >= t.totals.prev ? "▲" : "▼"} ${pc(Math.abs(t.totals.now - t.totals.prev) / t.totals.prev, 1)}` : "—", tone: t.totals.now >= t.totals.prev ? "green" : "red" },
        { label: "vs same month last year", value: t.totals.ly ? `${t.totals.now >= t.totals.ly ? "▲" : "▼"} ${pc(Math.abs(t.totals.now - t.totals.ly) / t.totals.ly, 1)}` : "no history", tone: t.totals.now >= t.totals.ly ? "green" : "red" },
        { label: "New / lost clients", value: `${t.rows.filter((x) => x.status === "new").length} / ${t.rows.filter((x) => x.status === "lost").length}` },
      ],
    });
    blocks.push({ kind: "table", title: "Clients", head: ["Client", "This month", "Last month", "Change", "Same month LY", "YoY", "Trend"], right: [1, 2, 3, 4, 5], rows: t.rows.map((x) => [x.client.name, big(x.now, pc(t.totals.now ? x.now / t.totals.now : null)), n(x.prev), chg(x.now, x.prev), n(x.ly), chg(x.now, x.ly), x.status]) });
    blocks.push({ kind: "table", title: "Mix shift", head: ["", "This month", "Last month"], right: [1, 2], rows: [["B2B share of orders", pc(t.mix.now.b2b, 1), pc(t.mix.prev.b2b, 1)], ["Single-SKU share", pc(t.mix.now.single, 1), pc(t.mix.prev.single, 1)], ["Units per order", t.mix.now.upo?.toFixed(2) ?? "—", t.mix.prev.upo?.toFixed(2) ?? "—"]] });
    blocks.push({ kind: "bars", title: "Orders by weekday", sub: t.peaks.length ? `Peak days: ${t.peaks.map(([d, c]) => `${d.split("-").reverse().join("/")} (${n(c)})`).join(", ")}` : undefined, rows: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => ({ label: d, value: t.weekday[i], display: n(t.weekday[i]) })) });
    if (r.forecast) {
      const series = await monthlyOrders(24, now, r.clientId);
      const f = seasonalForecast(series.map((s) => s.orders), 1);
      blocks.push(f ? { kind: "note", text: `Forecast · next month: ${n(f[0].value)} orders (range ${n(f[0].low)}–${n(f[0].high)}). Same month last year × growth of the last 12 months.` } : { kind: "note", text: "Forecast needs 24 months of order history — not loaded yet.", tone: "warn" });
    }
  } else if (r.template === "quarterly") {
    const q = periodRange("QUARTER", now);
    const [cur, prev, ly] = await Promise.all([ordersIn(q, r.clientId), ordersIn(previous("QUARTER", q), r.clientId), ordersIn(lastYear(q), r.clientId)]);
    subtitle = `${q.label} · QoQ and YoY`;
    const count = (rows: typeof cur) => rows.reduce((m, o) => m.set(o.client.name, (m.get(o.client.name) ?? 0) + 1), new Map<string, number>());
    const [a, b, c] = [count(cur), count(prev), count(ly)];
    const names = [...new Set([...a.keys(), ...b.keys(), ...c.keys()])].sort((x, y) => (a.get(y) ?? 0) - (a.get(x) ?? 0));
    names.forEach((x) => shown.add(x));
    const series = await monthlyOrders(24, now, r.clientId);
    const f = r.forecast ? seasonalForecast(series.map((s) => s.orders), 3) : null;
    blocks.push({
      kind: "kpis",
      items: [
        { label: "Orders this quarter", value: n(cur.length) },
        { label: "vs previous quarter", value: prev.length ? `${cur.length >= prev.length ? "▲" : "▼"} ${pc(Math.abs(cur.length - prev.length) / prev.length, 1)}` : "—" },
        { label: "vs same quarter last year", value: ly.length ? `${cur.length >= ly.length ? "▲" : "▼"} ${pc(Math.abs(cur.length - ly.length) / ly.length, 1)}` : "no history" },
        ...(r.forecast ? [{ label: "Forecast · next quarter", value: f ? n(f.reduce((s, x) => s + x.value, 0)) : "needs 24 months", sub: f ? `${n(f.reduce((s, x) => s + x.low, 0))}–${n(f.reduce((s, x) => s + x.high, 0))}` : undefined }] : []),
      ],
    });
    blocks.push({ kind: "table", title: "Clients · quarter on quarter", head: ["Client", "This quarter", "Previous", "QoQ", "Same quarter LY", "YoY"], right: [1, 2, 3, 4, 5], rows: names.map((x) => [x, big(a.get(x) ?? 0, pc(cur.length ? (a.get(x) ?? 0) / cur.length : null)), n(b.get(x) ?? 0), chg(a.get(x) ?? 0, b.get(x) ?? 0), n(c.get(x) ?? 0), chg(a.get(x) ?? 0, c.get(x) ?? 0)]) });
    blocks.push({ kind: "bars", title: `Orders by month · 24 months${f ? " + forecast" : ""}`, rows: [...series.map((s) => ({ label: s.month, value: s.orders, display: n(s.orders) })), ...(f ? f.map((x, i) => ({ label: `+${i + 1}`, value: x.value, display: `${n(x.value)} (forecast)`, forecast: true })) : [])] });
  } else if (r.template === "yearly") {
    const y = await yearInReview(now);
    subtitle = y.range.label;
    blocks.push({
      kind: "kpis",
      items: [
        { label: "Orders · 12 months", value: n(y.orders), sub: y.ordersBefore ? `${y.orders >= y.ordersBefore ? "▲" : "▼"} ${pc(Math.abs(y.orders - y.ordersBefore) / y.ordersBefore, 1)} vs year before` : "no history" },
        { label: "Clients", value: `${y.clientsAtStart} → ${y.clientsNow}`, sub: `${y.won.length} won · ${y.lost.length} lost` },
        { label: "Client churn rate", value: pc(y.churnRate, 1), sub: "lost ÷ clients at the start of the year", tone: (y.churnRate ?? 0) > 0.1 ? "red" : undefined },
        { label: "Revenue churn", value: pc(y.revenueChurn, 1), sub: "lost clients' revenue ÷ total (Xero)" },
      ],
    });
    y.lost.forEach((l) => shown.add(l.client.name));
    y.won.forEach((w) => shown.add(w.name));
    blocks.push({ kind: "table", title: "Churn details · clients lost this year", sub: "Lost = ordered in the first 3 months of the year, nothing in the last 2. Reasons: add them from Front / CLM notes.", head: ["Client", "Last order", "Orders / month", "Revenue (12 months)"], right: [2, 3], rows: y.lost.map((l) => [l.client.name, l.lastOrder.toISOString().slice(0, 10).split("-").reverse().join("/"), (Math.round(l.ordersPerMonth * 10) / 10).toString(), aud(l.revenue)]) });
    blocks.push({ kind: "table", title: "New clients this year", head: ["Client"], rows: y.won.map((w) => [w.name]) });
    blocks.push({ kind: "bars", title: `Orders · 24 months${r.forecast && y.forecast ? " + next 12 months forecast" : ""}`, rows: [...y.series.map((s) => ({ label: s.month, value: s.orders, display: n(s.orders) })), ...(r.forecast && y.forecast ? y.forecast.map((x, i) => ({ label: `+${i + 1}`, value: x.value, display: `${n(x.value)} (forecast)`, forecast: true })) : [])] });
    if (r.forecast && !y.forecast) blocks.push({ kind: "note", text: "Forecast needs 24 months of order history — not loaded yet.", tone: "warn" });
  } else if (r.template === "volumes") {
    const range = periodRange(p, now);
    subtitle = range.label;
    const { buildInput } = await import("@/lib/cost/load");
    const months = new Set<string>();
    for (let d = new Date(range.from); d < range.to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.add(d.toISOString().slice(0, 7));
    const per = new Map<string, Map<string, number>>();
    const svcNames = new Map<string, string>();
    for (const m of months) {
      const { input } = await buildInput(m);
      input.services.forEach((s) => svcNames.set(s.code, `${s.name} (${s.unit})`));
      for (const c of input.clients) {
        if (r.clientId && c.id !== r.clientId) continue;
        const mm = per.get(c.name) ?? per.set(c.name, new Map()).get(c.name)!;
        for (const v of c.volumes) mm.set(v.serviceCode, (mm.get(v.serviceCode) ?? 0) + v.qty);
      }
    }
    const codes = [...new Set([...per.values()].flatMap((m) => [...m.keys()]))];
    [...per.keys()].forEach((x) => shown.add(x));
    blocks.push({ kind: "table", title: "Volumes by client and service", sub: "From the WMS, mapped to standard services. Volumes only.", head: ["Client", ...codes.map((c) => svcNames.get(c) ?? c)], right: codes.map((_, i) => i + 1), rows: [...per.entries()].map(([name, m]) => [name, ...codes.map((c) => n(m.get(c) ?? 0))]) });
  } else if (r.template === "protection") {
    const range = periodRange("MONTH", now);
    subtitle = `${range.label} · revenue protection`;
    const [items, run, rules] = await Promise.all([prisma.leakageItem.findMany(), loadCostRun(range.from.toISOString().slice(0, 7)), getRules()]);
    const inMonth = (d: Date | null) => !!d && d >= range.from && d < range.to;
    const rec = items.filter((i) => i.status === "RECOVERED" && inMonth(i.recoveredOn));
    const open = items.filter((i) => i.status === "OPEN" || i.status === "TASK");
    const below = run.result.clients.flatMap((c) => c.lines.filter((l) => l.rate != null && l.rate < l.unitT).map((l) => ({ c, l })));
    blocks.push({
      kind: "kpis",
      items: [
        { label: "Recovered this month", value: aud(rec.reduce((a, i) => a + Number(i.recoveredAmount ?? i.gap), 0)), sub: `${rec.length} items · ≈ 100% to profit`, tone: "green" },
        { label: "Leakage still open", value: aud(open.reduce((a, i) => a + Number(i.gap), 0)), sub: `${open.length} findings` },
        { label: "Priced below cost", value: aud(below.reduce((a, x) => a + (x.l.unitT - (x.l.rate ?? 0)) * x.l.qty, 0)), sub: `${below.length} client services` },
        { label: "Margin floor", value: pc(rules.marginFloor ?? 0.15) },
      ],
    });
    blocks.push({ kind: "table", title: "Recovered", head: ["Client", "What", "Invoice", "Amount"], right: [3], rows: await Promise.all(rec.map(async (i) => [(await prisma.client.findUnique({ where: { id: i.clientId } }))?.name ?? "?", `${i.serviceCode ?? i.kind.toLowerCase().replace("_", " ")} · ${i.period}`, i.recoveredInvoice ?? "—", aud(Number(i.recoveredAmount ?? i.gap))])) });
    blocks.push({ kind: "note", text: "Cash collected faster (debtor days) is shown separately in Finance — it isn't profit." });
  }

  if (r.cls === "CLIENT_SAFE" && clientName) blocks.unshift({ kind: "note", text: `Prepared for ${clientName}. Volumes and order profile only.` });
  return { title: r.name, subtitle, blocks, clientsShown: [...shown] };
}

/** Pre-send brake (brief §10): what must never be in a client-safe or external file. Returns problems in plain words. */
export async function scanReport(r: ReportSpec, built: BuiltReport): Promise<string[]> {
  const problems: string[] = [];
  const text = JSON.stringify(built.blocks).toLowerCase();
  if (r.cls === "CLIENT_SAFE") {
    if (!r.clientId) problems.push("A client-safe report must be about one client.");
    if (!TEMPLATES[r.template]?.clientSafe) problems.push(`The ${TEMPLATES[r.template]?.label ?? r.template} template can't be sent to a client.`);
    const own = r.clientId ? await prisma.client.findUnique({ where: { id: r.clientId } }) : null;
    const others = built.clientsShown.filter((nm) => nm !== own?.name && nm !== own?.shortName);
    if (others.length) problems.push(`Other clients' names are in the file: ${others.slice(0, 5).join(", ")}`);
    for (const w of ["cost", "margin", "tdabc", "absorption", "buy rate", "wage", "pay "]) if (text.includes(w)) problems.push(`The file mentions “${w.trim()}” — internal only.`);
  }
  if (r.cls === "EXTERNAL" && !r.template.startsWith("finance")) problems.push("Only Finance reports can go to lenders and advisers.");
  return problems;
}
