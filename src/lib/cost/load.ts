import { prisma } from "@/lib/db";
import { getRules } from "@/lib/model/store";
import { runEngine, type EngineClient, type EngineInput, type EngineResult } from "./engine";

/**
 * Builds the engine input for one month from the local copies (payroll, Xero P&L, WMS volumes and orders,
 * Settings) and runs it. Anything that can't be linked is listed, never guessed.
 */

export interface LoadNotes {
  unlinkedEmployees: Array<{ name: string; gross: number }>;
  unknownTenants: Array<{ source: string; tenant: string; lines: number }>;
  unmappedCodes: Array<{ source: string; code: string; qty: number }>;
  unmappedAccounts: Array<{ code: string; name: string; amount: number }>;
  noIncomeMapping: boolean;
}
export interface CostRun {
  month: string;
  months: string[];
  input: EngineInput;
  result: EngineResult;
  notes: LoadNotes;
}

const monthStart = (m: string) => new Date(`${m}-01T00:00:00Z`);
const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 1));
};

/** Months that have WMS volumes or orders (newest first), plus the last closed month if nothing is loaded yet. */
export async function availableMonths(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ m: string }>>`
    SELECT DISTINCT to_char(date, 'YYYY-MM') AS m FROM "VolumeLine"
    UNION SELECT DISTINCT to_char(date, 'YYYY-MM') FROM "OrderFact"
    ORDER BY 1 DESC`;
  if (rows.length) return rows.map((r) => r.m);
  const d = new Date();
  return [new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)];
}

let cache: { key: string; at: number; run: CostRun } | null = null;

export async function loadCostRun(month?: string): Promise<CostRun> {
  const months = await availableMonths();
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : months[0];
  const stamp = await prisma.changeLog.findFirst({ orderBy: { at: "desc" }, select: { at: true } });
  const key = `${m}|${stamp?.at.getTime() ?? 0}`;
  if (cache && cache.key === key && Date.now() - cache.at < 60_000) return cache.run;
  const { input, notes } = await buildInput(m);
  const run = { month: m, months: months.includes(m) ? months : [m, ...months], input, result: runEngine(input), notes };
  cache = { key, at: Date.now(), run };
  return run;
}

export function clearCostCache() {
  cache = null;
}

export async function buildInput(month: string): Promise<{ input: EngineInput; notes: LoadNotes }> {
  const from = monthStart(month);
  const to = nextMonth(month);
  const days = Math.round((to.getTime() - from.getTime()) / 86400000);
  const [rules, sites, pools, services, clients, staff, maps, accMaps, rates] = await Promise.all([
    getRules(),
    prisma.site.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.costPool.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.service.findMany({ where: { active: true } }),
    prisma.client.findMany({ where: { status: { not: "INACTIVE" } } }),
    prisma.staff.findMany(),
    prisma.wmsCodeMap.findMany(),
    prisma.xeroAccountMap.findMany(),
    prisma.clientRate.findMany(),
  ]);
  const notes: LoadNotes = { unlinkedEmployees: [], unknownTenants: [], unmappedCodes: [], unmappedAccounts: [], noIncomeMapping: false };

  // ---- labour from payroll (pay runs paid in the month)
  const slips = await prisma.payslip.findMany({ where: { payRun: { paymentDate: { gte: from, lt: to }, status: "POSTED" } } });
  const employees = new Map((await prisma.payrollEmployee.findMany()).map((e) => [e.xeroId, `${e.firstName} ${e.lastName}`]));
  const staffByXero = new Map(staff.filter((s) => s.xeroEmployeeId).map((s) => [s.xeroEmployeeId!, s]));
  const labour: EngineInput["labour"] = {};
  const people = new Map<string, Set<string>>();
  const floorPool = (siteKey: string) => pools.find((p) => p.kind === "LABOUR" && p.site === siteKey)?.key;
  const csrPool = pools.find((p) => p.kind === "LABOUR" && !p.site)?.key;
  const adminPool = pools.find((p) => p.driver === "LABOUR_MINUTES")?.key;
  for (const sl of slips) {
    const st = staffByXero.get(sl.employeeId);
    const gross = Number(sl.gross);
    if (!st) {
      const name = employees.get(sl.employeeId) ?? sl.employeeId;
      const cur = notes.unlinkedEmployees.find((u) => u.name === name);
      if (cur) cur.gross += gross;
      else notes.unlinkedEmployees.push({ name, gross });
      continue;
    }
    const targets: Array<[string | undefined, number]> =
      st.pool === "csr" ? [[csrPool, 1]] : st.pool === "admin" ? [[adminPool, 1]] : st.site === "both" ? sites.map((s) => [floorPool(s.key), 1 / sites.length]) : [[floorPool(st.site), 1]];
    for (const [k, share] of targets) {
      if (!k) continue;
      const l = (labour[k] ??= { gross: 0, super: 0, hours: 0, people: 0 });
      l.gross += gross * share;
      l.super += Number(sl.super) * share;
      l.hours += Number(sl.hours) * share;
      (people.get(k) ?? people.set(k, new Set()).get(k)!).add(st.id);
    }
  }
  for (const [k, set] of people) labour[k].people = set.size;

  // ---- overheads (and agency labour) from the Xero P&L
  const pnl = await prisma.xeroPnl.findMany({ where: { month } });
  const byCode = new Map(accMaps.map((a) => [a.accountCode, a]));
  const accounts: Record<string, number> = {};
  for (const row of pnl) {
    const mp = row.accountCode ? byCode.get(row.accountCode) : undefined;
    const isExpense = !/income|revenue|sales/i.test(row.section);
    if (!isExpense) continue;
    if (!mp || (mp.treatment === "INCLUDE" && !mp.poolKey)) {
      if (Number(row.amount)) notes.unmappedAccounts.push({ code: row.accountCode ?? "?", name: row.accountName, amount: Number(row.amount) });
      continue;
    }
    if (mp.treatment !== "INCLUDE" || !mp.poolKey) continue;
    accounts[mp.poolKey] = (accounts[mp.poolKey] ?? 0) + Number(row.amount);
  }

  // ---- WMS volumes → clients and standard services
  const vols = await prisma.volumeLine.groupBy({ by: ["source", "tenant", "wmsCode", "warehouse"], where: { date: { gte: from, lt: to } }, _sum: { quantity: true } });
  const orderRows = await prisma.orderFact.findMany({ where: { date: { gte: from, lt: to } }, select: { source: true, tenant: true, units: true } });
  const tenantClient = (source: string, tenant: string) =>
    clients.find((c) => (source === "THOMAX" ? [c.thomaxTenantId, c.dyspatchCustomerId] : source === "P3L" ? [c.p3lClientId] : [c.logiwaClientId, c.dyspatchCustomerId]).includes(tenant));
  const svcFor = (source: string, tenant: string, code: string) => maps.find((m) => m.source === source && m.tenant === tenant && m.wmsCode === code)?.serviceCode ?? maps.find((m) => m.source === source && m.tenant === "" && m.wmsCode === code)?.serviceCode;
  const siteFor = (warehouse: string, c: (typeof clients)[number]) => sites.find((s) => warehouse && s.wmsCodes.includes(warehouse))?.key ?? c.sites[0] ?? sites[0]?.key ?? "smi";
  const ec = new Map<string, EngineClient>();
  const clientRow = (c: (typeof clients)[number]) => {
    let e = ec.get(c.id);
    if (!e) {
      e = { id: c.id, name: c.shortName || c.name, sites: c.sites, cmcShare: c.cmcShare == null ? null : Number(c.cmcShare), revenue: null, orders: null, volumes: [], rates: {} };
      ec.set(c.id, e);
    }
    return e;
  };
  const svcCodes = new Set(services.map((s) => s.code));
  for (const v of vols) {
    const qty = Number(v._sum.quantity ?? 0);
    const c = tenantClient(v.source, v.tenant);
    if (!c) {
      const u = notes.unknownTenants.find((x) => x.source === v.source && x.tenant === v.tenant);
      if (u) u.lines++;
      else notes.unknownTenants.push({ source: v.source, tenant: v.tenant, lines: 1 });
      continue;
    }
    const code = svcFor(v.source, v.tenant, v.wmsCode);
    if (!code || !svcCodes.has(code)) {
      const u = notes.unmappedCodes.find((x) => x.source === v.source && x.code === v.wmsCode);
      if (u) u.qty += qty;
      else notes.unmappedCodes.push({ source: v.source, code: v.wmsCode, qty });
      continue;
    }
    clientRow(c).volumes.push({ serviceCode: code, site: siteFor(v.warehouse, c), qty });
  }
  const sizes = new Map<number, number>();
  for (const o of orderRows) {
    const c = tenantClient(o.source, o.tenant);
    if (c) {
      const e = clientRow(c);
      e.orders = (e.orders ?? 0) + 1;
    }
    const u = Math.max(1, Math.round(Number(o.units)));
    sizes.set(u, (sizes.get(u) ?? 0) + 1);
  }

  // ---- revenue from Xero sales lines (processing income accounts only)
  const incomeMaps = accMaps.filter((a) => a.side === "INCOME");
  notes.noIncomeMapping = !incomeMaps.length;
  const included = new Set(incomeMaps.filter((a) => a.treatment === "INCLUDE").map((a) => a.accountCode));
  const linked = clients.filter((c) => c.xeroContactId);
  if (linked.length && incomeMaps.length) {
    const lines = await prisma.xeroSaleLine.findMany({ where: { sale: { contactId: { in: linked.map((c) => c.xeroContactId!) }, date: { gte: from, lt: to }, status: { in: ["AUTHORISED", "PAID"] } } }, select: { amount: true, accountCode: true, sale: { select: { contactId: true } } } });
    for (const c of linked) {
      const rev = lines.filter((l) => l.sale.contactId === c.xeroContactId && l.accountCode && included.has(l.accountCode)).reduce((a, l) => a + Number(l.amount), 0);
      if (rev || ec.has(c.id)) clientRow(c).revenue = rev;
    }
  }
  for (const r of rates) {
    const e = ec.get(r.clientId);
    if (e) e.rates[r.serviceCode] = Number(r.rate);
  }

  const input: EngineInput = {
    month,
    days,
    rules: { superRate: rules.superRate ?? 0.12, payrollTaxRate: rules.payrollTaxRate ?? 0, workersCompRate: rules.workersCompRate, csrUtil: rules.csrUtil ?? 0.8, b2bUnits: rules.b2bUnits ?? 20 },
    sites: sites.map((s) => ({ key: s.key, name: s.name, labourUtil: Number(s.labourUtil), palletPositions: s.palletPositions, spaceUtil: s.spaceUtil == null ? null : Number(s.spaceUtil), notionalRent: s.notionalRent == null ? null : Number(s.notionalRent), owned: s.owned })),
    pools: pools.map((p) => ({ key: p.key, name: p.name, kind: p.kind, site: p.site, driver: p.driver, capacity: p.capacity == null ? null : Number(p.capacity) })),
    labour,
    accounts,
    services: services.map((s) => ({ code: s.code, name: s.name, unit: s.unit, poolKind: s.poolKind, minutes: s.minutes == null ? null : Number(s.minutes), overheads: (s.overheads ?? {}) as Record<string, number>, billable: s.billable, role: s.role })),
    clients: [...ec.values()],
    orderSizes: [...sizes.entries()].sort((a, b) => a[0] - b[0]).map(([units, orders]) => ({ units, orders })),
  };
  notes.unmappedAccounts.sort((a, b) => b.amount - a.amount);
  notes.unmappedCodes.sort((a, b) => b.qty - a.qty);
  return { input, notes };
}
