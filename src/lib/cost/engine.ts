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
 *
 * Batch 3 (16/11/2026):
 *   • rent by space type — practical capacity = pallets + bins × bin size + bays × bay size (in pallet-equivalents)
 *   • client-level drivers (office split): TICKET_SCORE (support, weighted tickets) and INVOICES_TICKETS (accounts:
 *     invoices and accounts tickets) spread the pool by each client's share, not per service. A labour pool with one
 *     of these drivers takes no activity minutes (no double count).
 */

export type Variant = "T" | "F";

export interface EngineRules {
  superRate: number;
  payrollTaxRate: number;
  workersCompRate: number | null;
  csrUtil: number;
  b2bUnits: number;
  /** Pallet-equivalents per bin / per bay; null = not set (bins / bays then left out of capacity) */
  binSize?: number | null;
  baySize?: number | null;
  /** INVOICES_TICKETS: weight of invoices (rest = accounts ticket score) */
  accountsInvoiceShare?: number | null;
}
export interface EngineSite {
  key: string;
  name: string;
  labourUtil: number;
  palletPositions: number | null;
  binPositions?: number | null;
  bayPositions?: number | null;
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
  /** Batch 3 office split: Xero sales invoices this month, weighted ticket scores (support / accounts) */
  invoices?: number | null;
  supportScore?: number | null;
  accountsScore?: number | null;
  /** Postage and freight re-billed to the client this month (Xero sales lines on POSTAGE income accounts) */
  postageRevenue?: number | null;
}

/** Drivers spread by each client's share instead of per service (batch 3). */
export const CLIENT_DRIVERS = ["TICKET_SCORE", "INVOICES_TICKETS"] as const;
export const isClientDriver = (d: string) => (CLIENT_DRIVERS as readonly string[]).includes(d);
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
  /** Carrier / postage cost for the month (Xero expense accounts mapped POSTAGE) */
  postageCost?: number;
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
    const k =
      poolKind === "csr" ? (inp.pools.find((p) => p.kind === "LABOUR" && !p.site)?.key ?? null) : poolKind === "floor" ? (inp.pools.find((p) => p.kind === "LABOUR" && p.site === siteKey)?.key ?? null) : null;
    // A labour pool spread by a client-level driver (e.g. support by ticket score) takes no activity minutes.
    return k && isClientDriver(pools.get(k)?.driver ?? "") ? null : k;
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
  // Orders actually charged (ORDER-role lines): per-order pools are spread on these, the same lines that carry their cost
  const chargedOrders = inp.clients.reduce((a, c) => a + c.volumes.filter((v) => svc.get(v.serviceCode)?.role === "ORDER").reduce((x, v) => x + v.qty, 0), 0);
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

  // Rent by space type (batch 3 review): a bin-week or bay-week uses its size in pallet-equivalents of the rent pool,
  // the same conversion as the site's capacity. Size not set → 0 (left out, like the capacity) with a warning.
  const spaceWarned = new Set<string>();
  const spaceFactor = (s: { code: string; unit: string }, poolKey: string | null): number => {
    if (!poolKey || pools.get(poolKey)?.driver !== "PALLET_WEEKS") return 1;
    const kind = /\bbins?\b/i.test(s.unit) ? "bin" : /\bbays?\b/i.test(s.unit) ? "bay" : null;
    if (!kind) return 1;
    const size = kind === "bin" ? inp.rules.binSize : inp.rules.baySize;
    if (size && size > 0) return size;
    if (!spaceWarned.has(kind)) {
      spaceWarned.add(kind);
      warnings.push(`${s.code} is charged per ${kind}, but the ${kind} size in pallet-equivalents isn't set — its storage is left out of rent (Settings → Rules).`);
    }
    return 0;
  };

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
      const lpk = s.poolKind ? labourPoolFor(a.site, s.poolKind) : null;
      // A labour pool spread by client share (support, accounts) isn't priced per minute
      if (s.poolKind && !(lpk && isClientDriver(pools.get(lpk)?.driver ?? ""))) {
        if (s.minutes == null) missingMinutes.add(s.code);
        const m = (s.minutes ?? 0) * a.qty;
        add(lpk, m);
        labourMinutes += m;
      }
      for (const [k, n] of Object.entries(s.overheads)) {
        const pk = resolve(k, a.site);
        add(pk, n * a.qty * spaceFactor(s, pk));
      }
    }
  for (const p of inp.pools) {
    const listed = inp.services.some((s) => Object.keys(s.overheads).some((k) => resolve(k, p.site ?? "") === p.key || k === p.key));
    if (listed) continue;
    if (p.driver === "LABOUR_MINUTES") used.set(p.key, labourMinutes);
    else if (p.driver === "ORDERS") used.set(p.key, chargedOrders || totalOrders);
    else if (p.driver === "ORDERS_PACKED") used.set(p.key, totalOrders);
    else if (p.driver === "REVENUE") used.set(p.key, totalRevenue);
    else if (p.driver === "MACHINE_ORDERS" && p.key.includes("cmc")) {
      // Orders through the CMC: each client's share typed in Settings → Clients until the WMS records which orders went through it
      used.set(p.key, inp.clients.reduce((a, c) => a + (clientOrders.get(c.id) ?? 0) * (c.cmcShare ?? 0), 0));
      const blank = inp.clients.filter((c) => c.cmcShare == null && (clientOrders.get(c.id) ?? 0) > 0);
      if (inp.accounts[p.key] && blank.length) warnings.push(`${p.name}: ${blank.length} client${blank.length === 1 ? " has" : "s have"} no "Orders packed on the CMC" share — counted as 0% (Settings → Clients). It's an estimate until the WMS records which orders went through the machine.`);
    }
    else if (p.driver === "MACHINE_ORDERS") {
      // Other machines (e.g. the sorter): which orders go through them isn't recorded yet → every charged order
      used.set(p.key, chargedOrders || totalOrders);
      if (inp.accounts[p.key]) warnings.push(`${p.name}: which orders go through it isn't recorded yet — spread over every order for now.`);
    }
    else if (isClientDriver(p.driver)) used.set(p.key, 1); // 100% of the pool, spread by client share (step 5)
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
    } else if (p.driver === "PALLET_WEEKS" && s && (s.palletPositions || s.binPositions || s.bayPositions)) {
      // Rent by space type (batch 3): bins and bays in pallet-equivalents; left out while their size isn't set
      const bins = s.binPositions && inp.rules.binSize ? s.binPositions * inp.rules.binSize : 0;
      const bays = s.bayPositions && inp.rules.baySize ? s.bayPositions * inp.rules.baySize : 0;
      if (s.binPositions && !inp.rules.binSize) warnings.push(`${s.name}: ${s.binPositions} bins aren't in rent capacity yet — set the bin size in pallet-equivalents (Settings → Rules).`);
      if (s.bayPositions && !inp.rules.baySize) warnings.push(`${s.name}: ${s.bayPositions} bays aren't in rent capacity yet — set the bay size in pallet-equivalents (Settings → Rules).`);
      practical = ((s.palletPositions ?? 0) + bins + bays) * WEEKS(inp.days);
      // No storage volumes measured → Full absorption spreads rent over the space used (positions used ÷ total)
      if (u === 0 && s.spaceUtil != null) u = practical * s.spaceUtil;
    } else if (isClientDriver(p.driver)) {
      unitLabel = "share";
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
      const lp0 = labourPoolFor(siteKey, s.poolKind);
      const lp = lp0 && !isClientDriver(pools.get(lp0)?.driver ?? "") ? lp0 : null;
      if (lp) parts.push({ label: `Labour · ${s.minutes} min × ${money(rate(lp, v), 4)} (${pools.get(lp)?.name})`, amount: s.minutes * rate(lp, v), ref: `pool:${lp}` });
      if (adminPool) parts.push({ label: `Admin share · ${s.minutes} min × ${money(rate(adminPool.key, v), 4)}`, amount: s.minutes * rate(adminPool.key, v), ref: `pool:${adminPool.key}` });
    }
    for (const [k0, n0] of Object.entries(s.overheads)) {
      const k = resolve(k0, siteKey);
      const p = pools.get(k);
      if (!p) continue;
      const n = n0 * spaceFactor(s, k);
      parts.push({ label: `${p.name} · ${n} ${pr.get(k)?.unitLabel ?? ""} × ${money(rate(k, v), 4)}`, amount: n * rate(k, v), ref: `pool:${k}` });
    }
    // Per-order pools not listed on any service: one per order (ORDER role) / per order packed (PACK roles)
    for (const p of inp.pools) {
      if (Object.keys(s.overheads).some((k) => resolve(k, siteKey) === p.key)) continue;
      if (inp.services.some((sv) => Object.keys(sv.overheads).some((k) => resolve(k, siteKey) === p.key || k === p.key))) continue;
      if (
        (p.driver === "ORDERS" && s.role === "ORDER") ||
        (p.driver === "ORDERS_PACKED" && (s.role === "PACK_MANUAL" || s.role === "PACK_CMC")) ||
        (p.driver === "MACHINE_ORDERS" && p.key.includes("cmc") && s.role === "PACK_CMC") ||
        (p.driver === "MACHINE_ORDERS" && !p.key.includes("cmc") && s.role === "ORDER")
      )
        parts.push({ label: `${p.name} · 1 order × ${money(rate(p.key, v), 4)}`, amount: rate(p.key, v), ref: `pool:${p.key}` });
    }
    return { total: parts.reduce((a, x) => a + x.amount, 0), parts };
  };

  // ---- 5. clients
  const revPoolRate = (v: Variant) => revenuePools.reduce((a, p) => a + rate(p.key, v), 0);
  const totRevAll = inp.clients.reduce((a, c) => a + (c.revenue ?? 0), 0);
  const revCost = (k: string) => pr.get(k)?.cost ?? 0;
  if (!totRevAll && revenuePools.some((p) => revCost(p.key) > 0)) warnings.push(`No Xero revenue for ${inp.month} — ${revenuePools.filter((p) => revCost(p.key) > 0).map((p) => p.name).join(", ")} spread by orders instead.`);
  // Client-level pools (batch 3 office split): each client's share of the pool
  const sum = (f: (c: EngineClient) => number) => inp.clients.reduce((a, c) => a + f(c), 0);
  const totSupport = sum((c) => c.supportScore ?? 0);
  const totAcct = sum((c) => c.accountsScore ?? 0);
  const totInv = sum((c) => c.invoices ?? 0);
  const invW = Math.min(1, Math.max(0, inp.rules.accountsInvoiceShare ?? 0.5));
  const shareOf = (driver: string, c: EngineClient): number => {
    if (driver === "TICKET_SCORE") return totSupport ? (c.supportScore ?? 0) / totSupport : 0;
    if (driver === "INVOICES_TICKETS") {
      const inv = totInv ? (c.invoices ?? 0) / totInv : null;
      const acc = totAcct ? (c.accountsScore ?? 0) / totAcct : null;
      if (inv != null && acc != null) return invW * inv + (1 - invW) * acc;
      return inv ?? acc ?? 0;
    }
    return 0;
  };
  // No scores / invoices this month: spread by revenue (or orders) instead, so the cost never disappears from the totals
  const totRev = sum((c) => c.revenue ?? 0);
  const fallbackShare = (c: EngineClient) => (totRev ? (c.revenue ?? 0) / totRev : totalOrders ? (clientOrders.get(c.id) ?? 0) / totalOrders : 0);
  const noData = (driver: string) => (driver === "TICKET_SCORE" ? !totSupport : driver === "INVOICES_TICKETS" ? !totInv && !totAcct : false);
  const shareFor = (driver: string, c: EngineClient) => (noData(driver) ? fallbackShare(c) : shareOf(driver, c));
  const clientPools = poolResults.filter((p) => isClientDriver(p.driver) && p.cost > 0);
  // Full absorption spreads every dollar: a pool with cost but no measured use this month (e.g. a machine whose
  // orders aren't recorded yet) is spread over all orders in Full absorption; TDABC shows it as unused capacity.
  const idlePools = poolResults.filter((p) => p.cost > 0 && !(p.used > 0) && !isClientDriver(p.driver) && p.driver !== "REVENUE");
  const idleCost = idlePools.reduce((a, p) => a + p.cost, 0);
  for (const p of idlePools)
    warnings.push(`${p.name}: no use measured this month — Full absorption spreads its ${money(p.cost, 0)} over all orders; TDABC shows it as unused capacity.`);
  for (const p of clientPools) {
    if (p.driver === "TICKET_SCORE" && !totSupport) warnings.push(`${p.name}: no weighted ticket scores this month — spread by ${totRev ? "revenue" : "orders"} until there are (Data sources → Front → Recount).`);
    if (p.driver === "INVOICES_TICKETS" && !totInv && !totAcct) warnings.push(`${p.name}: no invoices or accounts tickets this month — spread by ${totRev ? "revenue" : "orders"} until there are.`);
  }
  // Postage re-billed with a markup (agreed 06/11/2026): revenue plus a variable cost. Carrier bills aren't per client,
  // so the month's postage cost is spread by each client's share of postage re-billed.
  const postageCost = inp.postageCost ?? 0;
  const totPostRev = sum((c) => c.postageRevenue ?? 0);
  if (postageCost && !totPostRev) warnings.push("Postage cost is mapped but no postage re-billed is found this month — map the postage income accounts to “Postage (re-billed with markup)”.");
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
    for (const p of clientPools) {
      const sh = shareFor(p.driver, c);
      if (!sh) continue;
      const amt = p.cost * sh;
      const basisLabel = noData(p.driver) ? (totRev ? "revenue — no scores yet" : "orders — no scores yet") : p.driver === "TICKET_SCORE" ? "weighted tickets" : "invoices + accounts tickets";
      const part: Part = { label: `${p.name} · ${pct(sh)} share (${basisLabel})`, amount: amt, ref: `pool:${p.key}` };
      lines.push({ code: `pool:${p.key}`, name: p.name, unit: "share", qty: sh, billable: false, unitT: amt / sh, unitF: amt / sh, costT: amt, costF: amt, partsT: [part], partsF: [part], rate: null, marginPctT: null, marginPctF: null });
    }
    if (postageCost && totPostRev && c.postageRevenue) {
      const sh = c.postageRevenue / totPostRev;
      const amt = postageCost * sh;
      const part: Part = { label: `Postage & freight · ${pct(sh)} of postage re-billed × ${money(postageCost, 0)} carrier cost`, amount: amt };
      lines.push({ code: "postage", name: "Postage & freight (re-billed)", unit: "share", qty: sh, billable: true, unitT: amt / sh, unitF: amt / sh, costT: amt, costF: amt, partsT: [part], partsF: [part], rate: null, marginPctT: null, marginPctF: null });
    }
    lines.sort((a, b) => b.costT - a.costT);
    let costT = lines.reduce((a, l) => a + l.costT, 0);
    let costF = lines.reduce((a, l) => a + l.costF, 0);
    if (!totRevAll && revenuePools.length && chargedOrders) {
      // No Xero revenue this month: revenue pools spread by orders, so their cost isn't lost from the totals
      const sh = (clientOrders.get(c.id) ?? 0) / (totalOrders || 1);
      for (const p of revenuePools) {
        const amt = revCost(p.key) * sh;
        if (!amt) continue;
        const part: Part = { label: `${p.name} · ${pct(sh)} share (orders — no Xero revenue this month)`, amount: amt, ref: `pool:${p.key}` };
        costT += amt;
        costF += amt;
        lines.push({ code: `pool:${p.key}`, name: p.name, unit: "share", qty: sh, billable: false, unitT: amt / sh, unitF: amt / sh, costT: amt, costF: amt, partsT: [part], partsF: [part], rate: null, marginPctT: null, marginPctF: null });
      }
    }
    if (idleCost && totalOrders) {
      const sh = (clientOrders.get(c.id) ?? 0) / totalOrders;
      for (const p of idlePools) {
        const amt = p.cost * sh;
        if (!amt) continue;
        const part: Part = { label: `${p.name} · ${pct(sh)} of orders (no use measured — Full absorption only)`, amount: amt, ref: `pool:${p.key}` };
        costF += amt;
        lines.push({ code: `idle:${p.key}`, name: `${p.name} (no use measured)`, unit: "share", qty: sh, billable: false, unitT: 0, unitF: amt / sh, costT: 0, costF: amt, partsT: [], partsF: [part], rate: null, marginPctT: null, marginPctF: null });
      }
    }
    if (c.revenue && revenuePools.length) {
      costT += c.revenue * revPoolRate("T");
      costF += c.revenue * revPoolRate("F");
    }
    const withRate = lines.filter((l) => l.rate != null);
    const expected = withRate.length ? withRate.reduce((a, l) => a + (l.rate ?? 0) * l.qty, 0) : null;
    const orders = clientOrders.get(c.id) ?? 0;
    // Without Xero revenue, compare only the rated services with their own cost (never rate-less lines against nothing)
    const basis: ClientResult["marginBasis"] = c.revenue != null ? "xero" : expected ? "rated" : null;
    const revenue = c.revenue != null ? c.revenue + (c.postageRevenue ?? 0) : null;
    const ratedCost = (v: Variant) => withRate.reduce((a, l) => a + (v === "T" ? l.costT : l.costF), 0);
    const margin = (v: Variant) => (basis === "xero" ? (revenue ? (revenue - (v === "T" ? costT : costF)) / revenue : null) : basis === "rated" ? (expected! - ratedCost(v)) / expected! : null);
    return {
      id: c.id,
      name: c.name,
      orders,
      lines,
      costT,
      costF,
      revenue,
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
  // Office pools spread by client share or revenue don't sit on a service: add them as an average per order
  const officePerOrder = totalOrders ? [...clientPools, ...poolResults.filter((p) => p.driver === "REVENUE")].reduce((a, p) => a + p.cost, 0) / totalOrders : 0;
  const orderCost = (units: number, v: Variant) =>
    officePerOrder +
    (v === "F" && totalOrders ? idleCost / totalOrders : 0) +
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
  TICKET_SCORE: "share",
  INVOICES_TICKETS: "share",
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
