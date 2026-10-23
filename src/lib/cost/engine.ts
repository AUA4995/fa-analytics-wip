/**
 * Cost engine (brief §6) — pure: inputs in, results out, every number traceable to its parts.
 *
 *   TDABC (practical capacity): pool cost ÷ practical capacity → clients get only what they used; the rest is
 *   reported as Unused capacity (by resource: floor staff per site, CSR, space per site, machines).
 *   Full absorption: pool cost ÷ what was actually used → every dollar spread over clients.
 *
 * Labour pools: gross + super + payroll tax + workers comp (+ agency labour accounts mapped to the pool), priced per
 * activity minute. Overhead pools: Xero P&L accounts mapped to the pool (+ notional rent for an owned site), spread by
 * their driver. A service costs: minutes × cost per minute + admin per labour minute + its overhead drivers.
 */

export type Variant = "T" | "F";

export interface EngineRules {
  superRate: number;
  payrollTaxRate: number;
  workersCompRate: number | null;
  csrUtil: number;
  b2bUnits: number;
}
export interface EngineSite {
  key: string;
  name: string;
  labourUtil: number;
  palletPositions: number | null;
  spaceUtil: number | null;
  notionalRent: number | null;
  owned: boolean;
}
export interface EnginePool {
  key: string;
  name: string;
  kind: "LABOUR" | "OVERHEAD";
  site: string | null;
  driver: string;
  capacity: number | null;
}
export interface EngineService {
  code: string;
  name: string;
  unit: string;
  poolKind: string | null;
  minutes: number | null;
  /** pool key (may contain "{site}") → driver units per unit of service */
  overheads: Record<string, number>;
  billable: boolean;
  role: string | null;
}
export interface EngineClient {
  id: string;
  name: string;
  sites: string[];
  cmcShare: number | null;
  /** Processing revenue billed in Xero for the month (postage excluded); null = not linked to Xero */
  revenue: number | null;
  /** Orders in the month (WMS orders); null → counted from the ORDER service volume */
  orders: number | null;
  volumes: Array<{ serviceCode: string; site: string; qty: number }>;
  rates: Record<string, number>;
}
export interface EngineInput {
  month: string;
  days: number;
  rules: EngineRules;
  sites: EngineSite[];
  pools: EnginePool[];
  /** Payroll per pool key: gross, super, paid hours, people */
  labour: Record<string, { gross: number; super: number; hours: number; people: number }>;
  /** Xero P&L amounts per pool key (accounts mapped INCLUDE) */
  accounts: Record<string, number>;
  services: EngineService[];
  clients: EngineClient[];
  /** FA-wide order size distribution for cost per order (units per order → number of orders) */
  orderSizes: Array<{ units: number; orders: number }>;
}

export interface Part {
  label: string;
  amount: number;
  /** what to open for detail: pool:key, service:CODE, rule:key, site:key */
  ref?: string;
}
export interface PoolResult {
  key: string;
  name: string;
  kind: "LABOUR" | "OVERHEAD";
  site: string | null;
  driver: string;
  cost: number;
  costParts: Part[];
  /** In driver units (minutes for labour) */
  practical: number | null;
  used: number;
  usedPct: number | null;
  rateT: number | null;
  rateF: number | null;
  unused: number;
  unitLabel: string;
}
export interface UnitCost {
  total: number;
  parts: Part[];
}
export interface ClientLine {
  code: string;
  name: string;
  unit: string;
  qty: number;
  billable: boolean;
  unitT: number;
  unitF: number;
  costT: number;
  costF: number;
  partsT: Part[];
  partsF: Part[];
  rate: number | null;
  marginPctT: number | null;
  marginPctF: number | null;
}
export interface ClientResult {
  id: string;
  name: string;
  orders: number;
  lines: ClientLine[];
  costT: number;
  costF: number;
  revenue: number | null;
  /** Σ rate × qty where rates are known (what should have been billed for these services) */
  expected: number | null;
  /** xero = whole-client margin on Xero processing revenue; rated = only the services with a known rate */
  marginBasis: "xero" | "rated" | null;
  marginT: number | null;
  marginF: number | null;
  cpoT: number | null;
  cpoF: number | null;
}
export interface EngineResult {
  month: string;
  pools: PoolResult[];
  unit: (code: string, v: Variant, site: string) => UnitCost;
  clients: ClientResult[];
  base: Record<Variant, { b2c: Segment; b2b: Segment; all: Segment }>;
  unused: { total: number; pct: number | null; rows: PoolResult[] };
  totals: { costT: number; costF: number; revenue: number; orders: number; labourMinutesUsed: number };
  warnings: string[];
}
export interface Segment {
  orders: number;
  unitsPerOrder: number;
  cpo: number | null;
}

const WEEKS = (days: number) => days / 7;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function runEngine(inp: EngineInput): EngineResult {
  const warnings: string[] = [];
  const svc = new Map(inp.services.map((s) => [s.code, s]));
  const site = new Map(inp.sites.map((s) => [s.key, s]));
  const pools = new Map(inp.pools.map((p) => [p.key, p]));
  const labourPoolFor = (siteKey: string, poolKind: string | null): string | null => {
    if (poolKind === "csr") return inp.pools.find((p) => p.kind === "LABOUR" && !p.site)?.key ?? null;
    if (poolKind === "floor") return inp.pools.find((p) => p.kind === "LABOUR" && p.site === siteKey)?.key ?? null;
    return null;
  };
  const resolve = (key: string, siteKey: string) => key.replace("{site}", siteKey);
  const adminPool = inp.pools.find((p) => p.driver === "LABOUR_MINUTES");
  const revenuePools = inp.pools.filter((p) => p.driver === "REVENUE");

  // ---- 1. orders and packing per client
  const clientOrders = new Map<string, number>();
  for (const c of inp.clients) {
    const fromVol = c.volumes.filter((v) => svc.get(v.serviceCode)?.role === "ORDER").reduce((a, v) => a + v.qty, 0);
    clientOrders.set(c.id, c.orders ?? fromVol);
  }
  const packMan = inp.services.find((s) => s.role === "PACK_MANUAL");
  const packCmc = inp.services.find((s) => s.role === "PACK_CMC");
  /** Activity per client: volumes + packing pseudo-volumes (orders × method share), per site */
  const activity = (c: EngineClient) => {
    const out = c.volumes.filter((v) => svc.has(v.serviceCode)).map((v) => ({ ...v }));
    const orders = clientOrders.get(c.id) ?? 0;
    if (orders > 0 && (packMan || packCmc)) {
      const siteKey = c.volumes.find((v) => svc.get(v.serviceCode)?.role === "ORDER")?.site ?? c.sites[0] ?? inp.sites[0]?.key ?? "smi";
      const cmc = packCmc ? (c.cmcShare ?? 0) : 0;
      if (packCmc && cmc > 0) out.push({ serviceCode: packCmc.code, site: siteKey, qty: orders * cmc });
      if (packMan && cmc < 1) out.push({ serviceCode: packMan.code, site: siteKey, qty: orders * (1 - cmc) });
    }
    return out;
  };
  const acts = new Map(inp.clients.map((c) => [c.id, activity(c)]));

  // ---- 2. driver usage
  const used = new Map<string, number>(inp.pools.map((p) => [p.key, 0]));
  const add = (k: string | null, n: number) => k && used.has(k) && used.set(k, (used.get(k) ?? 0) + n);
  let labourMinutes = 0;
  const totalOrders = [...clientOrders.values()].reduce((a, b) => a + b, 0);
  const totalRevenue = inp.clients.reduce((a, c) => a + (c.revenue ?? 0), 0);
  const missingMinutes = new Set<string>();
  for (const c of inp.clients)
    for (const a of acts.get(c.id) ?? []) {
      const s = svc.get(a.serviceCode)!;
      if (s.poolKind) {
        if (s.minutes == null) missingMinutes.add(s.code);
        const m = (s.minutes ?? 0) * a.qty;
        add(labourPoolFor(a.site, s.poolKind), m);
        labourMinutes += m;
      }
      for (const [k, n] of Object.entries(s.overheads)) add(resolve(k, a.site), n * a.qty);
    }
  for (const p of inp.pools) {
    const listed = inp.services.some((s) => Object.keys(s.overheads).some((k) => resolve(k, p.site ?? "") === p.key || k === p.key));
    if (listed) continue;
    if (p.driver === "LABOUR_MINUTES") used.set(p.key, labourMinutes);
    else if (p.driver === "ORDERS" || p.driver === "ORDERS_PACKED") used.set(p.key, totalOrders);
    else if (p.driver === "REVENUE") used.set(p.key, totalRevenue);
    else if (p.driver === "MACHINE_ORDERS" && p.key.includes("cmc")) used.set(p.key, inp.clients.reduce((a, c) => a + (clientOrders.get(c.id) ?? 0) * (c.cmcShare ?? 0), 0));
  }
  if (missingMinutes.size) warnings.push(`No standard minutes yet for ${[...missingMinutes].join(", ")} — their labour is counted as zero (Settings → Services & minutes).`);

  // ---- 3. pool costs and rates
  const wc = inp.rules.workersCompRate;
  if (wc == null) warnings.push("Workers comp rate isn't set — left out of labour cost (Settings → Rules).");
  const poolResults: PoolResult[] = inp.pools.map((p) => {
    const lab = inp.labour[p.key];
    const parts: Part[] = [];
    if (lab && lab.gross) {
      parts.push({ label: `Gross pay · ${lab.people} people`, amount: lab.gross });
      parts.push({ label: "Superannuation (actual from payslips)", amount: lab.super, ref: "rule:superRate" });
      parts.push({ label: `Payroll tax · ${pct(inp.rules.payrollTaxRate)} of gross`, amount: lab.gross * inp.rules.payrollTaxRate, ref: "rule:payrollTaxRate" });
      if (wc) parts.push({ label: `Workers comp · ${pct(wc)} of gross`, amount: lab.gross * wc, ref: "rule:workersCompRate" });
    }
    if (inp.accounts[p.key]) parts.push({ label: p.kind === "LABOUR" ? "Agency / other labour (Xero accounts)" : "Xero accounts mapped to this pool", amount: inp.accounts[p.key] });
    const s = p.site ? site.get(p.site) : undefined;
    if (p.driver === "PALLET_WEEKS" && s?.owned && s.notionalRent) parts.push({ label: `Notional rent · ${s.name} (owned)`, amount: s.notionalRent, ref: `site:${s.key}` });
    const cost = parts.reduce((a, x) => a + x.amount, 0);
    let practical: number | null = null;
    let u = used.get(p.key) ?? 0;
    let unitLabel = UNIT_LABEL[p.driver] ?? "unit";
    if (p.kind === "LABOUR" && p.driver === "MINUTES") {
      const util = p.site ? (s?.labourUtil ?? 0.85) : inp.rules.csrUtil;
      practical = (lab?.hours ?? 0) * 60 * util;
      unitLabel = "minute";
      if (!lab?.hours && cost) warnings.push(`${p.name}: no paid hours from payroll — cost per minute can't be worked out.`);
      if (practical && u > practical) warnings.push(`${p.name}: activity minutes (${Math.round(u)}) are more than practical capacity (${Math.round(practical)}) — standard minutes may be too high or utilisation too low.`);
    } else if (p.driver === "PALLET_WEEKS" && s?.palletPositions) {
      practical = s.palletPositions * WEEKS(inp.days);
      // No storage volumes measured → Full absorption spreads rent over the space used (positions used ÷ total)
      if (u === 0 && s.spaceUtil != null) u = practical * s.spaceUtil;
    } else if (p.capacity) practical = p.capacity;
    const cap = practical && practical > 0 ? practical : null;
    const uEff = cap ? Math.min(u, cap) : u;
    const rateT = cap ? cost / cap : uEff > 0 ? cost / uEff : null;
    const rateF = uEff > 0 ? cost / uEff : null;
    const unused = cap && rateT != null ? Math.max(0, cost - uEff * rateT) : 0;
    return { key: p.key, name: p.name, kind: p.kind, site: p.site, driver: p.driver, cost: r2(cost), costParts: parts, practical: cap, used: uEff, usedPct: cap ? uEff / cap : null, rateT, rateF, unused: r2(unused), unitLabel };
  });
  const pr = new Map(poolResults.map((p) => [p.key, p]));
  const rate = (k: string, v: Variant) => (v === "T" ? pr.get(k)?.rateT : pr.get(k)?.rateF) ?? 0;

  // ---- 4. unit cost of a service at a site
  const unit = (code: string, v: Variant, siteKey: string): UnitCost => {
    const s = svc.get(code);
    if (!s) return { total: 0, parts: [] };
    const parts: Part[] = [];
    if (s.poolKind && s.minutes) {
      const lp = labourPoolFor(siteKey, s.poolKind);
      if (lp) parts.push({ label: `Labour · ${s.minutes} min × ${money(rate(lp, v), 4)} (${pools.get(lp)?.name})`, amount: s.minutes * rate(lp, v), ref: `pool:${lp}` });
      if (adminPool) parts.push({ label: `Admin share · ${s.minutes} min × ${money(rate(adminPool.key, v), 4)}`, amount: s.minutes * rate(adminPool.key, v), ref: `pool:${adminPool.key}` });
    }
    for (const [k0, n] of Object.entries(s.overheads)) {
      const k = resolve(k0, siteKey);
      const p = pools.get(k);
      if (!p) continue;
      parts.push({ label: `${p.name} · ${n} ${pr.get(k)?.unitLabel ?? ""} × ${money(rate(k, v), 4)}`, amount: n * rate(k, v), ref: `pool:${k}` });
    }
    // Per-order pools not listed on any service: one per order (ORDER role) / per order packed (PACK roles)
    for (const p of inp.pools) {
      if (Object.keys(s.overheads).some((k) => resolve(k, siteKey) === p.key)) continue;
      if (inp.services.some((sv) => Object.keys(sv.overheads).some((k) => resolve(k, siteKey) === p.key || k === p.key))) continue;
      if ((p.driver === "ORDERS" && s.role === "ORDER") || (p.driver === "ORDERS_PACKED" && (s.role === "PACK_MANUAL" || s.role === "PACK_CMC")) || (p.driver === "MACHINE_ORDERS" && p.key.includes("cmc") && s.role === "PACK_CMC"))
        parts.push({ label: `${p.name} · 1 order × ${money(rate(p.key, v), 4)}`, amount: rate(p.key, v), ref: `pool:${p.key}` });
    }
    return { total: parts.reduce((a, x) => a + x.amount, 0), parts };
  };

  // ---- 5. clients
  const revPoolRate = (v: Variant) => revenuePools.reduce((a, p) => a + rate(p.key, v), 0);
  const clients: ClientResult[] = inp.clients.map((c) => {
    const byCode = new Map<string, Array<{ site: string; qty: number }>>();
    for (const a of acts.get(c.id) ?? []) byCode.set(a.serviceCode, [...(byCode.get(a.serviceCode) ?? []), { site: a.site, qty: a.qty }]);
    const lines: ClientLine[] = [...byCode.entries()].map(([code, rows]) => {
      const s = svc.get(code)!;
      const qty = rows.reduce((a, r) => a + r.qty, 0);
      const cost = (v: Variant) => rows.reduce((a, r) => a + unit(code, v, r.site).total * r.qty, 0);
      const main = rows.reduce((a, r) => (r.qty > a.qty ? r : a), rows[0]);
      const costT = cost("T");
      const costF = cost("F");
      const unitT = qty ? costT / qty : 0;
      const unitF = qty ? costF / qty : 0;
      const rt = s.billable ? (c.rates[code] ?? null) : null;
      return {
        code,
        name: s.name,
        unit: s.unit,
        qty,
        billable: s.billable,
        unitT,
        unitF,
        costT,
        costF,
        partsT: unit(code, "T", main.site).parts,
        partsF: unit(code, "F", main.site).parts,
        rate: rt,
        marginPctT: rt ? (rt - unitT) / rt : null,
        marginPctF: rt ? (rt - unitF) / rt : null,
      };
    });
    lines.sort((a, b) => b.costT - a.costT);
    let costT = lines.reduce((a, l) => a + l.costT, 0);
    let costF = lines.reduce((a, l) => a + l.costF, 0);
    if (c.revenue && revenuePools.length) {
      costT += c.revenue * revPoolRate("T");
      costF += c.revenue * revPoolRate("F");
    }
    const withRate = lines.filter((l) => l.rate != null);
    const expected = withRate.length ? withRate.reduce((a, l) => a + (l.rate ?? 0) * l.qty, 0) : null;
    const orders = clientOrders.get(c.id) ?? 0;
    // Without Xero revenue, compare only the rated services with their own cost (never rate-less lines against nothing)
    const basis: ClientResult["marginBasis"] = c.revenue != null ? "xero" : expected ? "rated" : null;
    const ratedCost = (v: Variant) => withRate.reduce((a, l) => a + (v === "T" ? l.costT : l.costF), 0);
    const margin = (v: Variant) => (basis === "xero" ? (c.revenue ? (c.revenue - (v === "T" ? costT : costF)) / c.revenue : null) : basis === "rated" ? (expected! - ratedCost(v)) / expected! : null);
    return {
      id: c.id,
      name: c.name,
      orders,
      lines,
      costT,
      costF,
      revenue: c.revenue,
      expected,
      marginBasis: basis,
      marginT: margin("T"),
      marginF: margin("F"),
      cpoT: orders ? costT / orders : null,
      cpoF: orders ? costF / orders : null,
    };
  });
  clients.sort((a, b) => b.costT - a.costT);

  // ---- 6. FA cost per order, B2C vs B2B (an order = per-order services + packing blend + units × per-unit services)
  const siteOrders = new Map<string, number>();
  for (const c of inp.clients) for (const v of c.volumes) if (svc.get(v.serviceCode)?.role === "ORDER") siteOrders.set(v.site, (siteOrders.get(v.site) ?? 0) + v.qty);
  const siteW = siteOrders.size ? [...siteOrders.entries()] : inp.sites.slice(0, 1).map((s) => [s.key, 1] as [string, number]);
  const wTot = siteW.reduce((a, [, n]) => a + n, 0) || 1;
  const avgUnit = (code: string, v: Variant) => siteW.reduce((a, [k, n]) => a + unit(code, v, k).total * (n / wTot), 0);
  const faCmc = totalOrders ? inp.clients.reduce((a, c) => a + (clientOrders.get(c.id) ?? 0) * (c.cmcShare ?? 0), 0) / totalOrders : 0;
  const perOrder = inp.services.filter((s) => s.role === "ORDER");
  const perUnit = inp.services.filter((s) => !s.role && s.unit.toLowerCase() === "unit" && s.poolKind === "floor");
  const orderCost = (units: number, v: Variant) =>
    perOrder.reduce((a, s) => a + avgUnit(s.code, v), 0) +
    (packCmc ? faCmc * avgUnit(packCmc.code, v) : 0) +
    (packMan ? (1 - (packCmc ? faCmc : 0)) * avgUnit(packMan.code, v) : 0) +
    units * perUnit.reduce((a, s) => a + avgUnit(s.code, v), 0);
  const segment = (rows: Array<{ units: number; orders: number }>, v: Variant): Segment => {
    const n = rows.reduce((a, r) => a + r.orders, 0);
    if (!n) return { orders: 0, unitsPerOrder: 0, cpo: null };
    return { orders: n, unitsPerOrder: rows.reduce((a, r) => a + r.units * r.orders, 0) / n, cpo: perOrder.length || perUnit.length ? rows.reduce((a, r) => a + orderCost(r.units, v) * r.orders, 0) / n : null };
  };
  const b2b = (r: { units: number }) => r.units > inp.rules.b2bUnits;
  const base = Object.fromEntries(
    (["T", "F"] as Variant[]).map((v) => [v, { b2c: segment(inp.orderSizes.filter((r) => !b2b(r)), v), b2b: segment(inp.orderSizes.filter(b2b), v), all: segment(inp.orderSizes, v) }]),
  ) as EngineResult["base"];
  if (!inp.orderSizes.length) {
    // Without an orders file, "all orders" still works from volumes: average units = per-unit volume ÷ orders
    const unitVol = inp.clients.reduce((a, c) => a + c.volumes.filter((v) => perUnit.some((s) => s.code === v.serviceCode)).reduce((x, v) => x + v.qty, 0), 0);
    if (totalOrders > 0) for (const v of ["T", "F"] as Variant[]) base[v].all = { orders: totalOrders, unitsPerOrder: unitVol / totalOrders, cpo: orderCost(unitVol / totalOrders, v) };
    warnings.push("No WMS orders file for this month — B2C / B2B split needs it (Data sources → WMS); “all orders” uses average units from volumes.");
  }
  if (!perOrder.length) warnings.push("No service is marked “one per order” (Settings → Services & minutes → Role).");

  const unusedRows = poolResults.filter((p) => p.practical && p.cost > 0);
  const unusedTotal = unusedRows.reduce((a, p) => a + p.unused, 0);
  const capCost = unusedRows.reduce((a, p) => a + p.cost, 0);
  for (const p of poolResults) if (p.cost === 0 && (used.get(p.key) ?? 0) > 0) warnings.push(`${p.name} has activity but no cost this month (no payroll / Xero accounts mapped).`);

  return {
    month: inp.month,
    pools: poolResults,
    unit,
    clients,
    base,
    unused: { total: unusedTotal, pct: capCost ? unusedTotal / capCost : null, rows: unusedRows },
    totals: { costT: clients.reduce((a, c) => a + c.costT, 0), costF: clients.reduce((a, c) => a + c.costF, 0), revenue: totalRevenue, orders: totalOrders, labourMinutesUsed: labourMinutes },
    warnings,
  };
}

const UNIT_LABEL: Record<string, string> = {
  MINUTES: "minute",
  LABOUR_MINUTES: "labour minute",
  PALLET_WEEKS: "pallet-week",
  PALLET_MOVES: "pallet move",
  ORDERS: "order",
  ORDERS_PACKED: "order packed",
  MACHINE_ORDERS: "machine order",
  REVENUE: "$ of revenue",
};
const pct = (n: number) => `${Math.round(n * 10000) / 100}%`;
const money = (n: number, dp = 2) => `$${n.toFixed(dp)}`;
