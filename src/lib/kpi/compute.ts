import { prisma } from "@/lib/db";
import { ratios } from "@/lib/finance/calc";
import { addMonth, lastN, loadFinance } from "@/lib/finance/load";
import { weekMonday } from "@/lib/leakage/detect";
import { getRules } from "@/lib/model/store";
import { tenantMap } from "@/lib/reports/data";
import { KPIS, workingDays } from "./defs";

export type Site = "all" | "smi" | "par";
export interface KpiData {
  months: string[];
  /** id → value per month (oldest first) for the chosen site */
  values: Record<string, Array<number | null>>;
  /** id → per-site value per month */
  sites: Record<string, Record<"smi" | "par", Array<number | null>>>;
  /** id → per-client values for the latest month */
  clients: Record<string, Array<{ name: string; value: number | null }>>;
  targets: Record<string, number | null>;
}

const div = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || !b ? null : a / b);

/**
 * Every computable KPI for the last `n` complete months. Raw sums are read once and combined here; a KPI with no data
 * for a month is null.
 */
export async function computeKpis(site: Site, n = 12, now = new Date()): Promise<KpiData> {
  const last = addMonth(now.toISOString().slice(0, 7), -1);
  const months = Array.from({ length: n }, (_, i) => addMonth(last, i - n + 1));
  const from = new Date(addMonth(months[0], -12) + "-01T00:00:00Z");
  const to = new Date(addMonth(last, 1) + "-01T00:00:00Z");
  const [rules, sites, tm, orders, slips, vols, codeMaps, services, fin, sales, leaks, tickets, clients] = await Promise.all([
    getRules(),
    prisma.site.findMany(),
    tenantMap(),
    prisma.$queryRaw<Array<{ m: string; wh: string | null; source: string; tenant: string; n: number; u: number }>>`
      SELECT to_char(date, 'YYYY-MM') AS m, warehouse AS wh, source, tenant, count(*)::int AS n, coalesce(sum(units), 0)::float AS u
      FROM "OrderFact" WHERE date >= ${from} AND date < ${to} GROUP BY 1, 2, 3, 4`,
    prisma.$queryRaw<Array<{ m: string; site: string; gross: number; super: number; hours: number; ot: number | null; otKnown: number; n: number }>>`
      SELECT to_char(r."paymentDate", 'YYYY-MM') AS m, s.site, sum(p.gross)::float AS gross, sum(p.super)::float AS super, sum(p.hours)::float AS hours,
             sum(p."overtimeHours")::float AS ot, count(p."overtimeHours")::int AS "otKnown", count(*)::int AS n
      FROM "Payslip" p JOIN "PayRun" r ON r."xeroId" = p."payRunId" JOIN "Staff" s ON s."xeroEmployeeId" = p."employeeId"
      WHERE s.pool = 'floor' AND r."paymentDate" >= ${from} AND r."paymentDate" < ${to} GROUP BY 1, 2`,
    prisma.$queryRaw<Array<{ m: string; wh: string; source: string; tenant: string; code: string; q: number }>>`
      SELECT to_char(date, 'YYYY-MM') AS m, warehouse AS wh, source, tenant, "wmsCode" AS code, sum(quantity)::float AS q
      FROM "VolumeLine" WHERE date >= ${from} AND date < ${to} GROUP BY 1, 2, 3, 4, 5`,
    prisma.wmsCodeMap.findMany(),
    prisma.service.findMany({ select: { code: true, unit: true } }),
    loadFinance(now),
    prisma.$queryRaw<Array<{ m: string; kind: string; contact: string; t: number }>>`
      SELECT to_char(date, 'YYYY-MM') AS m, kind, "contactId" AS contact, sum(total)::float AS t
      FROM "XeroSale" WHERE date >= ${from} AND date < ${to} AND status IN ('AUTHORISED', 'PAID') GROUP BY 1, 2, 3`,
    prisma.leakageItem.findMany({ where: { status: { in: ["OPEN", "TASK"] } }, select: { period: true, gap: true } }),
    prisma.frontTicketMonth.findMany({ where: { month: { gte: months[0] } } }),
    prisma.client.findMany({ select: { id: true, name: true, shortName: true } }),
  ]);

  const siteOf = (wh: string | null) => (wh ? (sites.find((s) => s.wmsCodes.includes(wh))?.key as "smi" | "par" | undefined) : undefined);
  const inSite = (wh: string | null, s: Site) => s === "all" || siteOf(wh) === s;
  const ordersIn = (m: string, s: Site) => orders.filter((o) => o.m === m && inSite(o.wh, s)).reduce((a, o) => a + o.n, 0);
  const unitsIn = (m: string, s: Site) => orders.filter((o) => o.m === m && inSite(o.wh, s)).reduce((a, o) => a + o.u, 0);
  const anyOrders = (m: string) => orders.some((o) => o.m === m);
  const pay = (m: string, s: Site) => {
    const rows = slips.filter((p) => p.m === m && (s === "all" || p.site === s));
    if (!rows.length) return null;
    const g = rows.reduce((a, p) => a + p.gross, 0);
    return { cost: g + rows.reduce((a, p) => a + p.super, 0) + g * ((rules.payrollTaxRate ?? 0) + (rules.workersCompRate ?? 0)), hours: rows.reduce((a, p) => a + p.hours, 0) };
  };
  const unitOf = new Map(services.map((x) => [x.code, x.unit]));
  const svcFor = (source: string, tenant: string, code: string) => (codeMaps.find((c) => c.source === source && c.wmsCode === code && c.tenant === tenant) ?? codeMaps.find((c) => c.source === source && c.wmsCode === code && c.tenant === ""))?.serviceCode;
  const palletWeeks = (m: string, s: "smi" | "par") => {
    const rows = vols.filter((v) => v.m === m && siteOf(v.wh) === s && unitOf.get(svcFor(v.source, v.tenant, v.code) ?? "") === "pallet-week");
    return rows.length ? rows.reduce((a, v) => a + v.q, 0) : null;
  };
  const weeksIn = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    return new Date(Date.UTC(y, mo, 0)).getUTCDate() / 7;
  };
  const posOf = (s: "smi" | "par") => sites.find((x) => x.key === s)?.palletPositions ?? null;
  const pm = (m: string) => fin.months.find((x) => x.month === m) ?? null;
  const contactRev = (m: string) => sales.filter((x) => x.m === m);

  const one = (id: string, m: string, s: Site): number | null => {
    const has = anyOrders(m);
    const o = ordersIn(m, s);
    switch (id) {
      case "overtime": {
        // Only months where overtime was read for every payslip (older payslips stay "no data" until re-read)
        const rows = slips.filter((p) => p.m === m && (s === "all" || p.site === s));
        if (!rows.length || rows.some((p) => p.otKnown < p.n)) return null;
        return div(rows.reduce((a, p) => a + (p.ot ?? 0), 0), rows.reduce((a, p) => a + p.hours, 0));
      }
      case "ordersPerDay":
        return has ? o / workingDays(m) : null;
      case "unitsPerHour": {
        const p = pay(m, s);
        return has && p?.hours ? unitsIn(m, s) / p.hours : null;
      }
      case "ordersPerHour": {
        const p = pay(m, s);
        return has && p?.hours ? o / p.hours : null;
      }
      case "labourPerOrder": {
        const p = pay(m, s);
        return has && p && o ? p.cost / o : null;
      }
      case "grossMargin": {
        const x = pm(m);
        return x && x.revenue ? x.gross / x.revenue : null;
      }
      case "costPerOrder": {
        const x = pm(m);
        const oa = ordersIn(m, "all");
        return x && has && oa ? (x.cos + x.overheads) / oa : null;
      }
      case "revenuePerOrder": {
        const x = pm(m);
        const oa = ordersIn(m, "all");
        return x && has && oa ? x.revenue / oa : null;
      }
      case "leakage": {
        const mine = leaks.filter((l) => (l.period.includes("W") ? weekMonday(l.period).slice(0, 7) : l.period) === m);
        return mine.reduce((a, l) => a + Number(l.gap), 0);
      }
      case "debtorDays": {
        const b = fin.bal.find((x) => x.month === m) ?? null;
        return b ? ratios(lastN(fin.months, 12, m), b, null).debtorDays : null;
      }
      case "creditNotes": {
        const rows = contactRev(m);
        const inv = rows.filter((r) => r.kind === "INVOICE").reduce((a, r) => a + r.t, 0);
        const cr = -rows.filter((r) => r.kind === "CREDIT").reduce((a, r) => a + r.t, 0);
        return inv ? cr / inv : null;
      }
      case "palletsUsed": {
        const ss: Array<"smi" | "par"> = s === "all" ? ["smi", "par"] : [s];
        const pw = ss.map((x) => palletWeeks(m, x));
        const pos = ss.map(posOf);
        if (pw.every((v) => v == null) || pos.some((v) => !v)) return null;
        return pw.reduce<number>((a, v) => a + (v ?? 0), 0) / weeksIn(m) / pos.reduce<number>((a, v) => a + (v ?? 0), 0);
      }
      case "revenuePerPosition": {
        const x = pm(m);
        const pos = (posOf("smi") ?? 0) + (posOf("par") ?? 0);
        return x && pos ? x.revenue / pos : null;
      }
      case "ticketsPer100": {
        const t = tickets.filter((x) => x.month === m);
        const oa = ordersIn(m, "all");
        return t.length && oa ? (t.reduce((a, x) => a + x.tickets, 0) / oa) * 100 : null;
      }
      case "top5Share": {
        const win = new Set(Array.from({ length: 12 }, (_, i) => addMonth(m, -i)));
        const by = new Map<string, number>();
        for (const r of sales) if (win.has(r.m)) by.set(r.contact, (by.get(r.contact) ?? 0) + r.t);
        const v = [...by.values()].filter((x) => x > 0).sort((a, b) => b - a);
        const tot = v.reduce((a, x) => a + x, 0);
        return tot && sales.some((r) => r.m <= addMonth(m, -11)) ? v.slice(0, 5).reduce((a, x) => a + x, 0) / tot : null;
      }
      case "orderGrowth": {
        const ly = addMonth(m, -12);
        const before = ordersIn(ly, s);
        return has && anyOrders(ly) && before ? o / before - 1 : null;
      }
      default:
        return null;
    }
  };

  const values: KpiData["values"] = {};
  const siteVals: KpiData["sites"] = {};
  for (const k of KPIS) {
    if (k.needs) continue;
    values[k.id] = months.map((m) => one(k.id, m, k.bySite ? site : "all"));
    if (k.bySite) siteVals[k.id] = { smi: months.map((m) => one(k.id, m, "smi")), par: months.map((m) => one(k.id, m, "par")) };
  }

  // Per-client splits for the latest month
  const cname = (src: string, t: string) => {
    const c = tm(src, t);
    return c ? c.name : `${t} (no client)`;
  };
  const byClient = (m: string) => {
    const mp = new Map<string, number>();
    for (const o of orders) if (o.m === m && inSite(o.wh, site)) mp.set(cname(o.source, o.tenant), (mp.get(cname(o.source, o.tenant)) ?? 0) + o.n);
    return mp;
  };
  const cur = byClient(last);
  const ly = byClient(addMonth(last, -12));
  const tk = new Map(tickets.filter((t) => t.month === last).map((t) => [clients.find((c) => c.id === t.clientId), t.tickets] as const).filter(([c]) => c).map(([c, v]) => [c!.shortName || c!.name, v]));
  const sorted = (a: Array<{ name: string; value: number | null }>) => a.sort((x, y) => (y.value ?? -Infinity) - (x.value ?? -Infinity));
  const clientsOut: KpiData["clients"] = {
    ordersPerDay: sorted([...cur.entries()].map(([name, v]) => ({ name, value: v / workingDays(last) }))),
    orderGrowth: sorted([...cur.entries()].map(([name, v]) => ({ name, value: ly.get(name) ? v / ly.get(name)! - 1 : null }))),
    ticketsPer100: sorted([...tk.entries()].map(([name, t]) => ({ name, value: cur.get(name) ? (t / cur.get(name)!) * 100 : null }))),
  };
  const targets = Object.fromEntries(KPIS.map((k) => [k.id, (rules[`kpi_${k.id}`] as number | null | undefined) ?? null]));
  return { months, values, sites: siteVals, clients: clientsOut, targets };
}
