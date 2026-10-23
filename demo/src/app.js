
(() => {
/* ================= COST ENGINE v2 (pure, no DOM) — all figures made up ================= */
const MONTH = "September 2026", MONTHS = ["Jul", "Aug", "Sep"];
const SITES = { smi: "Smithfield", par: "Parramatta" };
/* Settings: one store, used by Settings pages and every details panel (synced) */
const S = {
  superRate: 0.12, payrollTax: 0.0545, workersComp: 0.021,
  utilFloor_smi: 0.85, utilFloor_par: 0.85, utilCsr: 0.80,
  posTotal_smi: 5200, posUsed_smi: 4840, posTotal_par: 2100, posUsed_par: 2100,
  rent_smi: 78000, rentNotional_par: 26000,
  cmcCost: 15600, cmcCapacity: 68000, matMan: 0.55, matCmc: 0.38,
  b2b: 20, b2cCmcShare: 0.6,
  floor: 0.15, tolerance: 5, wkMin: 300, avgMonths: 3, casualShare: 0.25,
  min_RCV_CTN: 1.6, min_RCV_PLT: 14, min_STO_PLT: 0.5, min_PCK_UNIT: 0.35, min_PACK_MAN: 2.6, min_PACK_CMC: 0.9, min_RTN: 5, min_ACC_MGT: 14, min_ORD_HND: 0.25
};
const SDEF = {
  superRate: ["Super guarantee", "pct", "Rules · labour on-costs"], payrollTax: ["Payroll tax (NSW)", "pct2", "Rules · labour on-costs"], workersComp: ["Workers comp", "pct", "Rules · labour on-costs"],
  utilFloor_smi: ["Labour utilisation · Smithfield floor", "pct", "Rules · utilisation"], utilFloor_par: ["Labour utilisation · Parramatta floor", "pct", "Rules · utilisation"], utilCsr: ["Labour utilisation · CSR", "pct", "Rules · utilisation"],
  posTotal_smi: ["Pallet positions · Smithfield (total)", "int", "Rules · space"], posUsed_smi: ["Pallet positions · Smithfield (used)", "int", "Rules · space"],
  posTotal_par: ["Pallet positions · Parramatta (total)", "int", "Rules · space"], posUsed_par: ["Pallet positions · Parramatta (used)", "int", "Rules · space"],
  rent_smi: ["Rent · Smithfield (Xero, per month)", "money", "Rules · space"], rentNotional_par: ["Notional rent · Parramatta (owned, per month)", "money", "Rules · space"],
  cmcCost: ["CMC CartonWrap cost per month", "money", "Rules · automation"], cmcCapacity: ["CMC practical capacity (orders / month)", "int", "Rules · automation"],
  matMan: ["Materials per manual-packed order", "money", "Rules · packaging"], matCmc: ["Materials per CMC order (bubble bag + carton)", "money", "Rules · packaging"],
  b2b: ["B2B threshold (units per order, more than)", "int", "Rules · orders"], b2cCmcShare: ["Share of B2C orders packed on CMC", "pct", "Rules · orders"],
  floor: ["Margin floor", "pct", "Rules · checks"], tolerance: ["Leakage tolerance ($)", "money", "Rules · checks"], wkMin: ["Weekly minimum invoice", "money", "Rules · checks"], casualShare: ["Casual share of floor labour (variable)", "pct", "Rules · break-even"],
  min_RCV_CTN: ["Minutes · receive a carton", "min", "Minutes"], min_RCV_PLT: ["Minutes · receive a pallet", "min", "Minutes"], min_STO_PLT: ["Minutes · storage per pallet-week", "min", "Minutes"],
  min_PCK_UNIT: ["Minutes · pick a unit", "min", "Minutes"], min_PACK_MAN: ["Minutes · manual pack an order", "min", "Minutes"], min_PACK_CMC: ["Minutes · CMC pre-pack an order", "min", "Minutes"],
  min_RTN: ["Minutes · process a return", "min", "Minutes"], min_ACC_MGT: ["Minutes · per client ticket (CSR)", "min", "Minutes"], min_ORD_HND: ["Minutes · CSR per order", "min", "Minutes"]
};
let LOGS = {
  utilFloor_smi: [{ who: "Asal Artikbaeva", when: "15/10/2026 10:12", from: "82%", to: "85%", why: "Start value: Kaplan & Anderson practical capacity 80–85%" }],
  min_PACK_CMC: [{ who: "Asal Artikbaeva", when: "26/09/2026 14:05", from: "2.4", to: "0.9", why: "CMC pre-pack switched to bubble bags (container from China arrived)" }],
  matCmc: [{ who: "Asal Artikbaeva", when: "26/09/2026 14:07", from: "$0.71", to: "$0.38", why: "Bubble bag replaces bubble wrap + tray + paper strap" }],
  b2b: [{ who: "Asal Artikbaeva", when: "23/10/2026 08:22", from: "—", to: "20", why: "Initial B2B rule: more than 20 units per order" }]
};
const POOLS = {
  floor_smi: { name: "Floor labour · Smithfield", site: "smi", who: "Pickers, packers, receivers, forklift", staff: 26, gross: 145000, hours: 4270, util: "utilFloor_smi" },
  floor_par: { name: "Floor labour · Parramatta", site: "par", who: "Pickers, packers, receivers", staff: 12, gross: 68000, hours: 2000, util: "utilFloor_par" },
  csr: { name: "CSR & account management", site: null, who: "CSR team, account executive", staff: 5, gross: 32500, hours: 780, util: "utilCsr" }
};
const OVH = [
  { id: "equip", name: "Machinery (forklifts, high reach, order pickers)", src: "Xero: equipment lease, repairs & maintenance", amount: 14500, driver: "Pallet moves", unit: "move", total: 3100 },
  { id: "soft", name: "Software (WMS, Dyspatch, Xero, Front)", src: "Xero: subscriptions", amount: 11200, driver: "Orders", unit: "order", total: 98000 },
  { id: "admin", name: "Admin & management", src: "Xero: admin wages, insurance, office, utilities", amount: 52000, driver: "Labour minutes used", unit: "minute", total: null }
];
const SERVICES = [
  { code: "RCV-CTN", name: "Receiving · carton", unit: "carton", floor: "min_RCV_CTN", basis: "Estimate" },
  { code: "RCV-PLT", name: "Receiving · pallet", unit: "pallet", floor: "min_RCV_PLT", moves: 2, basis: "Estimate" },
  { code: "STO-PLT", name: "Storage · pallet per week", unit: "pallet-week", floor: "min_STO_PLT", space: 1, basis: "Estimate" },
  { code: "PCK-UNIT", name: "Picking · unit", unit: "unit", floor: "min_PCK_UNIT", basis: "WMS pick times" },
  { code: "PACK-MAN", name: "Packing · manual", unit: "order", floor: "min_PACK_MAN", basis: "Estimate", warn: "WMS pack times are understated (scan before packing). Needs a floor time study." },
  { code: "PACK-CMC", name: "Packing · automated (CMC)", unit: "order", floor: "min_PACK_CMC", cmc: 1, basis: "Estimate", note: "Pre-pack: item in bubble bag + packing slip stuck on so the CMC scans it (since ~09/2026)." },
  { code: "MAT-MAN", name: "Packaging materials · manual", unit: "order", mat: "matMan", basis: "Xero bills" },
  { code: "MAT-CMC", name: "Packaging materials · CMC", unit: "order", mat: "matCmc", basis: "Xero bills" },
  { code: "ORD-HND", name: "Order handling (CSR + software)", unit: "order", csr: "min_ORD_HND", soft: 1, basis: "Estimate" },
  { code: "RTN", name: "Returns processing", unit: "return", floor: "min_RTN", basis: "Estimate" },
  { code: "ACC-MGT", name: "Account management", unit: "Front ticket", csr: "min_ACC_MGT", basis: "Estimate", unbilled: true }
];
/* Billed services on client invoices (CLM / WMS charge codes) */
const BILLED = [
  { code: "RCV-CTN", name: "Receiving · carton", unit: "carton" }, { code: "RCV-PLT", name: "Receiving · pallet", unit: "pallet" },
  { code: "STO-PLT", name: "Storage · pallet per week", unit: "pallet-week" }, { code: "PCK-UNIT", name: "Picking · unit", unit: "unit" },
  { code: "ORD-FEE", name: "Order processing (pack)", unit: "order", blend: true }, { code: "PKG-STD", name: "Packaging · standard", unit: "order", blendMat: true },
  { code: "RTN", name: "Returns processing", unit: "return" }, { code: "ACC-MGT", name: "Account management", unit: "Front ticket", unbilled: true }
];
const C = (code) => BILLED.find(s => s.code === code) || SERVICES.find(s => s.code === code);
const SV = (code) => SERVICES.find(s => s.code === code);
const BILLABLE = BILLED.filter(s => !s.unbilled).map(s => s.code);
const order = BILLED.map(s => s.code);
const mk = (arr) => Object.fromEntries(order.map((c, i) => [c, arr[i]]));
const mr = (arr) => Object.fromEntries(order.slice(0, 7).map((c, i) => [c, arr[i]]));
const CLIENTS = [
  { id: "mwu", name: "MWU – The Way Up Nutrition", short: "MWU", type: "B2C", site: "par", cmc: 0.7, renew: "31/01/2027", vols: mk([220, 60, 1560, 16500, 9800, 9800, 140, 38]), rates: mr([1.60, 18, 6.50, 0.32, 2.10, 0.55, 4.50]), trend: [0.93, 0.97, 1], review: "In progress (Paul, Krystal, David)", upo: 1.68, b2bShare: 0.02 },
  { id: "kora", name: "Kora Organics", short: "Kora", type: "B2C", site: "smi", cmc: 0.65, renew: "30/06/2027", vols: mk([80, 22, 607, 9600, 4200, 4200, 60, 22]), rates: mr([1.60, 24, 7.50, 0.38, 2.60, 0.60, 5.50]), trend: [1.04, 0.99, 1], upo: 2.29, b2bShare: 0.04 },
  { id: "lmnd", name: "LMND", short: "LMND", type: "B2C", site: "smi", cmc: 0.55, renew: "28/02/2027", vols: mk([150, 30, 820, 10400, 6100, 6100, 180, 19]), rates: mr([1.80, 25, 6.80, 0.36, 2.45, 0.55, 5.00]), trend: [0.95, 0.98, 1], upo: 1.70, b2bShare: 0.01 },
  { id: "elacia", name: "Elacia", short: "Elacia", type: "B2C", site: "smi", cmc: 0.5, renew: "31/03/2027", vols: mk([60, 12, 390, 4800, 2600, 2600, 40, 9]), rates: mr([2.00, 26, 7.20, 0.40, 2.80, 0.65, 6.00]), trend: [1, 1.02, 1], upo: 1.85, b2bShare: 0.02 },
  { id: "11mode", name: "11MODE", short: "11MODE", type: "B2C + US", site: "smi", cmc: 0.4, renew: "15/12/2026", vols: mk([40, 18, 520, 5200, 3100, 3100, 95, 14]), rates: mr([1.80, 24, 7.00, 0.40, 2.70, 0.60, 5.50]), trend: [0.9, 0.96, 1], upo: 1.68, b2bShare: 0.03 },
  { id: "colx", name: "Collagen X", short: "Collagen X", type: "B2C", site: "par", cmc: 0.6, renew: "31/05/2027", vols: mk([90, 16, 450, 7300, 3900, 3900, 30, 11]), rates: mr([1.80, 22, 6.50, 0.34, 2.40, 0.55, 5.00]), trend: [0.97, 1.01, 1], upo: 1.87, b2bShare: 0.02 },
  { id: "sony", name: "Sony Music", short: "Sony Music", type: "B2B + D2C", site: "smi", cmc: 0.1, renew: "31/12/2026", vols: mk([640, 48, 1150, 21800, 1900, 600, 20, 64]), rates: mr([1.50, 20, 6.00, 0.45, 3.20, 0.80, 6.00]), trend: [0.82, 1.1, 1], upo: 11.5, b2bShare: 0.34 },
  { id: "coastal", name: "Coastal Grl", short: "Coastal Grl", type: "B2C", site: "smi", cmc: 0.7, renew: "18/08/2027", vols: mk([35, 8, 210, 3100, 2300, 2300, 70, 27]), rates: mr([2.00, 26, 7.50, 0.40, 2.75, 0.60, 5.50]), trend: [0.55, 0.8, 1], upo: 1.35, b2bShare: 0.0 }
];
const BILLED_DIFF = { "sony|PCK-UNIT": { qty: 18560 }, "mwu|STO-PLT": { qty: 1430 }, "lmnd|PKG-STD": { qty: 5480 }, "kora|RCV-CTN": { qty: 0 }, "11mode|RTN": { rate: 4.50 } };
const DYSPATCH_RATE = { "11mode|RTN": 4.50, "lmnd|ORD-FEE": 2.55 };
const WMS_RATE = { "sony|PCK-UNIT": "0.00 on 41 per-artist codes" };
/* FA-wide order sizes (units per order) for the B2B / B2C split */
const ORDER_SIZES = [[1, 41000], [2, 21000], [3, 12000], [4, 7000], [6, 6000], [10, 4500], [15, 2400], [25, 1600], [40, 1100], [80, 800], [150, 400], [400, 200]];
let VAR = "T"; /* T = TDABC, F = Full absorption — Cost to serve switch */
let PF = 1, PLABEL = MONTH; /* period factor (month = 1) */

function poolCost(p) {
  const gross = p.gross, sup = gross * S.superRate, ptax = (gross + sup) * S.payrollTax, wc = gross * S.workersComp;
  return { gross, sup, ptax, wc, total: gross + sup + ptax + wc };
}
function model() {
  const pilotOrders = CLIENTS.reduce((a, c) => a + c.vols["ORD-FEE"], 0), SCALE = 98000 / pilotOrders;
  /* FA-wide activity minutes (pilot volumes scaled to FA) */
  const used = { floor_smi: 0, floor_par: 0, csr: 0 }; let cmcOrders = 0;
  CLIENTS.forEach(c => {
    const v = c.vols, p = "floor_" + c.site, o = v["ORD-FEE"];
    used[p] += (v["RCV-CTN"] * S.min_RCV_CTN + v["RCV-PLT"] * S.min_RCV_PLT + v["STO-PLT"] * S.min_STO_PLT + v["PCK-UNIT"] * S.min_PCK_UNIT + o * (c.cmc * S.min_PACK_CMC + (1 - c.cmc) * S.min_PACK_MAN) + v["RTN"] * S.min_RTN) * SCALE;
    used.csr += (v["ACC-MGT"] * S.min_ACC_MGT + o * S.min_ORD_HND) * SCALE;
    cmcOrders += o * c.cmc * SCALE;
  });
  const pools = {};
  Object.entries(POOLS).forEach(([k, p]) => {
    const c = poolCost(p), util = S[p.util], practical = p.hours * 60 * util, u = Math.min(used[k], practical);
    const cpmT = c.total / practical, cpmF = c.total / Math.max(u, 1);
    pools[k] = { ...c, practical, used: u, util, usedPct: u / practical, cpmT, cpmF, unused: c.total - u * cpmT };
  });
  const usedLab = pools.floor_smi.used + pools.floor_par.used + pools.csr.used;
  const adminRate = OVH[2].amount / usedLab, softRate = OVH[1].amount / OVH[1].total, equipRate = OVH[0].amount / OVH[0].total;
  const space = {};
  [["smi", S.rent_smi, false], ["par", S.rentNotional_par, true]].forEach(([s, rent, notional]) => {
    const tot = S["posTotal_" + s], usd = Math.min(S["posUsed_" + s], tot);
    space[s] = { rent, notional, tot, used: usd, usedPct: usd / tot, rateT: rent / (tot * 4.33), rateF: rent / (usd * 4.33), unused: rent * (1 - usd / tot) };
  });
  const cmcUsed = Math.min(cmcOrders, S.cmcCapacity); if (typeof RAW !== "undefined") RAW.cmc = cmcOrders;
  const cmc = { cost: S.cmcCost, cap: S.cmcCapacity, used: cmcUsed, usedPct: cmcUsed / S.cmcCapacity, rateT: S.cmcCost / S.cmcCapacity, rateF: S.cmcCost / Math.max(cmcUsed, 1), unused: S.cmcCost * (1 - cmcUsed / S.cmcCapacity) };
  /* unit cost of a Base cost service, for a variant and site */
  function unit(code, v, site) {
    const s = SV(code), parts = [];
    if (s.floor) { const pool = pools["floor_" + site], m = S[s.floor]; parts.push(["Labour · " + m + " min × " + money(v === "T" ? pool.cpmT : pool.cpmF, 3) + " (" + SITES[site] + ")", m * (v === "T" ? pool.cpmT : pool.cpmF), "pool|floor_" + site]); parts.push(["Admin share · " + m + " min × " + money(adminRate, 3), m * adminRate, "ovh|admin"]); }
    if (s.csr) { const m = S[s.csr]; parts.push(["CSR · " + m + " min × " + money(v === "T" ? pools.csr.cpmT : pools.csr.cpmF, 3), m * (v === "T" ? pools.csr.cpmT : pools.csr.cpmF), "pool|csr"]); parts.push(["Admin share · " + m + " min × " + money(adminRate, 3), m * adminRate, "ovh|admin"]); }
    if (s.moves) parts.push(["Machinery · " + s.moves + " moves × " + money(equipRate, 3), s.moves * equipRate, "ovh|equip"]);
    if (s.space) parts.push(["Space · 1 pallet-week (" + SITES[site] + (space[site].notional ? ", notional rent" : "") + ")", v === "T" ? space[site].rateT : space[site].rateF, "space|" + site]);
    if (s.cmc) parts.push(["CMC machine · 1 order", v === "T" ? cmc.rateT : cmc.rateF, "cmc|cmc"]);
    if (s.soft) parts.push(["Software · 1 order × " + money(softRate, 3), softRate, "ovh|soft"]);
    if (s.mat) parts.push(["Materials · " + money(S[s.mat]) + " per order", S[s.mat], "set|" + s.mat]);
    return { parts, total: parts.reduce((a, p) => a + p[1], 0) };
  }
  /* client line unit cost (billed services; order fee = blend of packing methods + order handling) */
  function clientUnit(code, v, c) {
    if (code === "ORD-FEE") { const a = unit("PACK-CMC", v, c.site), b = unit("PACK-MAN", v, c.site), h = unit("ORD-HND", v, c.site);
      return { total: c.cmc * a.total + (1 - c.cmc) * b.total + h.total, parts: [["Packing · CMC × " + pct(c.cmc, 0) + " of orders", c.cmc * a.total, "svc|PACK-CMC"], ["Packing · manual × " + pct(1 - c.cmc, 0), (1 - c.cmc) * b.total, "svc|PACK-MAN"], ["Order handling (CSR + software)", h.total, "svc|ORD-HND"]] }; }
    if (code === "PKG-STD") return { total: c.cmc * S.matCmc + (1 - c.cmc) * S.matMan, parts: [["Materials CMC × " + pct(c.cmc, 0), c.cmc * S.matCmc, "svc|MAT-CMC"], ["Materials manual × " + pct(1 - c.cmc, 0), (1 - c.cmc) * S.matMan, "svc|MAT-MAN"]] };
    return unit(code, v, c.site);
  }
  const clients = CLIENTS.map(c => {
    const lines = order.map(code => {
      const s = C(code), vol = c.vols[code] * PF, uT = clientUnit(code, "T", c), uF = clientUnit(code, "F", c), u = VAR === "T" ? uT : uF;
      const rate = s.unbilled ? 0 : c.rates[code], d = BILLED_DIFF[c.id + "|" + code] || {};
      const bQty = d.qty != null ? d.qty * PF : vol, bRate = d.rate ?? rate, expected = vol * rate, billed = bQty * bRate;
      const avg3 = Math.round(c.vols[code] * (c.trend[0] + c.trend[1] + c.trend[2]) / 3);
      return { code, s, vol, avg3, rate, unitCost: u.total, unitT: uT.total, unitF: uF.total, parts: u.parts, cost: vol * u.total, costT: vol * uT.total, costF: vol * uF.total,
        expected, billed, gap: expected - billed, unitMargin: rate - u.total, marginPct: rate ? (rate - u.total) / rate : null, marginPctT: rate ? (rate - uT.total) / rate : null };
    });
    const revenue = lines.reduce((a, l) => a + l.billed, 0), cost = lines.reduce((a, l) => a + l.cost, 0), costT = lines.reduce((a, l) => a + l.costT, 0), costF = lines.reduce((a, l) => a + l.costF, 0);
    const o = c.vols["ORD-FEE"] * PF;
    return { ...c, lines, revenue, cost, costT, costF, margin: revenue - cost, marginPct: (revenue - cost) / revenue, marginT: (revenue - costT) / revenue, marginF: (revenue - costF) / revenue, cpo: cost / o, cpoT: costT / o, cpoF: costF / o };
  });
  /* FA cost per order, B2C vs B2B (site-weighted labour) */
  const hrs = POOLS.floor_smi.hours + POOLS.floor_par.hours, wS = POOLS.floor_smi.hours / hrs;
  function cpo(units, v, b2b) {
    const avg = (code) => wS * unit(code, v, "smi").total + (1 - wS) * unit(code, v, "par").total;
    const pick = units * avg("PCK-UNIT");
    let pack;
    if (!b2b) pack = S.b2cCmcShare * (avg("PACK-CMC") + S.matCmc) + (1 - S.b2cCmcShare) * (avg("PACK-MAN") + S.matMan);
    else { const extra = Math.min(22, 0.12 * (units - 1)), cpmF = v === "T" ? wS * pools.floor_smi.cpmT + (1 - wS) * pools.floor_par.cpmT : wS * pools.floor_smi.cpmF + (1 - wS) * pools.floor_par.cpmF;
      pack = avg("PACK-MAN") + extra * (cpmF + adminRate) + S.matMan * (1 + units / 25); }
    return pick + pack + avg("ORD-HND");
  }
  const seg = (b2b, v) => { const rows = ORDER_SIZES.filter(([u]) => b2b ? u > S.b2b : u <= S.b2b); const n = rows.reduce((a, r) => a + r[1], 0);
    return { orders: n, units: rows.reduce((a, r) => a + r[0] * r[1], 0) / Math.max(n, 1), cpo: rows.reduce((a, r) => a + cpo(r[0], v, b2b) * r[1], 0) / Math.max(n, 1) }; };
  const base = { T: { b2c: seg(false, "T"), b2b: seg(true, "T") }, F: { b2c: seg(false, "F"), b2b: seg(true, "F") } };
  const unusedRows = [
    { id: "pool|floor_smi", name: "Floor staff · Smithfield", cost: pools.floor_smi.total, usedPct: pools.floor_smi.usedPct, unused: pools.floor_smi.unused, kind: "Labour time" },
    { id: "pool|floor_par", name: "Floor staff · Parramatta", cost: pools.floor_par.total, usedPct: pools.floor_par.usedPct, unused: pools.floor_par.unused, kind: "Labour time" },
    { id: "pool|csr", name: "CSR & account management", cost: pools.csr.total, usedPct: pools.csr.usedPct, unused: pools.csr.unused, kind: "Labour time" },
    { id: "space|smi", name: "Pallet space · Smithfield", cost: space.smi.rent, usedPct: space.smi.usedPct, unused: space.smi.unused, kind: "Space" },
    { id: "space|par", name: "Pallet space · Parramatta (notional rent)", cost: space.par.rent, usedPct: space.par.usedPct, unused: space.par.unused, kind: "Space" },
    { id: "cmc|cmc", name: "CMC CartonWrap", cost: cmc.cost, usedPct: cmc.usedPct, unused: cmc.unused, kind: "Machine" }
  ];
  const unusedTot = unusedRows.reduce((a, r) => a + r.unused, 0), capCost = unusedRows.reduce((a, r) => a + r.cost, 0);
  return { pools, space, cmc, adminRate, softRate, equipRate, unit, clientUnit, clients, base, unusedRows, unusedTot, unusedPct: unusedTot / capCost, capCost, SCALE, usedLab,
    ovhRate: { admin: adminRate, soft: softRate, equip: equipRate }, labourMin: usedLab };
}

/* ================= DEMO STATE ================= */
const RULES = { get floor() { return S.floor; }, get tolerance() { return S.tolerance; }, get avgMonths() { return S.avgMonths; }, get wkMin() { return S.wkMin; } };
let LEAK = [
  { id: "L1", client: "sony", code: "PCK-UNIT", month: "Sep 2026", kind: "Under-billing", cause: "Picks logged on legacy per-artist codes priced at $0.00 in the WMS", status: "Task created", task: "T1" },
  { id: "L2", client: "mwu", code: "STO-PLT", month: "Sep 2026", kind: "Under-billing", cause: "Storage billed on 330 pallets; WMS shows 360 for the month", status: "Recovered", recovered: 845, inv: "INV-21874" },
  { id: "L3", client: "coastal", code: "WK-MIN", month: "Sep 2026", kind: "Under-billing", cause: "Levy period ended 01/09/2026; $300 weekly minimum not topped up in 3 weeks", status: "Open", fixed: 410 },
  { id: "L4", client: "lmnd", code: "PKG-STD", month: "Sep 2026", kind: "Under-billing", cause: "620 manual-pack orders had no packaging charge", status: "Open" },
  { id: "L5", client: "kora", code: "RCV-CTN", month: "Sep 2026", kind: "Under-billing", cause: "Carton receiving charge code missing on Kora's WMS rate card", status: "Task created", task: "T4" },
  { id: "L6", client: "11mode", code: "RTN", month: "Sep 2026", kind: "Rate mismatch", cause: "CLM says $5.50; Dyspatch billed $4.50. A person decides which is right", status: "Open" }
];
let TASKS = [
  { id: "T1", pr: "High", topic: "Under-billing", co: "Sony Music", where: "WMS", what: "Collapse 41 per-artist pick codes into PCK-UNIT ($0.45)", why: "3,240 picks billed at $0.00 in September", owner: "Paul", age: 6, st: "open" },
  { id: "T2", pr: "High", topic: "Back-bill", co: "Coastal Grl", where: "Xero", what: "Raise top-up invoice for weekly minimum, 3 weeks of September", why: "$410.00 not billed. Fix by hand in Xero", owner: "David", age: 3, st: "open" },
  { id: "T3", pr: "Medium", topic: "Rate mismatch", co: "11MODE", where: "CLM / Dyspatch", what: "Confirm returns rate: CLM $5.50 vs Dyspatch $4.50", why: "If Dyspatch is right, update CLM. If CLM is right, fix Dyspatch by hand", owner: "Asal", age: 2, st: "open" },
  { id: "T4", pr: "Medium", topic: "Under-billing", co: "Kora Organics", where: "WMS", what: "Add RCV-CTN ($1.60) to Kora's WMS rate card", why: "80 cartons received, $0 billed", owner: "Paul", age: 8, st: "open" },
  { id: "T5", pr: "Medium", topic: "Under-billing", co: "LMND", where: "WMS", what: "Manual-pack orders must carry PKG-STD", why: "620 orders without packaging charge ($341.00)", owner: "Natalia", age: 1, st: "open" },
  { id: "T6", pr: "High", topic: "Under-pricing", co: "MWU", where: "CLM", what: "Rate review: order fee, receiving pallet, returns below cost", why: "Feeds the MWU rate increase amendment", owner: "Asal", age: 14, st: "open" },
  { id: "T7", pr: "Low", topic: "Cost model", co: "FA", where: "Floor", what: "Book a 2-week time study: pack, receiving, returns", why: "Replaces estimated minutes with measured ones", owner: "Asal", age: 4, st: "open" },
  { id: "T8", pr: "Medium", topic: "Back-bill", co: "MWU", where: "Xero", what: "Bill 130 missing pallet-weeks of storage", why: "Done 14/10/2026 on INV-21874", owner: "David", age: 9, st: "done" }
];
const REPORT = {
  marginTrend: [{ m: "Apr", v: 15.2 }, { m: "May", v: 15.6 }, { m: "Jun", v: 14.4 }, { m: "Jul", v: 13.6 }, { m: "Aug", v: 12.9 }],
  baseline: 14.9, cashFaster: 28400, dsoBefore: 41, dsoNow: 34
};

/* ================= HELPERS ================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (n, d = 2) => (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: d, maximumFractionDigits: d });
const m0 = (n) => money(n, 0);
const num = (n, d = 0) => n.toLocaleString("en-AU", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n, d = 1) => n == null ? "—" : (n * 100).toFixed(d) + "%";
const cl = (id) => CLIENTS.find(c => c.id === id);
function mpill(p) {
  if (p == null) return '<span class="pill p-grey">not billed</span>';
  if (p < 0) return `<span class="pill p-red">${pct(p)} · below cost</span>`;
  if (p < RULES.floor) return `<span class="pill p-amber">${pct(p)} · under floor</span>`;
  return `<span class="pill p-green">${pct(p)}</span>`;
}
function mbar(p) {
  const w = Math.max(0, Math.min(1, (p + 0.2) / 0.7)) * 100, col = p < 0 ? "var(--red)" : p < RULES.floor ? "#e2a33a" : "var(--green)";
  return `<span class="mbar"><span class="track"><i style="width:${w}%;background:${col}"></i></span><span class="num small">${pct(p)}</span></span>`;
}
function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }
function leakAmount(L, M) {
  if (L.code === "WK-MIN") return L.fixed;
  const c = M.clients.find(x => x.id === L.client); return c.lines.find(l => l.code === L.code).gap;
}
function stPill(s) { return { "Open": "p-red", "Task created": "p-amber", "Explained": "p-grey", "Recovered": "p-green" }[s] ? `<span class="pill ${({ "Open": "p-red", "Task created": "p-amber", "Explained": "p-grey", "Recovered": "p-green" })[s]}">${s}</span>` : s; }

/* ================= NAV ================= */
const IC = {
  overview: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  clients: '<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-7h6v7"/>',
  leak: '<path d="M12 2.7s-6 6.6-6 11.3a6 6 0 0 0 12 0C18 9.3 12 2.7 12 2.7z"/>',
  rates: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  report: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 17v-3M12 17v-6M16 17v-4"/>',
  model: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  cost: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  improve: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  finance: '<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6z"/>',
  api: '<path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8"/>',
  kpi: '<path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="2"/>',
  tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  data: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'
};
const PAGES = {
  overview: { label: "Overview", ic: "overview", subs: [] },
  cost: { label: "Cost & margin", ic: "cost", subs: ["Base cost", "Cost to serve"] },
  leakage: { label: "Leakage", ic: "leak", subs: ["Overview", "Under-billing", "Under-pricing", "Rate checks", "Leakage log"] },
  improve: { label: "Improvements & savings", ic: "improve", subs: ["Overview", "Initiatives", "Ideas"] },
  rates: { label: "Rate review", ic: "rates", subs: [] },
  reports: { label: "Reports", ic: "report", subs: [] },
  kpi: { label: "KPI", ic: "kpi", subs: ["Overview", "Operations", "People", "Finance", "Warehouse", "Quality & clients"] },
  finance: { label: "Finance", ic: "finance", subs: ["Overview", "P&L", "Cash & debt", "Working capital", "Clients", "Bank pack"] },
  tasks: { label: "Tasks", ic: "tasks", subs: ["Open", "Snoozed", "Done"] },
  data: { label: "Data sources", ic: "data", subs: [], bottom: true },
  apis: { label: "API connections", ic: "api", subs: ["Connected to", "Keys we give out"], bottom: true },
  settings: { label: "Settings", ic: "settings", subs: ["Company", "Users", "Contacts & recipients", "Login & security", "Branding", "Rules", "Clients", "Suppliers", "Staff & allocation"], bottom: true }
};
const COMPANY = { name: "Fulfilment Australia", short: "FA", domain: "fulfilmentaustralia.com.au" };
const ROLES = [
  { id: "Owner", can: "Everything, incl. users, admins, security and pay by person. Can't be changed or removed." },
  { id: "Admin", can: "Everything except owner controls; manages users (not admins), connections and settings." },
  { id: "Management", can: "All pages and reports. Pay by person only if the owner turns it on." },
  { id: "Accounts", can: "Leakage, tasks and data uploads." },
  { id: "Viewer", can: "Overview and monthly report, read only." }
];
let USERS = [
  { id: "u1", name: "Asal Artikbaeva", email: "asal@fulfilmentaustralia.com.au", role: "Owner", pay: true, tfa: true, st: "Active", last: "22/10/2026 22:51" },
];
const SEC = { session: 8 };
let CONFIRM = null, INVITE_ERR = "", LOGINSTEP = 0;
const BRAND_DEFAULT = { header: "#010028", blue: "#1f54ee", ink: "#14132e", logoDark: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzc2MCIgaGVpZ2h0PSIxMTY3IiB2aWV3Qm94PSI0NiAzNyAzNzYwIDExNjciIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwMF8zXzM0MykiPgo8ZyBjbGlwLXBhdGg9InVybCgjY2xpcDFfM18zNDMpIj4KPHBhdGggZD0iTTEwMTUuMjYgMTc1Ljg5OUMxMDE1LjI2IDE3NS44OTkgOTk2LjA0NSAxNjUuODYzIDk2OS41MzMgMTc0LjQ3OEM5NDMuMDIxIDE4My4wOTIgOTQyLjQwNyAxODMuMjkxIDk0Mi40MDcgMTgzLjI5MUwyNjAuMjI5IDQwNC45NDRDMjYwLjIyOSA0MDQuOTQ0IDI0Mi4zNzIgNDEwLjc0NiAyMjAuOTgyIDQxNy42OTdDMTk5LjU5MSA0MjQuNjQ3IDE4OC45OCA0NDUuMDExIDE4OC45OCA0NDUuMDExTDY3NS4zMjEgNTM5Ljk3N0wxMDE1LjI2IDE3NS44OTlaTTQxNy45NjIgNDIxLjA1OEw4MTMuODggMjkyLjQxN0w2NTIuODE4IDQ3MC43Mkw0MTcuOTYyIDQyMS4wNThaIiBmaWxsPSIjMUY1NEVFIi8+CjxwYXRoIGQ9Ik04OTkuNTQyIDk4NC4yODlMMTA0MC42NCAzMjAuNzkxQzEwNDAuNjQgMzIwLjc5MSAxMDU3LjA4IDI1My41NTcgMTA1Ny4yMSAyMzYuMjg3QzEwNTcuMzQgMjE5LjAxNiAxMDQ5LjM4IDIwNi4yODkgMTA0OS4zOCAyMDYuMjg5TDcxNy4yNTcgNTc2LjQ0OUw4NzEuOTY1IDEwNTIuNTlDODcxLjk2NSAxMDUyLjU5IDg4Mi4wMDggMTA0NC4yMiA4ODcuNjY0IDEwMzIuMThDODkzLjMyMSAxMDIwLjEzIDg5OS41NDIgOTg0LjI4OSA4OTkuNTQyIDk4NC4yODlaTTg2OC42MiA4MzYuMDk1TDc4OS4yOTcgNTkxLjk2NUw5NTEuNjg1IDQxMC4zMTFMODY4LjYyIDgzNi4wOTVaIiBmaWxsPSIjMUY1NEVFIi8+CjxwYXRoIGQ9Ik03NTguODQyIDEwMzAuMThMMjU0LjY5NyA1NzYuMzM1QzI1NC42OTcgNTc2LjMzNSAyMDEuODc5IDUzMS42MDQgMTkxLjYyMiA1MTcuNzA5QzE4MS4zNjQgNTAzLjgxNCAxODAuNTggNDg5Ljg1NCAxODAuNTggNDg5Ljg1NEw2NjYuNTkxIDU5My4wODdMODIxLjI0NyAxMDY5LjA3QzgyMS4yNDcgMTA2OS4wNyA4MDguMjU2IDEwNjguMzYgNzk2LjU5OSAxMDYxLjk0Qzc4NC45NDEgMTA1NS41MiA3NTguODQyIDEwMzAuMTggNzU4Ljg0MiAxMDMwLjE4Wk02OTYuNzUzIDg5Mi4xMTNMNjE3LjQzIDY0Ny45ODNMMzc5LjI4MyA1OTYuNDcxTDY5Ni43NTMgODkyLjExM1oiIGZpbGw9IiMxRjU0RUUiLz4KPHBhdGggZD0iTTcxNS45NjcgMTEyNi41N0M4MTEuNDM1IDEyMTIuNTIgOTY0LjE1NyAxMTYyLjkgOTkwLjg2NyAxMDM3LjI0TDExNTMuNDUgMjcyLjMzQzExODAuMTYgMTQ2LjY3MyAxMDYwLjgzIDM5LjIyMjIgOTM4LjY1MSA3OC45MkwxOTQuOTIxIDMyMC41NzNDNzIuNzQzOCAzNjAuMjcxIDM5LjM1NjYgNTE3LjM0MiAxMzQuODI0IDYwMy4zMDJMNzE1Ljk2NyAxMTI2LjU3WiIgc3Ryb2tlPSIjMUY1NEVFIiBzdHJva2Utd2lkdGg9IjY2Ljc1MjUiLz4KPC9nPgo8L2c+CjxwYXRoIGQ9Ik0xNDIxLjM2IDUyMC42MjZWNjU4LjEzM0gxMzUyLjAyVjI5My4wNjlIMTYwMy44OVYzNTguNzc1SDE0MjEuMzZWNDU1LjUxM0gxNTg2LjI2VjUyMC41OTdIMTQyMS4zNlY1MjAuNjI2WiIgZmlsbD0iI0ZGRkZGRiIvPgo8cGF0aCBkPSJNMTgyNy4wNSA1NzkuNkgxODI2LjQ0QzE4MTMuNjkgNjQxLjA0NSAxNzc3LjE4IDY2NS45ODUgMTcyOS4xMSA2NjUuOTg1QzE2NjAuMzYgNjY1Ljk4NSAxNjM0LjIgNjIwLjM2NiAxNjM0LjIgNTU4LjkyMVYzNzIuMTNIMTY5OS45NFY1NDEuMjZDMTY5OS45NCA1NzUuOTMyIDE3MTUuMTEgNjA2LjM3NCAxNzU5LjU1IDYwNi4zNzRDMTgwMS41MyA2MDYuMzc0IDE4MjcuMDggNTgyLjAyNiAxODI3LjA4IDU0MS4yNlYzNzIuMTNIMTg5Mi43OVY2NTguMDg3SDE4MjcuMDhWNTc5LjZIMTgyNy4wNVoiIGZpbGw9IiNGRkZGRkYiLz4KPHBhdGggZD0iTTIwMTQuMDUgNjU4LjEwMUgxOTQ4LjM1VjI4NS4xNDJIMjAxNC4wNVY2NTguMTAxWiIgZmlsbD0iI0ZGRkZGRiIvPgo8cGF0aCBkPSJNMjE1Ny40NyAzNzIuMTY0SDIyMzEuN1Y0MjcuNTE1SDIxNTcuNDdWNjU4LjA5MkgyMDkyLjM2VjQyNy41MTVIMjA0Ni43MVYzNzIuMTY0SDIwOTIuMzZWMzY3LjMxM0MyMDkyLjM2IDMxMS4zNCAyMTI0LjAxIDI3MyAyMTkwLjkzIDI3M0MyMjEyLjIzIDI3MyAyMjI1LjYgMjc1LjQ1NSAyMjM3LjE3IDI3Ny44ODFMMjIzMS43IDMyNS4zMzNDMjIyMC4xMyAzMjMuNDk5IDIyMTAuNCAzMjIuMjg2IDIxOTkuNDUgMzIyLjI4NkMyMTcwLjI1IDMyMi4yODYgMjE1Ny40NyAzMzcuNDkyIDIxNTcuNDcgMzY2LjY5MlYzNzIuMTY0WiIgZmlsbD0iI0ZGRkZGRiIvPgo8cGF0aCBkPSJNMjI2Ny43NiAzMzMuODA3VjI4NS4xNDJIMjMzOC45NFYzMzMuODA3SDIyNjcuNzZaTTIyNzAuOCA2NTguMDc2VjM3Mi4xMTdIMjMzNi41MVY2NTguMDc2SDIyNzAuOFoiIGZpbGw9IiNGRkZGRkYiLz4KPHBhdGggZD0iTTI0NTkuMzggNjU4LjEwMUgyMzkzLjY1VjI4NS4xNDJIMjQ1OS4zOFY2NTguMTAxWiIgZmlsbD0iI0ZGRkZGRiIvPgo8cGF0aCBkPSJNMjU4MCA2NTguMTAzSDI1MTQuM1YzNzIuMTQ3SDI1ODBWNDUwLjYzMkgyNTgwLjYyQzI1OTMuNDEgMzg5Ljc3OSAyNjI5LjkxIDM2NC44NCAyNjc3Ljk1IDM2NC44NEMyNzQwLjAyIDM2NC44NCAyNzY3LjM5IDQwMS4zNDYgMjc3Mi4yNyA0NTQuMjcxSDI3NzIuODlDMjc4NC40NiAzOTAuNCAyODE3LjMgMzY0Ljg0IDI4NjkuNjMgMzY0Ljg0QzI5MzkuNiAzNjQuODQgMjk2NS4xNSA0MDkuODY2IDI5NjUuMTUgNDcxLjkzM1Y2NTguMTAzSDI5MDAuMDdWNDg4Ljk3M0MyOTAwLjA3IDQ1NC4zMDEgMjg4NC4yNCA0MjMuODU5IDI4MzkuODQgNDIzLjg1OUMyNzk3Ljg2IDQyMy44NTkgMjc3Mi45MiA0NDguMjA2IDI3NzIuOTIgNDg4Ljk3M1Y2NTguMTAzSDI3MDcuMjFWNDg4Ljk3M0MyNzA3LjIxIDQ1NC4zMDEgMjY5MS45OCA0MjMuODU5IDI2NDcuNTggNDIzLjg1OUMyNjA1LjU5IDQyMy44NTkgMjU4MC4wMyA0NDguMjA2IDI1ODAuMDMgNDg4Ljk3M1Y2NTguMTAzSDI1ODBaIiBmaWxsPSIjRkZGRkZGIi8+CjxwYXRoIGQ9Ik0zMDA1LjcyIDUxOC43NjRDMzAwNS43MiA0MjIuMDI1IDMwNjIuOTEgMzY0Ljg0IDMxNTEuNzUgMzY0Ljg0QzMyNDAuNTkgMzY0Ljg0IDMyODIuNTQgNDE5LjU5OSAzMjgyLjU0IDQ5OC4wODVDMzI4Mi41NCA1MDkuNjUyIDMyODIuNTQgNTIxLjE4OSAzMjgxLjMyIDUzNi40MjVIMzA3MS40M0MzMDc3LjUyIDU4NC40OTggMzEwNS41MSA2MDguMjI0IDMxNTIuMzcgNjA4LjIyNEMzMTk5LjIzIDYwOC4yMjQgMzIxNS4wMyA1ODUuNzExIDMyMjMuNTUgNTU2LjUxMkwzMjgwLjczIDU3Mi45MzFDMzI2Ni4xNSA2MjcuNjg4IDMyMjcuMTggNjY1LjQwOSAzMTUxLjc1IDY2NS40MDlDMzA2NC4xNSA2NjUuNDA5IDMwMDUuNzIgNjEzLjA3NiAzMDA1LjcyIDUxOC43OTNWNTE4Ljc2NFpNMzA3Mi4wNSA0ODcuNzNIMzIyMS43NEMzMjE4LjA3IDQ0My4zMjUgMzE5NC45NyA0MjAuMTkgMzE0OS45NCA0MjAuMTlDMzEwNC45MSA0MjAuMTkgMzA3OS4zOSA0NDEuNDkxIDMwNzIuMDggNDg3LjczSDMwNzIuMDVaIiBmaWxsPSIjRkZGRkZGIi8+CjxwYXRoIGQ9Ik0zMzkyLjA5IDY1OC4xMDNIMzMyNi4zNlYzNzIuMTQ3SDMzOTIuMDlWNDUwLjYzMkgzMzkyLjcyQzM0MDUuNDcgMzg5Ljc3OSAzNDQxLjk3IDM2NC44NCAzNDkwLjA1IDM2NC44NEMzNTU4LjggMzY0Ljg0IDM1ODQuOTUgNDA5Ljg2NiAzNTg0Ljk1IDQ3MS45MzNWNjU4LjEwM0gzNTE5LjI1VjQ4OC45NzNDMzUxOS4yNSA0NTQuMzAxIDM1MDQuMDQgNDIzLjg1OSAzNDU5LjY0IDQyMy44NTlDMzQxNy42NSA0MjMuODU5IDMzOTIuMTIgNDQ4LjIwNiAzMzkyLjEyIDQ4OC45NzNWNjU4LjEwM0gzMzkyLjA5WiIgZmlsbD0iI0ZGRkZGRiIvPgo8cGF0aCBkPSJNMzY1MS43IDQyNy41NUgzNjEyLjc0VjM3Mi4xOTlIMzY1MS43VjI5Ni4xNEgzNzE2Ljc4VjM3Mi4xOTlIMzgwMS4zNlY0MjcuNTVIMzcxNi43OFY1NjAuMTc0QzM3MTYuNzggNTg4LjE2IDM3MjcuNzMgNjAyLjE1MyAzNzU2LjMzIDYwMi4xNTNDMzc3MC45MiA2MDIuMTUzIDM3ODQuMzIgNTk4LjUxNCAzNzk3LjEgNTk1LjQ2N0wzODA1IDY1NS42OThDMzc4NC4zMiA2NjIuMzg3IDM3NjkuMDkgNjY2LjA1NSAzNzQxLjEzIDY2Ni4wNTVDMzY3OC40NyA2NjYuMDU1IDM2NTEuNyA2MjQuNjk3IDM2NTEuNyA1NzEuMTQ5VjQyNy41OFY0MjcuNTVaIiBmaWxsPSIjRkZGRkZGIi8+CjxwYXRoIGQ9Ik0xNDkyLjQ2IDkwMi4zODFIMTQwMS45OUwxMzc3LjMyIDk2My4yMzVIMTM1MkwxNDM0LjU0IDc2NS44OEgxNDYwLjE4TDE1NDIuNzYgOTYzLjIzNUgxNTE3LjFMMTQ5Mi40MyA5MDIuMzgxSDE0OTIuNDZaTTE0MDkuODkgODgyLjMyNEgxNDg0LjU2TDE0NzUuNjkgODYwLjYxMUMxNDY2LjQ5IDgzNy41OTMgMTQ1NS42MyA4MTAuMjg1IDE0NDguMDYgNzg5LjIyNEgxNDQ2LjQzQzE0MzguNTMgODEwLjU4MSAxNDI4IDgzNy41NjMgMTQxOC44IDg2MC42MTFMMTQwOS45MiA4ODIuMzI0SDE0MDkuODlaIiBmaWxsPSIjRkZGRkZGIi8+CjxwYXRoIGQ9Ik0xNjYzLjk1IDkyMi40NDRIMTY2My42MkMxNjU3LjA2IDk1Mi4wNTUgMTYzNi4zMiA5NjYuODQ4IDE2MDkuMDEgOTY2Ljg0OEMxNTY2LjkxIDk2Ni44NDggMTU1My40MyA5MzkuMjE0IDE1NTMuNDMgOTA2LjY0MlY4MTAuMjlIMTU3Ni4xMlY5MDEuNDA4QzE1NzYuMTIgOTI0LjA5OSAxNTg1LjY0IDk0Ni4xMzkgMTYxNi45MSA5NDYuMTM5QzE2NDUuODcgOTQ2LjEzOSAxNjYzLjk1IDkyOS42OSAxNjYzLjk1IDkwMS40MDhWODEwLjI5SDE2ODYuMzFWOTYzLjIzNUgxNjYzLjk1VjkyMi40NDRaIiBmaWxsPSIjRkZGRkZGIi8+CjxwYXRoIGQ9Ik0xNzEwLjEzIDkxMi41OTZMMTczMS40OCA5MDguMzA2QzE3MzcuNCA5MzAuNjcxIDE3NDguNTkgOTQ4LjA5NCAxNzgxLjE2IDk0OC4wOTRDMTgwNS4xOCA5NDguMDk0IDE4MTcuMDEgOTM3Ljg5MiAxODE3LjM0IDkyMi4xMjFDMTgxNy4zNCA5MDcuNjU0IDE4MDcuMTMgOTAwLjQwOCAxNzcyLjI1IDg5NC44MTdDMTczMy4xMSA4ODcuOTIzIDE3MTguMzIgODczLjc1MiAxNzE4LjMyIDg1MC4wODZDMTcxOC4zMiA4MjQuNzYgMTczNy4wNSA4MDYuNjU1IDE3NzMuNTkgODA2LjY1NUMxODEwLjEyIDgwNi42NTUgMTgyNy44NyA4MjQuNDA5IDE4MzUuNDEgODU0Ljk5NEwxODEzLjcgODYwLjI2M0MxODA3LjQzIDgzNC45MzcgMTc5NS45NSA4MjUuMDU2IDE3NzMuOTEgODI1LjA1NkMxNzUxLjg3IDgyNS4wNTYgMTc0MC42NiA4MzQuMjYgMTc0MC42NiA4NDguNzU3QzE3NDAuNjYgODYzLjI0OSAxNzUwLjE4IDg3MS43NjkgMTc4Mi4xIDg3Ni43MTJDMTgyMy4xOSA4ODMuMzA2IDE4MzkuNjQgODk3Ljc3MyAxODM5LjY0IDkyMS43NjlDMTgzOS42NCA5NDkuMDczIDE4MjAuNTYgOTY3LjE0OCAxNzgwLjc3IDk2Ny4xNDhDMTczNC43MSA5NjcuMTQ4IDE3MTcuMzUgOTQ1LjQ5NSAxNzEwLjEzIDkxMi41OTZaIiBmaWxsPSIjRkZGRkZGIi8+CjxwYXRoIGQ9Ik0xODc0LjUxIDgzMC4zNDdIMTg0OS44NFY4MTAuMjlIMTg3NC41MVY3NjYuNTMySDE4OTcuMThWODEwLjI5SDE5NDguODNWODMwLjM0N0gxODk3LjE4VjkxNi41MjJDMTg5Ny4xOCA5MzUuNjA1IDE5MDQuNDIgOTQ1LjEzIDE5MjIuODIgOTQ1LjEzQzE5MzEuMzcgOTQ1LjEzIDE5MzguMjkgOTQzLjggMTk0Ny4xNyA5NDEuMTY1TDE5NTAuNDYgOTYxLjg3NUMxOTQwLjI1IDk2NS4xNTcgMTkzMS43MyA5NjYuODEzIDE5MTguODYgOTY2LjgxM0MxODg4LjMgOTY2LjgxMyAxODc0LjQ4IDk0Ni43NTYgMTg3NC40OCA5MTguNDQ0VjgzMC4yODdMMTg3NC41MSA4MzAuMzQ3WiIgZmlsbD0iI0ZGRkZGRiIvPgo8cGF0aCBkPSJNMTk3MS43NCA5NjMuMjM1VjgxMC4yOUgxOTk0LjQzVjg1NC42OTVIMTk5NS4wOEMyMDAwLjY3IDgyMy40NTIgMjAxNi4xNCA4MTAuMjkgMjA0MS40NyA4MTAuMjlIMjA1MS45OVY4MzQuOTY0SDIwMzkuNDhDMjAwOC45MiA4MzQuOTY0IDE5OTQuNDMgODQ3LjQ3OSAxOTk0LjQzIDg3OS4zNjlWOTYzLjIzNUgxOTcxLjc0WiIgZmlsbD0iI0ZGRkZGRiIvPgo8cGF0aCBkPSJNMjE2OC40OCA5MjMuNzQzSDIxNjguMTVDMjE2MC45MyA5NTIuNjc3IDIxMzkuMjIgOTY2LjQ5MSAyMTEyLjI0IDk2Ni40OTFDMjA4MS4zMyA5NjYuNDkxIDIwNjIuMjQgOTUyLjM1IDIwNjIuMjQgOTIzLjc0M0MyMDYyLjI0IDg5OC40MTYgMjA3OS42NyA4NzguNjg1IDIxMTUuNTIgODc4LjY4NUgyMTY4LjQ4Vjg2OC40NzlDMjE2OC40OCA4NDEuNTAyIDIxNTguNiA4MjYuNzA5IDIxMzAuOTkgODI2LjcwOUMyMTA2LjY1IDgyNi43MDkgMjA5My40OCA4MzguMjE1IDIwODguOSA4NjYuNDk3TDIwNjcuMTggODYyLjg4OUMyMDcyLjQ1IDgyNi4wNTYgMjA5NC4xNiA4MDYuOTc4IDIxMzEuNjUgODA2Ljk3OEMyMTcyLjc3IDgwNi45NzggMjE5MC44NCA4MjguNjkxIDIxOTAuODQgODY3LjgzMVY5NjMuMjFIMjE2OC40OFY5MjMuNzQzWk0yMTY4LjQ4IDkwNi45NjdWODk3LjA4N0gyMTE3LjgzQzIwOTYuNDcgODk3LjA4NyAyMDg0LjY0IDkwNS42MzcgMjA4NC42NCA5MjEuNzZDMjA4NC42NCA5MzQuMjc1IDIwOTMuMTkgOTQ3LjA4MSAyMTE3LjIxIDk0Ny4wODFDMjE0OS4xIDk0Ny4wODEgMjE2OC41MSA5MjkuOTg1IDIxNjguNTEgOTA2LjkzN0wyMTY4LjQ4IDkwNi45NjdaIiBmaWxsPSIjRkZGRkZGIi8+CjxwYXRoIGQ9Ik0yMjQ3LjgzIDk2My4yMjZIMjIyNS4xNFY3NjEuNTg2SDIyNDcuODNWOTYzLjIyNloiIGZpbGw9IiNGRkZGRkYiLz4KPHBhdGggZD0iTTIyODEuODUgNzg0LjAwM1Y3NjEuNjM4SDIzMDkuNDlWNzg0LjAwM0gyMjgxLjg1Wk0yMjg0LjQ5IDk2My4yNDhWODEwLjMwM0gyMzA3LjE4Vjk2My4yNDhIMjI4NC40OVoiIGZpbGw9IiNGRkZGRkYiLz4KPHBhdGggZD0iTTI0NDMuMzcgOTIzLjc0M0gyNDQzLjA1QzI0MzUuOCA5NTIuNjc3IDI0MTQuMDkgOTY2LjQ5MSAyMzg3LjE0IDk2Ni40OTFDMjM1Ni4yMiA5NjYuNDkxIDIzMzcuMTQgOTUyLjM1IDIzMzcuMTQgOTIzLjc0M0MyMzM3LjE0IDg5OC40MTYgMjM1NC41NyA4NzguNjg1IDIzOTAuNDIgODc4LjY4NUgyNDQzLjM3Vjg2OC40NzlDMjQ0My4zNyA4NDEuNTAyIDI0MzMuNTIgODI2LjcwOSAyNDA1Ljg5IDgyNi43MDlDMjM4MS41NSA4MjYuNzA5IDIzNjguNDEgODM4LjIxNSAyMzYzLjggODY2LjQ5N0wyMzQyLjA4IDg2Mi44ODlDMjM0Ny4zMiA4MjYuMDU2IDIzNjkuMDMgODA2Ljk3OCAyNDA2LjU1IDgwNi45NzhDMjQ0Ny42NCA4MDYuOTc4IDI0NjUuNzQgODI4LjY5MSAyNDY1Ljc0IDg2Ny44MzFWOTYzLjIxSDI0NDMuMzdWOTIzLjc0M1pNMjQ0My4zNyA5MDYuOTY3Vjg5Ny4wODdIMjM5Mi43M0MyMzcxLjM0IDg5Ny4wODcgMjM1OS40OCA5MDUuNjM3IDIzNTkuNDggOTIxLjc2QzIzNTkuNDggOTM0LjI3NSAyMzY4LjAzIDk0Ny4wODEgMjM5Mi4wNSA5NDcuMDgxQzI0MjMuOTcgOTQ3LjA4MSAyNDQzLjM3IDkyOS45ODUgMjQ0My4zNyA5MDYuOTM3VjkwNi45NjdaIiBmaWxsPSIjRkZGRkZGIi8+CjxkZWZzPgo8Y2xpcFBhdGggaWQ9ImNsaXAwXzNfMzQzIj4KPHJlY3Qgd2lkdGg9IjEyMDAiIGhlaWdodD0iMTIwMCIgZmlsbD0id2hpdGUiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIwIDIwKSIvPgo8L2NsaXBQYXRoPgo8Y2xpcFBhdGggaWQ9ImNsaXAxXzNfMzQzIj4KPHJlY3Qgd2lkdGg9IjEyMDAiIGhlaWdodD0iMTIwMCIgZmlsbD0id2hpdGUiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIwIDIwKSIvPgo8L2NsaXBQYXRoPgo8L2RlZnM+Cjwvc3ZnPgo=", logoLight: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzc2MCIgaGVpZ2h0PSIxMTY3IiB2aWV3Qm94PSI0NiAzNyAzNzYwIDExNjciIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwMF8zXzM0MykiPgo8ZyBjbGlwLXBhdGg9InVybCgjY2xpcDFfM18zNDMpIj4KPHBhdGggZD0iTTEwMTUuMjYgMTc1Ljg5OUMxMDE1LjI2IDE3NS44OTkgOTk2LjA0NSAxNjUuODYzIDk2OS41MzMgMTc0LjQ3OEM5NDMuMDIxIDE4My4wOTIgOTQyLjQwNyAxODMuMjkxIDk0Mi40MDcgMTgzLjI5MUwyNjAuMjI5IDQwNC45NDRDMjYwLjIyOSA0MDQuOTQ0IDI0Mi4zNzIgNDEwLjc0NiAyMjAuOTgyIDQxNy42OTdDMTk5LjU5MSA0MjQuNjQ3IDE4OC45OCA0NDUuMDExIDE4OC45OCA0NDUuMDExTDY3NS4zMjEgNTM5Ljk3N0wxMDE1LjI2IDE3NS44OTlaTTQxNy45NjIgNDIxLjA1OEw4MTMuODggMjkyLjQxN0w2NTIuODE4IDQ3MC43Mkw0MTcuOTYyIDQyMS4wNThaIiBmaWxsPSIjMUY1NEVFIi8+CjxwYXRoIGQ9Ik04OTkuNTQyIDk4NC4yODlMMTA0MC42NCAzMjAuNzkxQzEwNDAuNjQgMzIwLjc5MSAxMDU3LjA4IDI1My41NTcgMTA1Ny4yMSAyMzYuMjg3QzEwNTcuMzQgMjE5LjAxNiAxMDQ5LjM4IDIwNi4yODkgMTA0OS4zOCAyMDYuMjg5TDcxNy4yNTcgNTc2LjQ0OUw4NzEuOTY1IDEwNTIuNTlDODcxLjk2NSAxMDUyLjU5IDg4Mi4wMDggMTA0NC4yMiA4ODcuNjY0IDEwMzIuMThDODkzLjMyMSAxMDIwLjEzIDg5OS41NDIgOTg0LjI4OSA4OTkuNTQyIDk4NC4yODlaTTg2OC42MiA4MzYuMDk1TDc4OS4yOTcgNTkxLjk2NUw5NTEuNjg1IDQxMC4zMTFMODY4LjYyIDgzNi4wOTVaIiBmaWxsPSIjMUY1NEVFIi8+CjxwYXRoIGQ9Ik03NTguODQyIDEwMzAuMThMMjU0LjY5NyA1NzYuMzM1QzI1NC42OTcgNTc2LjMzNSAyMDEuODc5IDUzMS42MDQgMTkxLjYyMiA1MTcuNzA5QzE4MS4zNjQgNTAzLjgxNCAxODAuNTggNDg5Ljg1NCAxODAuNTggNDg5Ljg1NEw2NjYuNTkxIDU5My4wODdMODIxLjI0NyAxMDY5LjA3QzgyMS4yNDcgMTA2OS4wNyA4MDguMjU2IDEwNjguMzYgNzk2LjU5OSAxMDYxLjk0Qzc4NC45NDEgMTA1NS41MiA3NTguODQyIDEwMzAuMTggNzU4Ljg0MiAxMDMwLjE4Wk02OTYuNzUzIDg5Mi4xMTNMNjE3LjQzIDY0Ny45ODNMMzc5LjI4MyA1OTYuNDcxTDY5Ni43NTMgODkyLjExM1oiIGZpbGw9IiMxRjU0RUUiLz4KPHBhdGggZD0iTTcxNS45NjcgMTEyNi41N0M4MTEuNDM1IDEyMTIuNTIgOTY0LjE1NyAxMTYyLjkgOTkwLjg2NyAxMDM3LjI0TDExNTMuNDUgMjcyLjMzQzExODAuMTYgMTQ2LjY3MyAxMDYwLjgzIDM5LjIyMjIgOTM4LjY1MSA3OC45MkwxOTQuOTIxIDMyMC41NzNDNzIuNzQzOCAzNjAuMjcxIDM5LjM1NjYgNTE3LjM0MiAxMzQuODI0IDYwMy4zMDJMNzE1Ljk2NyAxMTI2LjU3WiIgc3Ryb2tlPSIjMUY1NEVFIiBzdHJva2Utd2lkdGg9IjY2Ljc1MjUiLz4KPC9nPgo8L2c+CjxwYXRoIGQ9Ik0xNDIxLjM2IDUyMC42MjZWNjU4LjEzM0gxMzUyLjAyVjI5My4wNjlIMTYwMy44OVYzNTguNzc1SDE0MjEuMzZWNDU1LjUxM0gxNTg2LjI2VjUyMC41OTdIMTQyMS4zNlY1MjAuNjI2WiIgZmlsbD0iIzAxMDAyOCIvPgo8cGF0aCBkPSJNMTgyNy4wNSA1NzkuNkgxODI2LjQ0QzE4MTMuNjkgNjQxLjA0NSAxNzc3LjE4IDY2NS45ODUgMTcyOS4xMSA2NjUuOTg1QzE2NjAuMzYgNjY1Ljk4NSAxNjM0LjIgNjIwLjM2NiAxNjM0LjIgNTU4LjkyMVYzNzIuMTNIMTY5OS45NFY1NDEuMjZDMTY5OS45NCA1NzUuOTMyIDE3MTUuMTEgNjA2LjM3NCAxNzU5LjU1IDYwNi4zNzRDMTgwMS41MyA2MDYuMzc0IDE4MjcuMDggNTgyLjAyNiAxODI3LjA4IDU0MS4yNlYzNzIuMTNIMTg5Mi43OVY2NTguMDg3SDE4MjcuMDhWNTc5LjZIMTgyNy4wNVoiIGZpbGw9IiMwMTAwMjgiLz4KPHBhdGggZD0iTTIwMTQuMDUgNjU4LjEwMUgxOTQ4LjM1VjI4NS4xNDJIMjAxNC4wNVY2NTguMTAxWiIgZmlsbD0iIzAxMDAyOCIvPgo8cGF0aCBkPSJNMjE1Ny40NyAzNzIuMTY0SDIyMzEuN1Y0MjcuNTE1SDIxNTcuNDdWNjU4LjA5MkgyMDkyLjM2VjQyNy41MTVIMjA0Ni43MVYzNzIuMTY0SDIwOTIuMzZWMzY3LjMxM0MyMDkyLjM2IDMxMS4zNCAyMTI0LjAxIDI3MyAyMTkwLjkzIDI3M0MyMjEyLjIzIDI3MyAyMjI1LjYgMjc1LjQ1NSAyMjM3LjE3IDI3Ny44ODFMMjIzMS43IDMyNS4zMzNDMjIyMC4xMyAzMjMuNDk5IDIyMTAuNCAzMjIuMjg2IDIxOTkuNDUgMzIyLjI4NkMyMTcwLjI1IDMyMi4yODYgMjE1Ny40NyAzMzcuNDkyIDIxNTcuNDcgMzY2LjY5MlYzNzIuMTY0WiIgZmlsbD0iIzAxMDAyOCIvPgo8cGF0aCBkPSJNMjI2Ny43NiAzMzMuODA3VjI4NS4xNDJIMjMzOC45NFYzMzMuODA3SDIyNjcuNzZaTTIyNzAuOCA2NTguMDc2VjM3Mi4xMTdIMjMzNi41MVY2NTguMDc2SDIyNzAuOFoiIGZpbGw9IiMwMTAwMjgiLz4KPHBhdGggZD0iTTI0NTkuMzggNjU4LjEwMUgyMzkzLjY1VjI4NS4xNDJIMjQ1OS4zOFY2NTguMTAxWiIgZmlsbD0iIzAxMDAyOCIvPgo8cGF0aCBkPSJNMjU4MCA2NTguMTAzSDI1MTQuM1YzNzIuMTQ3SDI1ODBWNDUwLjYzMkgyNTgwLjYyQzI1OTMuNDEgMzg5Ljc3OSAyNjI5LjkxIDM2NC44NCAyNjc3Ljk1IDM2NC44NEMyNzQwLjAyIDM2NC44NCAyNzY3LjM5IDQwMS4zNDYgMjc3Mi4yNyA0NTQuMjcxSDI3NzIuODlDMjc4NC40NiAzOTAuNCAyODE3LjMgMzY0Ljg0IDI4NjkuNjMgMzY0Ljg0QzI5MzkuNiAzNjQuODQgMjk2NS4xNSA0MDkuODY2IDI5NjUuMTUgNDcxLjkzM1Y2NTguMTAzSDI5MDAuMDdWNDg4Ljk3M0MyOTAwLjA3IDQ1NC4zMDEgMjg4NC4yNCA0MjMuODU5IDI4MzkuODQgNDIzLjg1OUMyNzk3Ljg2IDQyMy44NTkgMjc3Mi45MiA0NDguMjA2IDI3NzIuOTIgNDg4Ljk3M1Y2NTguMTAzSDI3MDcuMjFWNDg4Ljk3M0MyNzA3LjIxIDQ1NC4zMDEgMjY5MS45OCA0MjMuODU5IDI2NDcuNTggNDIzLjg1OUMyNjA1LjU5IDQyMy44NTkgMjU4MC4wMyA0NDguMjA2IDI1ODAuMDMgNDg4Ljk3M1Y2NTguMTAzSDI1ODBaIiBmaWxsPSIjMDEwMDI4Ii8+CjxwYXRoIGQ9Ik0zMDA1LjcyIDUxOC43NjRDMzAwNS43MiA0MjIuMDI1IDMwNjIuOTEgMzY0Ljg0IDMxNTEuNzUgMzY0Ljg0QzMyNDAuNTkgMzY0Ljg0IDMyODIuNTQgNDE5LjU5OSAzMjgyLjU0IDQ5OC4wODVDMzI4Mi41NCA1MDkuNjUyIDMyODIuNTQgNTIxLjE4OSAzMjgxLjMyIDUzNi40MjVIMzA3MS40M0MzMDc3LjUyIDU4NC40OTggMzEwNS41MSA2MDguMjI0IDMxNTIuMzcgNjA4LjIyNEMzMTk5LjIzIDYwOC4yMjQgMzIxNS4wMyA1ODUuNzExIDMyMjMuNTUgNTU2LjUxMkwzMjgwLjczIDU3Mi45MzFDMzI2Ni4xNSA2MjcuNjg4IDMyMjcuMTggNjY1LjQwOSAzMTUxLjc1IDY2NS40MDlDMzA2NC4xNSA2NjUuNDA5IDMwMDUuNzIgNjEzLjA3NiAzMDA1LjcyIDUxOC43OTNWNTE4Ljc2NFpNMzA3Mi4wNSA0ODcuNzNIMzIyMS43NEMzMjE4LjA3IDQ0My4zMjUgMzE5NC45NyA0MjAuMTkgMzE0OS45NCA0MjAuMTlDMzEwNC45MSA0MjAuMTkgMzA3OS4zOSA0NDEuNDkxIDMwNzIuMDggNDg3LjczSDMwNzIuMDVaIiBmaWxsPSIjMDEwMDI4Ii8+CjxwYXRoIGQ9Ik0zMzkyLjA5IDY1OC4xMDNIMzMyNi4zNlYzNzIuMTQ3SDMzOTIuMDlWNDUwLjYzMkgzMzkyLjcyQzM0MDUuNDcgMzg5Ljc3OSAzNDQxLjk3IDM2NC44NCAzNDkwLjA1IDM2NC44NEMzNTU4LjggMzY0Ljg0IDM1ODQuOTUgNDA5Ljg2NiAzNTg0Ljk1IDQ3MS45MzNWNjU4LjEwM0gzNTE5LjI1VjQ4OC45NzNDMzUxOS4yNSA0NTQuMzAxIDM1MDQuMDQgNDIzLjg1OSAzNDU5LjY0IDQyMy44NTlDMzQxNy42NSA0MjMuODU5IDMzOTIuMTIgNDQ4LjIwNiAzMzkyLjEyIDQ4OC45NzNWNjU4LjEwM0gzMzkyLjA5WiIgZmlsbD0iIzAxMDAyOCIvPgo8cGF0aCBkPSJNMzY1MS43IDQyNy41NUgzNjEyLjc0VjM3Mi4xOTlIMzY1MS43VjI5Ni4xNEgzNzE2Ljc4VjM3Mi4xOTlIMzgwMS4zNlY0MjcuNTVIMzcxNi43OFY1NjAuMTc0QzM3MTYuNzggNTg4LjE2IDM3MjcuNzMgNjAyLjE1MyAzNzU2LjMzIDYwMi4xNTNDMzc3MC45MiA2MDIuMTUzIDM3ODQuMzIgNTk4LjUxNCAzNzk3LjEgNTk1LjQ2N0wzODA1IDY1NS42OThDMzc4NC4zMiA2NjIuMzg3IDM3NjkuMDkgNjY2LjA1NSAzNzQxLjEzIDY2Ni4wNTVDMzY3OC40NyA2NjYuMDU1IDM2NTEuNyA2MjQuNjk3IDM2NTEuNyA1NzEuMTQ5VjQyNy41OFY0MjcuNTVaIiBmaWxsPSIjMDEwMDI4Ii8+CjxwYXRoIGQ9Ik0xNDkyLjQ2IDkwMi4zODFIMTQwMS45OUwxMzc3LjMyIDk2My4yMzVIMTM1MkwxNDM0LjU0IDc2NS44OEgxNDYwLjE4TDE1NDIuNzYgOTYzLjIzNUgxNTE3LjFMMTQ5Mi40MyA5MDIuMzgxSDE0OTIuNDZaTTE0MDkuODkgODgyLjMyNEgxNDg0LjU2TDE0NzUuNjkgODYwLjYxMUMxNDY2LjQ5IDgzNy41OTMgMTQ1NS42MyA4MTAuMjg1IDE0NDguMDYgNzg5LjIyNEgxNDQ2LjQzQzE0MzguNTMgODEwLjU4MSAxNDI4IDgzNy41NjMgMTQxOC44IDg2MC42MTFMMTQwOS45MiA4ODIuMzI0SDE0MDkuODlaIiBmaWxsPSIjMDEwMDI4Ii8+CjxwYXRoIGQ9Ik0xNjYzLjk1IDkyMi40NDRIMTY2My42MkMxNjU3LjA2IDk1Mi4wNTUgMTYzNi4zMiA5NjYuODQ4IDE2MDkuMDEgOTY2Ljg0OEMxNTY2LjkxIDk2Ni44NDggMTU1My40MyA5MzkuMjE0IDE1NTMuNDMgOTA2LjY0MlY4MTAuMjlIMTU3Ni4xMlY5MDEuNDA4QzE1NzYuMTIgOTI0LjA5OSAxNTg1LjY0IDk0Ni4xMzkgMTYxNi45MSA5NDYuMTM5QzE2NDUuODcgOTQ2LjEzOSAxNjYzLjk1IDkyOS42OSAxNjYzLjk1IDkwMS40MDhWODEwLjI5SDE2ODYuMzFWOTYzLjIzNUgxNjYzLjk1VjkyMi40NDRaIiBmaWxsPSIjMDEwMDI4Ii8+CjxwYXRoIGQ9Ik0xNzEwLjEzIDkxMi41OTZMMTczMS40OCA5MDguMzA2QzE3MzcuNCA5MzAuNjcxIDE3NDguNTkgOTQ4LjA5NCAxNzgxLjE2IDk0OC4wOTRDMTgwNS4xOCA5NDguMDk0IDE4MTcuMDEgOTM3Ljg5MiAxODE3LjM0IDkyMi4xMjFDMTgxNy4zNCA5MDcuNjU0IDE4MDcuMTMgOTAwLjQwOCAxNzcyLjI1IDg5NC44MTdDMTczMy4xMSA4ODcuOTIzIDE3MTguMzIgODczLjc1MiAxNzE4LjMyIDg1MC4wODZDMTcxOC4zMiA4MjQuNzYgMTczNy4wNSA4MDYuNjU1IDE3NzMuNTkgODA2LjY1NUMxODEwLjEyIDgwNi42NTUgMTgyNy44NyA4MjQuNDA5IDE4MzUuNDEgODU0Ljk5NEwxODEzLjcgODYwLjI2M0MxODA3LjQzIDgzNC45MzcgMTc5NS45NSA4MjUuMDU2IDE3NzMuOTEgODI1LjA1NkMxNzUxLjg3IDgyNS4wNTYgMTc0MC42NiA4MzQuMjYgMTc0MC42NiA4NDguNzU3QzE3NDAuNjYgODYzLjI0OSAxNzUwLjE4IDg3MS43NjkgMTc4Mi4xIDg3Ni43MTJDMTgyMy4xOSA4ODMuMzA2IDE4MzkuNjQgODk3Ljc3MyAxODM5LjY0IDkyMS43NjlDMTgzOS42NCA5NDkuMDczIDE4MjAuNTYgOTY3LjE0OCAxNzgwLjc3IDk2Ny4xNDhDMTczNC43MSA5NjcuMTQ4IDE3MTcuMzUgOTQ1LjQ5NSAxNzEwLjEzIDkxMi41OTZaIiBmaWxsPSIjMDEwMDI4Ii8+CjxwYXRoIGQ9Ik0xODc0LjUxIDgzMC4zNDdIMTg0OS44NFY4MTAuMjlIMTg3NC41MVY3NjYuNTMySDE4OTcuMThWODEwLjI5SDE5NDguODNWODMwLjM0N0gxODk3LjE4VjkxNi41MjJDMTg5Ny4xOCA5MzUuNjA1IDE5MDQuNDIgOTQ1LjEzIDE5MjIuODIgOTQ1LjEzQzE5MzEuMzcgOTQ1LjEzIDE5MzguMjkgOTQzLjggMTk0Ny4xNyA5NDEuMTY1TDE5NTAuNDYgOTYxLjg3NUMxOTQwLjI1IDk2NS4xNTcgMTkzMS43MyA5NjYuODEzIDE5MTguODYgOTY2LjgxM0MxODg4LjMgOTY2LjgxMyAxODc0LjQ4IDk0Ni43NTYgMTg3NC40OCA5MTguNDQ0VjgzMC4yODdMMTg3NC41MSA4MzAuMzQ3WiIgZmlsbD0iIzAxMDAyOCIvPgo8cGF0aCBkPSJNMTk3MS43NCA5NjMuMjM1VjgxMC4yOUgxOTk0LjQzVjg1NC42OTVIMTk5NS4wOEMyMDAwLjY3IDgyMy40NTIgMjAxNi4xNCA4MTAuMjkgMjA0MS40NyA4MTAuMjlIMjA1MS45OVY4MzQuOTY0SDIwMzkuNDhDMjAwOC45MiA4MzQuOTY0IDE5OTQuNDMgODQ3LjQ3OSAxOTk0LjQzIDg3OS4zNjlWOTYzLjIzNUgxOTcxLjc0WiIgZmlsbD0iIzAxMDAyOCIvPgo8cGF0aCBkPSJNMjE2OC40OCA5MjMuNzQzSDIxNjguMTVDMjE2MC45MyA5NTIuNjc3IDIxMzkuMjIgOTY2LjQ5MSAyMTEyLjI0IDk2Ni40OTFDMjA4MS4zMyA5NjYuNDkxIDIwNjIuMjQgOTUyLjM1IDIwNjIuMjQgOTIzLjc0M0MyMDYyLjI0IDg5OC40MTYgMjA3OS42NyA4NzguNjg1IDIxMTUuNTIgODc4LjY4NUgyMTY4LjQ4Vjg2OC40NzlDMjE2OC40OCA4NDEuNTAyIDIxNTguNiA4MjYuNzA5IDIxMzAuOTkgODI2LjcwOUMyMTA2LjY1IDgyNi43MDkgMjA5My40OCA4MzguMjE1IDIwODguOSA4NjYuNDk3TDIwNjcuMTggODYyLjg4OUMyMDcyLjQ1IDgyNi4wNTYgMjA5NC4xNiA4MDYuOTc4IDIxMzEuNjUgODA2Ljk3OEMyMTcyLjc3IDgwNi45NzggMjE5MC44NCA4MjguNjkxIDIxOTAuODQgODY3LjgzMVY5NjMuMjFIMjE2OC40OFY5MjMuNzQzWk0yMTY4LjQ4IDkwNi45NjdWODk3LjA4N0gyMTE3LjgzQzIwOTYuNDcgODk3LjA4NyAyMDg0LjY0IDkwNS42MzcgMjA4NC42NCA5MjEuNzZDMjA4NC42NCA5MzQuMjc1IDIwOTMuMTkgOTQ3LjA4MSAyMTE3LjIxIDk0Ny4wODFDMjE0OS4xIDk0Ny4wODEgMjE2OC41MSA5MjkuOTg1IDIxNjguNTEgOTA2LjkzN0wyMTY4LjQ4IDkwNi45NjdaIiBmaWxsPSIjMDEwMDI4Ii8+CjxwYXRoIGQ9Ik0yMjQ3LjgzIDk2My4yMjZIMjIyNS4xNFY3NjEuNTg2SDIyNDcuODNWOTYzLjIyNloiIGZpbGw9IiMwMTAwMjgiLz4KPHBhdGggZD0iTTIyODEuODUgNzg0LjAwM1Y3NjEuNjM4SDIzMDkuNDlWNzg0LjAwM0gyMjgxLjg1Wk0yMjg0LjQ5IDk2My4yNDhWODEwLjMwM0gyMzA3LjE4Vjk2My4yNDhIMjI4NC40OVoiIGZpbGw9IiMwMTAwMjgiLz4KPHBhdGggZD0iTTI0NDMuMzcgOTIzLjc0M0gyNDQzLjA1QzI0MzUuOCA5NTIuNjc3IDI0MTQuMDkgOTY2LjQ5MSAyMzg3LjE0IDk2Ni40OTFDMjM1Ni4yMiA5NjYuNDkxIDIzMzcuMTQgOTUyLjM1IDIzMzcuMTQgOTIzLjc0M0MyMzM3LjE0IDg5OC40MTYgMjM1NC41NyA4NzguNjg1IDIzOTAuNDIgODc4LjY4NUgyNDQzLjM3Vjg2OC40NzlDMjQ0My4zNyA4NDEuNTAyIDI0MzMuNTIgODI2LjcwOSAyNDA1Ljg5IDgyNi43MDlDMjM4MS41NSA4MjYuNzA5IDIzNjguNDEgODM4LjIxNSAyMzYzLjggODY2LjQ5N0wyMzQyLjA4IDg2Mi44ODlDMjM0Ny4zMiA4MjYuMDU2IDIzNjkuMDMgODA2Ljk3OCAyNDA2LjU1IDgwNi45NzhDMjQ0Ny42NCA4MDYuOTc4IDI0NjUuNzQgODI4LjY5MSAyNDY1Ljc0IDg2Ny44MzFWOTYzLjIxSDI0NDMuMzdWOTIzLjc0M1pNMjQ0My4zNyA5MDYuOTY3Vjg5Ny4wODdIMjM5Mi43M0MyMzcxLjM0IDg5Ny4wODcgMjM1OS40OCA5MDUuNjM3IDIzNTkuNDggOTIxLjc2QzIzNTkuNDggOTM0LjI3NSAyMzY4LjAzIDk0Ny4wODEgMjM5Mi4wNSA5NDcuMDgxQzI0MjMuOTcgOTQ3LjA4MSAyNDQzLjM3IDkyOS45ODUgMjQ0My4zNyA5MDYuOTM3VjkwNi45NjdaIiBmaWxsPSIjMDEwMDI4Ii8+CjxkZWZzPgo8Y2xpcFBhdGggaWQ9ImNsaXAwXzNfMzQzIj4KPHJlY3Qgd2lkdGg9IjEyMDAiIGhlaWdodD0iMTIwMCIgZmlsbD0id2hpdGUiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIwIDIwKSIvPgo8L2NsaXBQYXRoPgo8Y2xpcFBhdGggaWQ9ImNsaXAxXzNfMzQzIj4KPHJlY3Qgd2lkdGg9IjEyMDAiIGhlaWdodD0iMTIwMCIgZmlsbD0id2hpdGUiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIwIDIwKSIvPgo8L2NsaXBQYXRoPgo8L2RlZnM+Cjwvc3ZnPgo=" };
const brand = { ...BRAND_DEFAULT };
function applyBrand() {
  const r = document.documentElement.style; r.setProperty("--header", brand.header); r.setProperty("--blue", brand.blue); r.setProperty("--ink", brand.ink);
  document.querySelectorAll('img[data-logo="dark"]').forEach(i => i.src = brand.logoDark);
  document.querySelectorAll('img[data-logo="light"]').forEach(i => i.src = brand.logoLight);
}
let dsTab = "wms";
const APIIN = [
  { n: "Thomax (dotWMS)", cat: "WMS", how: "API key · Query API", acc: "Read-only", st: "Ending", end: "31/05/2027", sync: "22/10/2026 02:00", data: "2021 → today" },
  { n: "Logiwa", cat: "WMS", how: "API key", acc: "Read-only", st: "Not connected", sync: "—", data: "—" },
  { n: "3PLWMS (Tarek's system)", cat: "WMS", how: "File upload", acc: "—", st: "Files only", sync: "uploaded 22/10/2026", data: "06/2026 → 09/2026" },
  { n: "Xero", cat: "Accounting", how: "OAuth · read-only scopes", acc: "Read-only, incl. attachments", st: "Not connected", sync: "—", data: "—" },
  { n: "Front", cat: "Client service", how: "API token", acc: "Read-only, incl. attachments", st: "Not connected", sync: "—", data: "—" },
  { n: "Claude AI", cat: "AI", how: "API key", acc: "Reads files sent to it", st: "Not connected", sync: "—", data: "—" },
  { n: "CLM", cat: "Contracts & rates", how: "API key", acc: "Read-only", st: "Not connected", sync: "—", data: "—" },
  { n: "Dyspatch", cat: "Contracts & rates", how: "File upload", acc: "—", st: "Files only", sync: "—", data: "—" },
  { n: "Old Thomax test login", cat: "WMS", how: "API key", acc: "Read-only", st: "Ended", sync: "21/10/2026", data: "test rows only" }
];
const SCOPES = ["Services & cost per unit", "Client margins", "Volumes", "Leakage items", "Rate review data", "Monthly report figures"];
let KEYS = [
  { app: "CLM", who: "Rate reviews and amendments", scopes: ["Services & cost per unit", "Client margins", "Volumes", "Rate review data"], last4: "3k9q", created: "22/10/2026", exp: "22/10/2027", used: "not yet", st: "Active" },
  { app: "Accounts Hub", who: "Leakage lines in David's digest", scopes: ["Leakage items"], last4: "p72m", created: "22/10/2026", exp: "22/10/2027", used: "not yet", st: "Active" }
];
let NEWKEY = "";
const DS = { pulled: 0, startMonth: 0, perNight: 3, files: [{ n: "3plwms_orders_part1.csv", p: "06/2026–07/2026", r: 4820, ok: true, d: "—" }] };
let cur = "overview", sub = "Overview", rateClient = "mwu", newRates = {}, target = 0.2;
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;
function navHTML(bottom) {
  return Object.entries(PAGES).filter(([, p]) => !!p.bottom === bottom).map(([k, p]) => {
    let badge = "";
    if (k === "tasks") badge = `<span class="count">${TASKS.filter(t => t.st === "open").length}</span>`;
    if (k === "leakage") badge = `<span class="count">${LEAK.filter(l => l.status === "Open").length}</span>`;
    return `<button data-nav="${k}" title="${p.label}" ${k === cur ? 'aria-current="page"' : ""}>${svg(p.ic)}<span>${p.label}</span>${badge}</button>`;
  }).join("");
}
function go(k, s) {
  if (k === "reports") PAGES.reports.subs = [...REPORTS.map(r => r.name), "+ New report"];
  cur = k; sub = s || (PAGES[k].subs[0] || ""); render(); window.scrollTo(0, 0);
  if (innerWidth <= 900) document.body.classList.remove("peek");
}

/* ===== v2 core: settings fields + logs, period, forecast, stacked panels ===== */
const nowStr = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
function fmtS(key, v = S[key]) {
  const t = (SDEF[key] || [])[1];
  if (t === "pct") return (v * 100).toFixed(1).replace(/\.0$/, "") + "%";
  if (t === "pct2") return (v * 100).toFixed(2) + "%";
  if (t === "money") return money(v, v >= 1000 ? 0 : 2);
  if (t === "min") return v + " min";
  return num(v);
}
function fld(key) {
  const t = SDEF[key][1], isP = t.startsWith("pct"), val = isP ? +(S[key] * 100).toFixed(2) : S[key], n = (LOGS[key] || []).length;
  const step = t === "min" ? 0.05 : isP ? 0.5 : (t === "money" && S[key] < 100) ? 0.01 : 1;
  return `<span class="fld"><input class="mini" type="number" step="${step}" data-set="${key}" value="${val}" aria-label="${esc(SDEF[key][0])}"><span class="u">${isP ? "%" : t === "min" ? "min" : ""}</span><button class="lnk logsbtn" data-logs="${key}" title="Who changed this, when, old → new">Logs${n ? " · " + n : ""}</button></span>`;
}
const setRow = (key, note) => `<dt>${esc(SDEF[key][0])}</dt><dd>${fld(key)}${note ? ` <span class="meta">${esc(note)}</span>` : ""}</dd>`;
function setVal(key, raw, who = "Asal Artikbaeva", via) {
  const t = SDEF[key][1], v = t.startsWith("pct") ? raw / 100 : raw;
  if (isNaN(v) || S[key] === v) return;
  (LOGS[key] = LOGS[key] || []).unshift({ who, when: nowStr(), from: fmtS(key), to: fmtS(key, v), why: via || (STACK.length ? "Edited in a details panel" : "Edited in Settings → Rules") });
  S[key] = v; render(); renderStack(); toast(`${SDEF[key][0]}: ${fmtS(key)} · everything recalculated`);
}
function logsHTML(key) {
  const L = LOGS[key] || [];
  return `<h3>Logs · ${esc(SDEF[key][0])}</h3><dl class="dl"><dt>Current value</dt><dd><strong>${fmtS(key)}</strong></dd><dt>Setting</dt><dd>${esc(SDEF[key][2])}</dd></dl>
  <div class="tsec"><div class="tsec-h">Changes</div>${L.length ? `<ul class="tl">${L.map(l => `<li class="k-note"><div class="tl-h"><strong>${esc(l.when)}</strong> · ${esc(l.who)}</div><div class="tl-b">${esc(l.from)} → <strong>${esc(l.to)}</strong> · ${esc(l.why)}</div></li>`).join("")}</ul>` : '<div class="empty">No changes yet.</div>'}</div>
  <p class="meta">Changes made by another app through an API key show the key's app name (and the user, if that app sends it).</p>`;
}
const LOGS_EXTRA = {};
function rowLogsHTML(id, title) {
  const L = LOGS_EXTRA[id] || [];
  return `<h3>Logs · ${esc(title)}</h3>${L.length ? `<ul class="tl">${L.map(l => `<li class="k-note"><div class="tl-h"><strong>${esc(l.when)}</strong> · ${esc(l.who)}</div><div class="tl-b">${esc(l.text)}</div></li>`).join("")}</ul>` : '<div class="empty">No changes yet.</div>'}`;
}
function logX(id, text, who = "Asal Artikbaeva") { (LOGS_EXTRA[id] = LOGS_EXTRA[id] || []).unshift({ who, when: nowStr(), text }); }

/* ----- period picker + forecast ----- */
const PERIODS = [["Week", 0.23, "14/10/2026 – 20/10/2026"], ["Month", 1, MONTH], ["Quarter", 3, "Jul – Sep 2026 (Q1 FY27)"], ["Year", 12, "Oct 2025 – Sep 2026"], ["5 years", 60, "Jan 2021 – Sep 2026 (all history)"]];
let PER = "Month", PCMP = "Previous period", FC = false, perOpen = false, PFROM = "2026-09-01", PTO = "2026-09-30";
const PERIOD_PAGES = ["overview", "cost", "leakage", "improve", "kpi", "finance", "reports"];
const FC_PAGES = ["overview", "finance", "kpi"];
function perHTML() {
  return `<div class="perpop" role="dialog" aria-label="Choose period"><div class="chips">${PERIODS.map(p => `<button class="btn ${PER === p[0] ? "on" : ""}" data-perpick="${p[0]}">${p[0]}</button>`).join("")}</div>
    <div class="row" style="margin-top:10px"><label class="small" for="pf">From</label><input type="date" id="pf" value="${PFROM}"><label class="small" for="pt">To</label><input type="date" id="pt" value="${PTO}"></div>
    <div class="row" style="margin-top:8px"><label class="small" for="pc">Compare with</label><select id="pc"><option ${PCMP === "Previous period" ? "selected" : ""}>Previous period</option><option ${PCMP === "Same period last year" ? "selected" : ""}>Same period last year</option></select></div>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="perapply">Apply dates</button><button class="btn" data-act="perclose">Close</button></div>
    <p class="meta" style="margin:8px 0 0">Costs are monthly: for part-month ranges, volumes are exact and unit costs come from the month.</p></div>`;
}
function setPeriod(name, f, label) { PER = name; PF = f; PLABEL = label; perOpen = false; render(); }
const fmtD = (iso) => iso.split("-").reverse().join("/");
function fcast(arr, n = 6, g = 1.06) { return arr.slice(0, n).map(v => v * g); }
const FC_LABELS = ["Oct 26", "Nov", "Dec", "Jan 27", "Feb", "Mar"];

/* ----- charts (with optional forecast) ----- */
function lineChart(series, opts) {
  const W = 640, H = 220, L = 52, R = 16, T = 18, B = 28;
  const fc = FC && opts.fc ? opts.fc : null, nA = series[0].v.length, n = nA + (fc ? fc.length : 0);
  const labels = fc ? opts.labels.concat(FC_LABELS.slice(0, fc.length)) : opts.labels;
  const all = series.flatMap(s => s.v).concat((opts.lines || []).map(l => l.v)).concat(fc ? fc.map(v => v * 1.08) : []);
  const min = opts.min ?? Math.min(...all) * 0.95, max = Math.max(opts.max ?? 0, Math.max(...all) * 1.04);
  const x = (i) => L + i * (W - L - R) / (n - 1), y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  let g = ""; const step = (max - min) / 4;
  for (let k = 0; k <= 4; k++) { const v = min + step * k; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${opts.fmt(v)}</text>`; }
  const lab = labels.map((m, i) => (i % 2 === 0 || i === n - 1) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" ${i >= nA ? 'style="font-style:italic"' : ""}>${m}</text>` : "").join("");
  const refs = (opts.lines || []).map(l => `<line x1="${L}" x2="${W - R}" y1="${y(l.v)}" y2="${y(l.v)}" stroke="${l.c}" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W - R}" y="${y(l.v) - 5}" text-anchor="end" style="fill:${l.c};font-weight:600">${l.t}</text>`).join("");
  const paths = series.map(s => { const d = s.v.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(""), last = s.v[nA - 1];
    return `${s.area ? `<path d="${d}L${x(nA - 1)},${y(min)}L${x(0)},${y(min)}Z" fill="${s.c}" opacity=".10"/>` : ""}<path d="${d}" fill="none" stroke="${s.c}" stroke-width="2.2"/><circle cx="${x(nA - 1)}" cy="${y(last)}" r="4" fill="${s.c}"/><text x="${x(nA - 1) - 6}" y="${y(last) - 9}" text-anchor="end" style="fill:var(--ink);font-weight:600">${opts.fmt(last)}</text>`; }).join("");
  let fcp = "";
  if (fc) { const pts = [series[0].v[nA - 1], ...fc], xs = pts.map((_, i) => x(nA - 1 + i));
    const band = pts.map((v, i) => `${xs[i]},${y(v * (1 + 0.012 * i))}`).join(" ") + " " + pts.map((v, i) => `${xs[i]},${y(v * (1 - 0.012 * i))}`).reverse().join(" ");
    fcp = `<rect x="${x(nA - 1)}" y="${T}" width="${x(n - 1) - x(nA - 1)}" height="${H - T - B}" fill="var(--surface)"/><polygon points="${band}" fill="var(--blue)" opacity=".10"/><path d="${pts.map((v, i) => `${i ? "L" : "M"}${xs[i]},${y(v)}`).join("")}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-dasharray="6 5"/><text x="${x(n - 1)}" y="${T + 12}" text-anchor="end" style="fill:var(--grey);font-style:italic">Forecast</text>`; }
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}">${fcp}${g}${refs}${paths}${lab}</svg></div>`;
}
function barChart(vals, labels, opts) {
  const fc = FC && opts.fc ? opts.fc : null, all = fc ? vals.concat(fc) : vals, labs = fc ? labels.concat(FC_LABELS.slice(0, fc.length)) : labels;
  const W = 640, H = 200, L = 44, R = 10, T = 16, B = 26, n = all.length, max = Math.max(...all) * 1.12, bw = (W - L - R) / n, y = (v) => T + (1 - v / max) * (H - T - B);
  let g = ""; for (let k = 0; k <= 3; k++) { const v = max / 3 * k; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${opts.fmt(v)}</text>`; }
  const bars = all.map((v, i) => { const f = i >= vals.length; return `<rect x="${L + i * bw + bw * 0.18}" y="${y(v)}" width="${bw * 0.64}" height="${y(0) - y(v)}" rx="2" fill="${f ? "none" : i === vals.length - 1 ? "var(--blue)" : "var(--blue-light)"}" ${f ? 'stroke="var(--blue)" stroke-dasharray="4 3"' : ""}/>${i % 2 === 0 || i === n - 1 ? `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" ${f ? 'style="font-style:italic"' : ""}>${labs[i]}</text>` : ""}`; }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}">${g}${bars}</svg></div>`;
}

/* ----- stacked details panels (re-render live after settings change) ----- */
let STACK = [], LASTN = 0;
function drawer(h, replace) { const fn = typeof h === "function" ? h : () => h; if (replace && STACK.length) STACK[STACK.length - 1] = fn; else STACK.push(fn); renderStack(); }
function renderStack() {
  const n = STACK.length; if (!n) { $("#layer").innerHTML = ""; LASTN = 0; return; }
  const keepScroll = n === LASTN ? ($("#layer .drawer:not(.under)")?.scrollTop || 0) : 0; LASTN = n;
  $("#layer").innerHTML = `<div class="scrim" data-closeall title="Close all"></div>` + STACK.map((fn, i) => {
    const top = i === n - 1, depth = n - 1 - i;
    return `<aside class="drawer ${top ? "" : "under"}" role="dialog" aria-modal="${top}" style="transform:translateX(-${depth * 28}px)" ${top ? "" : 'aria-hidden="true"'}>
      ${top && n > 1 ? `<button class="lnk backlnk" data-close>← Back</button>` : ""}${top ? fn() : ""}
      <div class="row"><button class="btn" data-close>${n > 1 ? "Close this panel" : "Close"}</button>${n > 1 ? '<button class="btn" data-closeall>Close all</button>' : ""}</div></aside>`;
  }).join("");
  const t = $("#layer .drawer:not(.under)"); if (t) t.scrollTop = keepScroll;
}
function closeTop() { STACK.pop(); renderStack(); }
function closeAll() { STACK = []; renderStack(); }

/* ===== Staff (made-up allocations; names from FA ops) ===== */
let STAFF = [
  { id: "s1", name: "Paul Woplin", site: "both", pos: "Operations manager", pool: "admin", type: "Permanent", xero: "EMP-0004", codes: { thomax: "PWOP", p3l: "paul.w", logiwa: "" }, login: true, alloc: {}, src: "manual" },
  { id: "s2", name: "Neil", site: "smi", pos: "Warehouse manager", pool: "floor", type: "Permanent", xero: "EMP-0011", codes: { thomax: "NEIL1", p3l: "neil", logiwa: "" }, login: true, alloc: { kora: 20, lmnd: 20, sony: 25, elacia: 10, "11mode": 15, coastal: 10 }, src: "manual" },
  { id: "s3", name: "Max", site: "smi", pos: "Warehouse manager", pool: "floor", type: "Permanent", xero: "EMP-0012", codes: { thomax: "MAX01", p3l: "max", logiwa: "" }, login: true, alloc: { kora: 15, lmnd: 25, sony: 30, "11mode": 15, coastal: 15 }, src: "manual" },
  { id: "s4", name: "Natalia", site: "par", pos: "Warehouse lead", pool: "floor", type: "Permanent", xero: "EMP-0015", codes: { thomax: "NAT01", p3l: "natalia", logiwa: "" }, login: true, alloc: { mwu: 60, colx: 40 }, src: "manual" },
  { id: "s5", name: "Bianca Phan", site: "par", pos: "Picker / packer", pool: "floor", type: "Permanent", xero: "EMP-0021", codes: { thomax: "BPH02", p3l: "", logiwa: "" }, login: false, alloc: { mwu: 70, colx: 30 }, src: "WMS" },
  { id: "s6", name: "Minh Pham", site: "smi", pos: "Manual packer", pool: "floor", type: "Casual", xero: "EMP-0023", codes: { thomax: "MPH01", p3l: "", logiwa: "" }, login: false, alloc: { sony: 55, lmnd: 25, kora: 20 }, src: "WMS" },
  { id: "s7", name: "Liberty Arbiol", site: "smi", pos: "Manual packer", pool: "floor", type: "Casual", xero: "EMP-0024", codes: { thomax: "LAR01", p3l: "", logiwa: "" }, login: false, alloc: { kora: 35, elacia: 30, coastal: 35 }, src: "WMS" },
  { id: "s8", name: "Missouri Loimata", site: "smi", pos: "CMC pre-packer", pool: "floor", type: "Permanent", xero: "EMP-0026", codes: { thomax: "MLO01", p3l: "", logiwa: "" }, login: false, alloc: { lmnd: 40, kora: 30, "11mode": 30 }, src: "WMS" },
  { id: "s9", name: "Nica", site: "par", pos: "Picker / packer", pool: "floor", type: "Casual", xero: "EMP-0028", codes: { thomax: "NIC01", p3l: "", logiwa: "" }, login: false, alloc: { mwu: 55, colx: 45 }, src: "WMS" },
  { id: "s10", name: "Praveen", site: "smi", pos: "Forklift / receiving", pool: "floor", type: "Permanent", xero: "EMP-0030", codes: { thomax: "PRA01", p3l: "", logiwa: "" }, login: false, alloc: { sony: 40, kora: 20, lmnd: 20, "11mode": 20 }, src: "manual" },
  { id: "s11", name: "Bew", site: "smi", pos: "Picker", pool: "floor", type: "Casual", xero: "EMP-0031", codes: { thomax: "BEW01", p3l: "", logiwa: "" }, login: false, alloc: { sony: 50, elacia: 25, coastal: 25 }, src: "WMS" },
  { id: "s12", name: "CSR team member 1", site: "both", pos: "CSR", pool: "csr", type: "Permanent", xero: "EMP-0040", codes: { thomax: "CSR1", p3l: "", logiwa: "" }, login: true, alloc: { mwu: 30, kora: 20, sony: 25, lmnd: 25 }, src: "manual" },
  { id: "s13", name: "CSR team member 2", site: "both", pos: "CSR", pool: "csr", type: "Permanent", xero: "EMP-0041", codes: { thomax: "CSR2", p3l: "", logiwa: "" }, login: true, alloc: { colx: 25, elacia: 20, "11mode": 25, coastal: 30 }, src: "manual" }
];
const stf = (id) => STAFF.find(s => s.id === id);
const siteName = (s) => s === "both" ? "Both sites" : SITES[s];
const pctSum = (s) => Object.values(s.alloc).reduce((a, b) => a + (+b || 0), 0);

/* ===== Cost & margin ===== */
let BSEL = null, btab = "Labour";
const VDESC = { T: ["TDABC · practical capacity", "Clients pay only for minutes and space actually used, priced at normal (practical) capacity. Idle time and empty space are shown separately as Unused capacity. Use for client rates and rate reviews."],
  F: ["Full absorption", "All company costs for the period spread over the work done, including idle time and empty space. What FA really spent. Use for break-even, the bank and real profit."] };
function pCost(M) { return sub === "Cost to serve" ? pServe(M) : pBase(M); }
function pBase(M) {
  const b = M.base, tiles = [
    ["T", "TDABC · cost per order", `<span class="two"><span>B2C ${money(b.T.b2c.cpo)}</span><span>B2B ${money(b.T.b2b.cpo)}</span></span>`, "for rates and rate reviews"],
    ["F", "Full absorption · cost per order", `<span class="two"><span>B2C ${money(b.F.b2c.cpo)}</span><span>B2B ${money(b.F.b2b.cpo)}</span></span>`, "what FA really spent per order"],
    ["U", "Unused capacity", `${pct(M.unusedPct)} · ${m0(M.unusedTot * PF)}`, `${PER === "Month" ? "a month" : PLABEL} · idle time, empty space, machines`]];
  let h = `<div class="ph"><div><h1>Base cost</h1><p>What it costs FA to serve one order or one unit, the same for every client · ${esc(PLABEL)}. Click a card to see only that view; click again to compare.</p></div></div>
  <div class="kpis tabtiles">${tiles.map(t => `<button class="kpi" data-bsel="${t[0]}" aria-pressed="${BSEL === t[0]}"><div class="l">${t[1]}</div><div class="v" style="font-size:20px">${t[2]}</div><div class="s">${t[3]}</div></button>`).join("")}</div>`;
  const vs = BSEL === "T" ? ["T"] : BSEL === "F" ? ["F"] : BSEL === "U" ? [] : ["T", "F"];
  if (vs.length) {
    h += `<div class="${vs.length > 1 ? "grid2" : ""}">${vs.map(v => `<div class="callout"><strong>${VDESC[v][0]}.</strong> ${VDESC[v][1]}</div>`).join("")}</div>
    <div class="card"><h2>B2C and B2B orders</h2><p class="sub">B2B = more than ${S.b2b} units in an order (Settings → Rules). Click a line for how it is calculated.</p><div class="tw"><table><thead><tr><th>Order type</th><th class="r">Orders / month</th><th class="r">Units / order</th>${vs.map(v => `<th class="r">${v === "T" ? "TDABC" : "Full absorption"} · cost / order</th>`).join("")}</tr></thead><tbody>
      ${["b2c", "b2b"].map(k => `<tr class="clickable" data-row="seg|${k}"><td class="sup">${k.toUpperCase()}</td><td class="r num">${num(b.T[k].orders)}</td><td class="r num">${b.T[k].units.toFixed(1)}</td>${vs.map(v => `<td class="r num"><strong>${money(b[v][k].cpo)}</strong></td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
    <div class="card"><h2>Cost per unit by service</h2><p class="sub">Smithfield prices; Parramatta has its own pool (open a line to see both). Click a line for the full calculation and the settings it uses.</p><div class="tw"><table><thead><tr><th>Service</th><th>Per</th>${vs.map(v => `<th class="r">${v === "T" ? "TDABC" : "Full absorption"}</th>`).join("")}${vs.length > 1 ? '<th class="r">Difference</th>' : ""}<th>Basis</th></tr></thead><tbody>
      ${SERVICES.map(s => { const t = M.unit(s.code, "T", "smi").total, f = M.unit(s.code, "F", "smi").total; return `<tr class="clickable" data-row="svc|${s.code}"><td class="sup">${esc(s.name)}<div class="meta mono">${s.code}</div></td><td>${esc(s.unit)}</td>${vs.map(v => `<td class="r num">${money(v === "T" ? t : f, 3)}</td>`).join("")}${vs.length > 1 ? `<td class="r num meta">${money(f - t, 3)}</td>` : ""}<td><span class="pill ${s.basis === "Estimate" ? "p-amber" : "p-blue"}">${esc(s.basis)}</span></td></tr>`; }).join("")}
    </tbody></table></div></div>`;
  }
  if (!BSEL || BSEL === "U") h += `<div class="card"><h2>Unused capacity by resource</h2><p class="sub">Measured by resource, not by activity: the same people receive, pick and pack. Not charged to clients in TDABC; included in Full absorption.</p><div class="tw"><table><thead><tr><th>Resource</th><th>Type</th><th class="r">Cost</th><th style="min-width:150px">Used</th><th class="r">Unused $</th></tr></thead><tbody>
    ${M.unusedRows.map(r => `<tr class="clickable" data-row="${r.id}"><td class="sup">${esc(r.name)}</td><td class="meta">${r.kind}</td><td class="r num">${m0(r.cost * PF)}</td><td>${ubar(r.usedPct)}</td><td class="r num">${m0(r.unused * PF)}</td></tr>`).join("")}
    <tr class="tot"><td colspan="4">Total unused capacity · ${pct(M.unusedPct)} of these resources</td><td class="r num">${m0(M.unusedTot * PF)}</td></tr></tbody></table></div></div>`;
  h += `<div class="card"><h2>How base cost is built</h2><div class="chips" style="margin-bottom:12px">${["Pools", "Labour", "Minutes", "Overheads"].map(t => `<button class="btn ${btab === t ? "on" : ""}" data-btab="${t}">${t}</button>`).join("")}</div>${baseTab(M)}</div>`;
  return h;
}
const ubar = (p) => `<span class="mbar"><span class="track"><i style="width:${Math.min(100, p * 100)}%;background:${p >= 0.95 ? "var(--green)" : p >= 0.8 ? "var(--blue-mid)" : "#e2a33a"}"></i></span><span class="num small">${pct(p, 0)}</span></span>`;
function baseTab(M) {
  if (btab === "Pools") {
    const rows = [...Object.entries(POOLS).map(([k, p]) => [`pool|${k}`, p.name, "Xero Payroll" + (p.site ? " · " + SITES[p.site] : ""), M.pools[k].total, "Labour minutes", `${money(M.pools[k].cpmT, 3)} / ${money(M.pools[k].cpmF, 3)} per min`]),
      ["space|smi", "Rent · Smithfield", "Xero: rent (Charter Hall)", M.space.smi.rent, "Pallet-weeks", `${money(M.space.smi.rateT)} / ${money(M.space.smi.rateF)} per pallet-week`],
      ["space|par", "Notional rent · Parramatta (owned)", "Settings: notional market rent", M.space.par.rent, "Pallet-weeks", `${money(M.space.par.rateT)} / ${money(M.space.par.rateF)} per pallet-week`],
      ["cmc|cmc", "CMC CartonWrap", "Xero: equipment finance, service, carton", M.cmc.cost, "CMC orders", `${money(M.cmc.rateT, 3)} / ${money(M.cmc.rateF, 3)} per order`],
      ...OVH.map(o => [`ovh|${o.id}`, o.name, o.src, o.amount, o.driver, `${money(M.ovhRate[o.id], 3)} per ${o.unit}`])];
    return `<p class="sub">Every Xero expense account maps to one pool (Settings → mapping). Rates shown TDABC / Full absorption. Postage excluded.</p><div class="tw"><table><thead><tr><th>Pool</th><th>Source</th><th class="r">Amount / month</th><th>Driver</th><th class="r">Rate</th></tr></thead><tbody>${rows.map(r => `<tr class="clickable" data-row="${r[0]}"><td class="sup">${esc(r[1])}</td><td class="meta">${esc(r[2])}</td><td class="r num">${m0(r[3])}</td><td>${esc(r[4])}</td><td class="r num">${r[5]}</td></tr>`).join("")}</tbody></table></div>`;
  }
  if (btab === "Labour") return `<p class="sub">Labour cost = gross + super + payroll tax + workers comp (PAYG is inside gross). Pool totals only; pay by person stays private.</p><div class="tw"><table><thead><tr><th>Pool</th><th class="r">Staff</th><th class="r">Labour cost</th><th class="r">Paid hours</th><th>Utilisation</th><th class="r">Practical min</th><th>Used</th><th class="r">TDABC / min</th><th class="r">Full / min</th></tr></thead><tbody>
    ${Object.entries(POOLS).map(([k, p]) => { const c = M.pools[k]; return `<tr class="clickable" data-row="pool|${k}"><td class="sup">${esc(p.name)}<div class="meta">${esc(p.who)}</div></td><td class="r num">${p.staff}</td><td class="r num">${m0(c.total)}</td><td class="r num">${num(p.hours)}</td><td>${fld(p.util)}</td><td class="r num">${num(c.practical)}</td><td>${ubar(c.usedPct)}</td><td class="r num"><strong>${money(c.cpmT, 3)}</strong></td><td class="r num">${money(c.cpmF, 3)}</td></tr>`; }).join("")}</tbody></table></div>`;
  if (btab === "Minutes") return `<p class="sub">Minutes per activity. Edit a value and every cost and margin updates. Estimates are replaced by time-study results.</p><div class="tw"><table><thead><tr><th>Activity</th><th>Per</th><th>Minutes</th><th>Basis</th><th class="r">TDABC · Smithfield</th></tr></thead><tbody>
    ${SERVICES.filter(s => s.floor || s.csr).map(s => `<tr class="clickable" data-row="svc|${s.code}"><td class="sup">${esc(s.name)}${s.warn ? `<div class="warnbox" style="margin-top:4px">${esc(s.warn)}</div>` : ""}${s.note ? `<div class="meta">${esc(s.note)}</div>` : ""}</td><td>${esc(s.unit)}</td><td>${fld(s.floor || s.csr)}</td><td><span class="pill ${s.basis === "Estimate" ? "p-amber" : "p-blue"}">${esc(s.basis)}</span></td><td class="r num">${money(M.unit(s.code, "T", "smi").total, 3)}</td></tr>`).join("")}</tbody></table></div>`;
  return `<p class="sub">Overheads are spread by the activity that causes them.</p><div class="tw"><table><thead><tr><th>Overhead</th><th class="r">Amount</th><th>Driver</th><th class="r">Rate</th></tr></thead><tbody>
    ${OVH.map(o => `<tr class="clickable" data-row="ovh|${o.id}"><td class="sup">${esc(o.name)}</td><td class="r num">${m0(o.amount)}</td><td>${esc(o.driver)}</td><td class="r num">${money(M.ovhRate[o.id], 3)} / ${o.unit}</td></tr>`).join("")}
    <tr class="clickable" data-row="cmc|cmc"><td class="sup">CMC CartonWrap</td><td class="r num">${m0(M.cmc.cost)}</td><td>CMC orders</td><td class="r num">${money(M.cmc.rateT, 3)} / order (TDABC)</td></tr>
    <tr class="clickable" data-row="set|matMan"><td class="sup">Packaging materials · manual</td><td class="r num">—</td><td>Orders packed</td><td class="r num">${money(S.matMan)} / order</td></tr>
    <tr class="clickable" data-row="set|matCmc"><td class="sup">Packaging materials · CMC</td><td class="r num">—</td><td>Orders through CMC</td><td class="r num">${money(S.matCmc)} / order</td></tr></tbody></table></div>`;
}
function pServe(M) {
  const cs = M.clients, rev = cs.reduce((a, c) => a + c.revenue, 0), cost = cs.reduce((a, c) => a + c.cost, 0), mg = (rev - cost) / rev;
  const under = cs.filter(c => c.marginPct < S.floor), byCpo = cs.slice().sort((a, b) => a.cpo - b.cpo);
  const below = []; cs.forEach(c => c.lines.forEach(l => { if (l.marginPct != null && l.marginPct < 0) below.push({ c, l }); }));
  below.sort((a, b) => a.l.unitMargin * a.l.vol - b.l.unitMargin * b.l.vol);
  const sub$ = -below.reduce((a, b) => a + b.l.unitMargin * b.l.vol, 0);
  return `<div class="ph"><div><h1>Cost to serve</h1><p>What each client costs, depending on how complex they are · ${esc(PLABEL)}</p></div>
    <div class="seg" role="group" aria-label="Costing view"><button data-var="T" aria-pressed="${VAR === "T"}">TDABC</button><button data-var="F" aria-pressed="${VAR === "F"}">Full absorption</button></div></div>
  <div class="callout"><strong>${VDESC[VAR][0]}.</strong> ${VDESC[VAR][1]}</div>
  <div class="kpis"><div class="kpi"><div class="l">Margin · all pilot clients</div><div class="v">${pct(mg)}</div><div class="s">${m0(rev - cost)} on ${m0(rev)} billed</div></div>
    <div class="kpi ${under.length ? "amber" : ""}"><div class="l">Clients under ${pct(S.floor, 0)} floor</div><div class="v">${under.length}</div><div class="s">${under.map(c => esc(c.short)).join(", ") || "none"}</div></div>
    <div class="kpi"><div class="l">Cost per order range</div><div class="v" style="font-size:20px">${money(byCpo[0].cpo)} – ${money(byCpo[byCpo.length - 1].cpo)}</div><div class="s">${esc(byCpo[0].short)} → ${esc(byCpo[byCpo.length - 1].short)}</div></div>
    <div class="kpi red"><div class="l">Below-cost lines</div><div class="v">${m0(sub$)}</div><div class="s">${below.length} lines · ${PER === "Month" ? "a month" : esc(PLABEL)}</div></div></div>
  <div class="card"><h2>Clients</h2><p class="sub">Billed = Xero processing lines (postage excluded). Drivers show why a client costs more or less than average. Click a client for the breakdown and the staff working on it.</p><div class="tw"><table><thead><tr><th>Client</th><th class="r">Orders</th><th class="r">Billed</th><th class="r">Cost</th><th>Margin</th><th class="r">Cost / order</th><th class="r">Units / order</th><th class="r">B2B share</th><th class="r">Returns / 100</th><th class="r">Tickets / 1k orders</th></tr></thead><tbody>
    ${cs.slice().sort((a, b) => a.marginPct - b.marginPct).map(c => { const o = c.vols["ORD-FEE"]; return `<tr class="clickable" data-client="${c.id}"><td class="sup">${esc(c.name)}<div class="meta">${esc(c.type)} · ${SITES[c.site]} · CMC ${pct(c.cmc, 0)}</div></td><td class="r num">${num(o * PF)}</td><td class="r num">${m0(c.revenue)}</td><td class="r num">${m0(c.cost)}</td><td>${mbar(c.marginPct)}</td><td class="r num">${money(c.cpo)}</td><td class="r num">${c.upo.toFixed(1)}</td><td class="r num">${pct(c.b2bShare, 0)}</td><td class="r num">${(c.vols.RTN / o * 100).toFixed(1)}</td><td class="r num">${(c.vols["ACC-MGT"] / o * 1000).toFixed(1)}</td></tr>`; }).join("")}
    <tr class="tot"><td>Total</td><td></td><td class="r num">${m0(rev)}</td><td class="r num">${m0(cost)}</td><td>${pct(mg)}</td><td colspan="5"></td></tr></tbody></table></div></div>
  <div class="card alert"><h2>Below cost</h2><p class="sub">Contract rate lower than our cost per unit (${VAR === "T" ? "TDABC" : "Full absorption"}). Fixed through a rate review.</p><div class="tw"><table><thead><tr><th>Client</th><th>Service</th><th class="r">Rate</th><th class="r">Cost</th><th class="r">$ ${PER === "Month" ? "/ month" : ""}</th><th></th></tr></thead><tbody>
    ${below.map(({ c, l }) => `<tr class="clickable" data-row="line|${c.id}|${l.code}"><td class="sup">${esc(c.short)}</td><td>${esc(l.s.name)}</td><td class="r num">${money(l.rate)}</td><td class="r num">${money(l.unitCost)}</td><td class="r num" style="color:var(--red)">${money(l.unitMargin * l.vol)}</td><td><button class="lnk" data-review="${c.id}">Rate review</button></td></tr>`).join("") || '<tr><td colspan="6" class="empty">No lines below cost.</td></tr>'}
  </tbody></table></div></div>`;
}

/* ----- cost panels ----- */
function costPanelHTML(type, id) {
  const M = model();
  if (type === "svc") {
    const s = SV(id), set = [];
    if (s.floor) set.push(s.floor, "utilFloor_smi", "utilFloor_par"); if (s.csr) set.push(s.csr, "utilCsr"); if (s.space) set.push("posTotal_smi", "posUsed_smi", "rent_smi", "rentNotional_par"); if (s.cmc) set.push("cmcCost", "cmcCapacity"); if (s.mat) set.push(s.mat);
    const tbl = (v, site) => { const u = M.unit(id, v, site); return `<table><tbody>${u.parts.map(p => `<tr class="clickable" data-row="${p[2]}"><td>${esc(p[0])}</td><td class="r num">${money(p[1], 3)}</td></tr>`).join("")}<tr class="tot"><td>Total</td><td class="r num">${money(u.total, 3)}</td></tr></tbody></table>`; };
    return `<h3>${esc(s.name)}</h3><dl class="dl"><dt>Per</dt><dd>${esc(s.unit)}</dd><dt>Basis</dt><dd><span class="pill ${s.basis === "Estimate" ? "p-amber" : "p-blue"}">${esc(s.basis)}</span></dd></dl>
    ${s.warn ? `<div class="warnbox">${esc(s.warn)}</div>` : ""}${s.note ? `<div class="callout">${esc(s.note)}</div>` : ""}
    <div class="grid2" style="gap:12px"><div class="tsec"><div class="tsec-h">TDABC · Smithfield</div>${tbl("T", "smi")}</div><div class="tsec"><div class="tsec-h">Full absorption · Smithfield</div>${tbl("F", "smi")}</div></div>
    <div class="tsec"><div class="tsec-h">Parramatta</div><div class="small">TDABC ${money(M.unit(id, "T", "par").total, 3)} · Full absorption ${money(M.unit(id, "F", "par").total, 3)}</div></div>
    <div class="tsec"><div class="tsec-h">Settings used · edit here or in Settings → Rules (synced)</div><dl class="dl setdl">${[...new Set(set)].map(k => setRow(k)).join("")}</dl></div>
    <div class="tsec"><div class="tsec-h">Sources</div><div class="small">Minutes: ${esc(s.basis)} · labour cost: Xero Payroll ${MONTH} · overheads: Xero P&L · volumes: Thomax (WMS).</div></div>`;
  }
  if (type === "pool") {
    const p = POOLS[id], c = M.pools[id], ppl = STAFF.filter(x => (id === "csr" ? x.pool === "csr" : x.pool === "floor" && (x.site === p.site)));
    return `<h3>${esc(p.name)}</h3><p class="small muted">${esc(p.who)} · ${p.staff} staff</p>
    <div class="tsec"><div class="tsec-h">How cost per minute is calculated</div><div class="formula">Gross ${money(c.gross, 0)} + super ${money(c.sup, 0)} + payroll tax ${money(c.ptax, 0)} + workers comp ${money(c.wc, 0)} = <strong>${money(c.total, 0)}</strong><br>${num(p.hours)} paid hours × 60 × ${pct(c.util, 0)} utilisation = ${num(c.practical)} practical minutes<br><strong>TDABC = ${money(c.total, 0)} ÷ ${num(c.practical)} = ${money(c.cpmT, 3)} / min</strong><br>Minutes actually used (WMS activity) = ${num(c.used)} (${pct(c.usedPct, 0)})<br><strong>Full absorption = ${money(c.total, 0)} ÷ ${num(c.used)} = ${money(c.cpmF, 3)} / min</strong><br>Unused capacity = ${money(c.unused, 0)}</div></div>
    <div class="tsec"><div class="tsec-h">Settings used</div><dl class="dl setdl">${setRow(p.util)}${setRow("superRate")}${setRow("payrollTax")}${setRow("workersComp")}</dl></div>
    <div class="tsec"><div class="tsec-h">People in this pool</div><div class="small">${ppl.map(x => `<span class="chip">${esc(x.name)} · ${esc(x.type)}</span>`).join(" ") || "—"}</div><div class="row" style="margin-top:8px"><button class="btn" data-goto="settings|Staff & allocation">Staff & allocation</button></div></div>
    <div class="tsec"><div class="tsec-h">Sources</div><div class="small">Xero Payroll pay runs (gross, super, hours) · agency staff from supplier bills (if any) · activity minutes from Thomax.</div></div>`;
  }
  if (type === "space") {
    const sp = M.space[id];
    return `<h3>Pallet space · ${SITES[id]}</h3>${sp.notional ? '<div class="callout">Parramatta is owned, so Xero has no rent. A notional market rent is used so its clients are not shown cheaper than they are.</div>' : ""}
    <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">${sp.notional ? "Notional rent" : "Rent"} ${money(sp.rent, 0)} / month<br><strong>TDABC = rent ÷ (all ${num(sp.tot)} positions × 4.33 weeks) = ${money(sp.rateT)} per pallet-week</strong><br><strong>Full absorption = rent ÷ (${num(sp.used)} used positions × 4.33) = ${money(sp.rateF)}</strong><br>Space used ${pct(sp.usedPct, 0)} · unused space cost ${money(sp.unused, 0)}</div></div>
    <div class="tsec"><div class="tsec-h">Settings used</div><dl class="dl setdl">${id === "smi" ? setRow("rent_smi") + setRow("posTotal_smi") + setRow("posUsed_smi") : setRow("rentNotional_par") + setRow("posTotal_par") + setRow("posUsed_par")}</dl></div>
    <div class="tsec"><div class="tsec-h">Sources</div><div class="small">${id === "smi" ? "Xero rent account (Charter Hall)" : "Notional rent set in Rules"} · positions used from the WMS location report (floor-stacked pallets count as used).</div></div>`;
  }
  if (type === "cmc") {
    const c = M.cmc;
    return `<h3>CMC CartonWrap</h3><div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">Machine cost ${money(c.cost, 0)} / month (lease, service, carton)<br><strong>TDABC = ÷ ${num(c.cap)} practical capacity = ${money(c.rateT, 3)} per order</strong><br><strong>Full absorption = ÷ ${num(c.used)} orders run = ${money(c.rateF, 3)}</strong><br>Used ${pct(c.usedPct, 0)} · unused ${money(c.unused, 0)}</div></div>
    <div class="tsec"><div class="tsec-h">Process events</div><ul class="tl"><li class="k-note"><div class="tl-h"><strong>~09/2026</strong> pre-pack changed</div><div class="tl-b">Bubble wrap per bottle + cardboard tray + paper strap → bubble bag + packing slip stuck on. Tracked in Improvements & savings.</div></li></ul></div>
    <div class="tsec"><div class="tsec-h">Settings used</div><dl class="dl setdl">${setRow("cmcCost")}${setRow("cmcCapacity")}${setRow("min_PACK_CMC")}${setRow("matCmc")}</dl></div>`;
  }
  if (type === "ovh") {
    const o = OVH.find(x => x.id === id), tot = o.id === "admin" ? M.usedLab : o.total;
    return `<h3>${esc(o.name)}</h3><dl class="dl"><dt>Amount</dt><dd class="num">${money(o.amount, 0)}</dd><dt>Source</dt><dd>${esc(o.src)}</dd><dt>Spread by</dt><dd>${esc(o.driver)}</dd></dl>
    <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">${money(o.amount, 0)} ÷ ${num(tot)} ${esc(o.unit)}s (FA-wide) = ${money(M.ovhRate[o.id], 3)} per ${esc(o.unit)}</div></div>
    <div class="callout">Open rule (G/F): admin could be spread by revenue instead; automation only on orders that go through the machine. To decide.</div>`;
  }
  if (type === "set") return `<h3>${esc(SDEF[id][0])}</h3><div class="tsec"><div class="tsec-h">Setting · synced with Settings → Rules</div><dl class="dl setdl">${setRow(id)}</dl></div><div class="tsec"><div class="tsec-h">Source</div><div class="small">Average from packaging supplier bills in Xero (house stock), per order packed. Open rule H: actual materials per client.</div></div>`;
  if (type === "seg") {
    const k = id, b = M.base;
    const rows = ORDER_SIZES.filter(([u]) => k === "b2b" ? u > S.b2b : u <= S.b2b);
    return `<h3>${k.toUpperCase()} orders</h3><div class="tsec"><div class="tsec-h">Rule · synced with Settings → Rules</div><dl class="dl setdl">${setRow("b2b", "B2B = more than this many units")}${setRow("b2cCmcShare")}</dl></div>
    <dl class="dl"><dt>Orders / month</dt><dd>${num(b.T[k].orders)}</dd><dt>Units / order</dt><dd>${b.T[k].units.toFixed(1)}</dd><dt>TDABC cost / order</dt><dd><strong>${money(b.T[k].cpo)}</strong></dd><dt>Full absorption</dt><dd>${money(b.F[k].cpo)}</dd></dl>
    <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">Per order = units × pick cost + packing (${k === "b2c" ? `${pct(S.b2cCmcShare, 0)} CMC + materials, rest manual` : "manual, longer for big orders, more materials"}) + order handling (CSR + software)<br>Average weighted by the number of orders of each size (WMS order lines).</div></div>
    <div class="tsec"><div class="tsec-h">Order sizes in this group</div><table><thead><tr><th class="r">Units</th><th class="r">Orders</th></tr></thead><tbody>${rows.map(r => `<tr><td class="r num">${r[0]}</td><td class="r num">${num(r[1])}</td></tr>`).join("")}</tbody></table></div>`;
  }
  return null;
}

/* ===== Improvements & savings (made-up examples) ===== */
const ICATS = { "Workflow": ["Receiving", "Storage", "Picking", "Packing", "Returns", "Dispatch", "CSR", "Admin", "Accounts", "General"], "Suppliers": ["Packaging", "Labour hire", "Equipment & service", "Software", "Freight", "Other"], "Space": ["Racking", "Slotting", "Floor pallets", "Other"], "Labour": ["Rosters", "Overtime", "Training", "Other"], "Equipment & automation": ["CMC CartonWrap", "Sure Sort", "Bubble wrap machine", "Scanners", "New machine"] };
const IDETAIL = { "Packing": ["Manual", "Automated (CMC)", "Flow wrap (future)"], "Picking": ["Units", "Cartons", "Pallets"], "Receiving": ["Cartons", "Pallets", "Containers"] };
const ICHANGES = ["Process & time", "Supplier & price", "Materials", "Equipment", "Space", "People & rosters"];
const ISTAT = { idea: ["Idea", "Parked", "Rejected"], init: ["Approved", "In progress", "Done", "Verified"] };
const istPill = (s) => `<span class="pill ${{ Verified: "p-green", Done: "p-blue", "In progress": "p-amber", Approved: "p-purple", Idea: "p-grey", Parked: "p-grey", Rejected: "p-red" }[s] || "p-grey"}">${s}</span>`;
let IMPS = [
  { id: "i1", name: "CMC prepping optimisation", desc: "Bubble wrap per bottle + cardboard tray + paper strap replaced by a bubble bag with the packing slip stuck on, so the CMC scans it directly.", cat: "Workflow", subcat: "Packing", detail: "Automated (CMC)", changes: ["Process & time", "Materials", "Supplier & price"], status: "Done", type: "Hard saving", owner: "Asal", start: "01/08/2026",
    blocks: [{ k: "min", label: "Pre-pack minutes per CMC order", before: 2.4, after: 0.9, unit: "min", vol: 56700, rate: 0.98 }, { k: "mat", label: "Materials per CMC order", before: 0.71, after: 0.38, unit: "$", vol: 56700 }],
    project: { people: ["s1", "s2", "s3", "s8"], steps: [["Measure before", "Asal", "01/08", "08/08", "done"], ["Order bubble bags (China)", "Asal", "08/08", "15/09", "done"], ["Trial on 2 clients", "Max", "16/09", "22/09", "done"], ["Train pre-packers", "Neil", "22/09", "26/09", "done"], ["Roll out to all CMC clients", "Max", "29/09", "03/10", "done"], ["Measure after & recalculate", "Asal", "20/10", "31/10", "progress"], ["Report to Mark", "Asal", "03/11", "07/11", "todo"]] } },
  { id: "i2", name: "Cheaper mailers for manual packing", desc: "Same mailer size from a new packaging supplier at a lower unit price.", cat: "Suppliers", subcat: "Packaging", detail: "", changes: ["Supplier & price"], status: "In progress", type: "Hard saving", owner: "Asal", start: "06/10/2026",
    blocks: [{ k: "price", label: "Mailer unit price", before: 0.42, after: 0.33, unit: "$", vol: 41000 }],
    project: { people: ["s1", "s6", "s7"], steps: [["Quotes from 3 suppliers", "Asal", "06/10", "13/10", "done"], ["Sample test with packers", "Neil", "14/10", "20/10", "done"], ["First order", "Asal", "21/10", "28/10", "progress"], ["Switch over", "Neil", "29/10", "05/11", "todo"], ["Check price on bills", "Asal", "01/12", "05/12", "todo"]] } },
  { id: "i3", name: "Move floor pallets into racking · Smithfield", desc: "About 180 pallets sit on the floor; extra racking bays would free aisle space and cut double handling.", cat: "Space", subcat: "Floor pallets", detail: "", changes: ["Space", "Equipment", "Process & time"], status: "Idea", type: "Soft (capacity freed)", owner: "Asal", start: "",
    blocks: [{ k: "min", label: "Extra moves per floor pallet per week", before: 1.2, after: 0.2, unit: "min", vol: 780, rate: 0.98 }], est: 2900 },
  { id: "i4", name: "Roster to forecast volume", desc: "Match casual shifts to the daily order forecast to cut idle time on quiet days.", cat: "Labour", subcat: "Rosters", detail: "", changes: ["People & rosters"], status: "Idea", type: "Hard saving", owner: "Asal", start: "", blocks: [], est: 6400 },
  { id: "i5", name: "Software subscriptions review", desc: "Two overlapping label/printing subscriptions; cancel one.", cat: "Suppliers", subcat: "Software", detail: "", changes: ["Supplier & price"], status: "Approved", type: "Hard saving", owner: "Asal", start: "20/10/2026", blocks: [{ k: "price", label: "Monthly subscription", before: 389, after: 0, unit: "$", vol: 1 }],
    project: { people: ["s1"], steps: [["Check usage with Tarek", "Asal", "20/10", "27/10", "progress"], ["Cancel and confirm on Xero bill", "Asal", "28/10", "30/11", "todo"]] } }
];
const impSave = (i) => i.blocks.length ? i.blocks.reduce((a, b) => a + (b.before - b.after) * b.vol * (b.k === "min" ? b.rate : 1), 0) : (i.est || 0);
const isInit = (i) => ISTAT.init.includes(i.status);
let icat = "All", NEWIDEA = null;
function pImprove(M) {
  const inits = IMPS.filter(isInit), ideas = IMPS.filter(i => !isInit(i));
  if (sub === "Overview") {
    const ver = inits.filter(i => ["Done", "Verified"].includes(i.status)), run = ver.reduce((a, i) => a + impSave(i), 0), prog = inits.filter(i => !["Done", "Verified"].includes(i.status));
    const late = inits.filter(i => (i.project?.steps || []).some(s => s[4] === "late")).length;
    const byCat = Object.keys(ICATS).map(c => [c, inits.filter(i => i.cat === c).reduce((a, i) => a + impSave(i), 0), ideas.filter(i => i.cat === c && i.status === "Idea").reduce((a, i) => a + impSave(i), 0)]);
    const mx = Math.max(...byCat.map(b => b[1] + b[2]), 1);
    return `<div class="ph"><div><h1>Improvements & savings</h1><p>Cost no longer spent (not leakage) · ${esc(PLABEL)}</p></div><button class="btn primary" data-act="newidea">+ New idea</button></div>
    <div class="kpis"><button class="kpi" data-goto="improve|Initiatives"><div class="l">Savings delivered</div><div class="v">${m0(run * PF)}</div><div class="s">${PER === "Month" ? "a month" : esc(PLABEL)} · ${m0(run * 12)} a year run-rate</div></button>
      <button class="kpi" data-goto="improve|Initiatives"><div class="l">Initiatives in progress</div><div class="v">${prog.length}</div><div class="s">${late ? late + " late" : "all on track"}</div></button>
      <button class="kpi" data-goto="improve|Ideas"><div class="l">Ideas waiting</div><div class="v">${ideas.filter(i => i.status === "Idea").length}</div><div class="s">estimated ${m0(ideas.filter(i => i.status === "Idea").reduce((a, i) => a + impSave(i), 0))} a month</div></button>
      <button class="kpi" data-goto="improve|Initiatives"><div class="l">Verified</div><div class="v">${inits.filter(i => i.status === "Verified").length} of ${inits.length}</div><div class="s">confirmed by 1–3 months of data</div></button></div>
    <div class="grid2"><div class="card"><h2>By category</h2><p class="sub">Solid = initiatives (measured), light = ideas (estimated), $ a month.</p>${byCat.map(b => `<div class="catbar"><span>${esc(b[0])}</span><span class="track"><i style="width:${b[1] / mx * 100}%"></i><i class="est" style="width:${b[2] / mx * 100}%"></i></span><span class="num small">${m0(b[1])}${b[2] ? " + " + m0(b[2]) : ""}</span></div>`).join("")}</div>
    <div class="card"><h2>Projects</h2><p class="sub">Initiatives with their current step.</p><div class="tw"><table><tbody>${inits.map(i => { const st = (i.project?.steps || []).find(s => s[4] !== "done"); return `<tr class="clickable" data-imp="${i.id}"><td class="sup">${esc(i.name)}<div class="meta">${st ? "Now: " + esc(st[0]) + " · " + esc(st[1]) + " · due " + st[3] : "All steps done"}</div></td><td>${istPill(i.status)}</td></tr>`; }).join("")}</tbody></table></div></div></div>`;
  }
  const list = (sub === "Ideas" ? ideas : inits).filter(i => icat === "All" || i.cat === icat);
  return `<div class="ph"><div><h1>${sub}</h1><p>${sub === "Ideas" ? "Proposed, not started. Savings are estimates. Approve an idea to turn it into an initiative with a project." : "Approved and being done. Savings are measured before and after."}</p></div><button class="btn primary" data-act="newidea">+ New idea</button></div>
  <div class="chips">${["All", ...Object.keys(ICATS)].map(c => `<button class="btn ${icat === c ? "on" : ""}" data-icat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
  <div class="card"><div class="tw"><table><thead><tr><th>${sub === "Ideas" ? "Idea" : "Initiative"}</th><th>Category</th><th>Status</th><th>Type</th><th class="r">${sub === "Ideas" ? "Est." : "Saving"} / month</th><th>Owner</th></tr></thead><tbody>
    ${list.map(i => `<tr class="clickable" data-imp="${i.id}"><td class="sup">${esc(i.name)}<div class="meta">${esc(i.desc)}</div></td><td>${esc(i.cat)}<div class="meta">${esc(i.subcat)}${i.detail ? " · " + esc(i.detail) : ""}</div></td><td>${istPill(i.status)}</td><td class="meta">${esc(i.type)}</td><td class="r num">${m0(impSave(i))}</td><td>${esc(i.owner)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Nothing here yet.</td></tr>'}
  </tbody></table></div></div>`;
}
function impHTML(id) {
  const i = IMPS.find(x => x.id === id), init = isInit(i), s = impSave(i);
  const blocks = i.blocks.map(b => `<tr><td>${esc(b.label)}</td><td class="r num">${b.unit === "$" ? money(b.before) : b.before + " " + b.unit}</td><td class="r num">${b.unit === "$" ? money(b.after) : b.after + " " + b.unit}</td><td class="r num">${num(b.vol)}</td><td class="r num"><strong>${m0((b.before - b.after) * b.vol * (b.k === "min" ? b.rate : 1))}</strong></td></tr>`).join("");
  const P = i.project, st = (k) => ({ done: "p-green", progress: "p-amber", todo: "p-grey", late: "p-red" }[k]);
  const pplOpts = STAFF.filter(x => !(P?.people || []).includes(x.id));
  return `<div class="row" style="justify-content:space-between"><h3>${esc(i.name)}</h3>${istPill(i.status)}</div>
  <p class="small">${esc(i.desc)}</p>
  <dl class="dl"><dt>Category</dt><dd>${esc(i.cat)} → ${esc(i.subcat)}${i.detail ? " → " + esc(i.detail) : ""}</dd><dt>What changes</dt><dd>${i.changes.map(esc).join(" · ")}</dd><dt>Type</dt><dd>${esc(i.type)}</dd><dt>Owner</dt><dd>${esc(i.owner)}</dd></dl>
  <div class="tsec"><div class="tsec-h">${init ? "Measured saving" : "Estimated saving"} · ${m0(s)} a month · ${m0(s * 12)} a year</div>${blocks ? `<table><thead><tr><th>Building block</th><th class="r">Before</th><th class="r">After</th><th class="r">Volume / month</th><th class="r">Saving</th></tr></thead><tbody>${blocks}</tbody></table>` : `<div class="small">Estimate entered by hand: ${m0(i.est || 0)} a month. Claude can propose a calculation once the category and changes are set.</div>`}</div>
  ${P ? `<div class="tsec"><div class="tsec-h">Project timeline</div><div class="gantt">${P.steps.map((p, k) => `<div class="gr"><span class="gn">${esc(p[0])}<span class="meta"> · ${esc(p[1])}</span></span><span class="gt"><i class="${st(p[4])}" style="margin-left:${k / P.steps.length * 100}%;width:${100 / P.steps.length}%"></i></span><span class="meta nowrap">${p[2]}–${p[3]}</span><select data-step="${i.id}|${k}" aria-label="Status of ${esc(p[0])}">${[["todo", "Not started"], ["progress", "In progress"], ["done", "Done"], ["late", "Late"]].map(o => `<option value="${o[0]}" ${o[0] === p[4] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></div>`).join("")}</div>
    <p class="meta">Each step is a task for its owner, with a reminder before the due date and when late.</p></div>
  <div class="tsec"><div class="tsec-h">People involved · suggested by Claude, edit freely</div><div class="chips">${P.people.map(pid => { const x = stf(pid); return `<span class="chip">${esc(x.name)} · ${esc(x.pos)}${x.login ? "" : ' <span class="meta">(no login)</span>'}<button data-rmppl="${i.id}|${pid}" aria-label="Remove">×</button></span>`; }).join("")}</div>
    <div class="row" style="margin-top:8px"><select id="addppl" aria-label="Add person">${pplOpts.map(x => `<option value="${x.id}">${esc(x.name)} · ${esc(x.pos)}</option>`).join("")}</select><button class="btn" data-addppl="${i.id}">Add</button></div></div>` : ""}
  <div class="row">${!init ? `<button class="btn primary" data-impact="approve|${i.id}">Approve → initiative</button><button class="btn" data-impact="park|${i.id}">Park</button><button class="btn danger" data-impact="reject|${i.id}">Reject</button>` : i.status === "Done" ? `<button class="btn primary" data-impact="verify|${i.id}">Mark verified</button>` : ""}<button class="lnk logsbtn" data-xlogs="imp|${i.id}|${esc(i.name)}">Logs</button></div>`;
}
const STEP_TPL = { "Workflow": ["Measure before", "Order / new supply", "Trial", "Training", "Roll out", "Embed & check", "Measure after & recalculate", "Report"], "Suppliers": ["Quotes", "Samples / test", "First order", "Switch over", "Check price on bills", "Report"], "Space": ["Measure before", "Plan layout", "Order racking", "Install", "Move pallets", "Measure after", "Report"], "Labour": ["Measure before", "New roster", "Trial 2 weeks", "Roll out", "Measure after", "Report"], "Equipment & automation": ["Business case", "Approval", "Order", "Install & test", "Training", "Measure after", "Report"] };
function suggestPeople(i) {
  const ops = ["s1"]; const site = i.subcat === "Packing" || i.cat === "Space" ? ["s2", "s3"] : ["s2"];
  const floor = STAFF.filter(x => x.pool === "floor" && !x.login && (i.detail?.includes("CMC") ? x.pos.includes("CMC") : i.subcat === "Packing" ? x.pos.toLowerCase().includes("pack") : false)).map(x => x.id);
  return [...ops, ...site, ...floor];
}
function newIdeaHTML() {
  const n = NEWIDEA, subs = ICATS[n.cat] || [], det = IDETAIL[n.subcat] || [];
  const blocks = [];
  if (n.changes.includes("Process & time")) blocks.push(`Minutes before → after × volume × cost per minute <span class="meta">(WMS volumes + Base cost${n.subcat ? " · " + esc(n.subcat) : ""})</span>`);
  if (n.changes.includes("Supplier & price")) blocks.push(`Unit price before → after × quantity <span class="meta">(that supplier's bills in Xero)</span>`);
  if (n.changes.includes("Materials")) blocks.push(`Materials per order before → after × orders <span class="meta">(Xero packaging bills + WMS orders)</span>`);
  if (n.changes.includes("Space")) blocks.push(`Positions before → after × cost per position <span class="meta">(Base cost · space)</span>`);
  if (n.changes.includes("Equipment")) blocks.push(`Investment and payback <span class="meta">(quote + monthly saving)</span>`);
  if (n.changes.includes("People & rosters")) blocks.push(`Paid hours before → after × labour cost per hour <span class="meta">(Xero Payroll)</span>`);
  return `<h3>New idea</h3>
  <div class="formgrid">
    <label for="ni-n">Name</label><input id="ni-n" type="text" value="${esc(n.name)}" placeholder="e.g. CMC prepping optimisation">
    <label for="ni-d">Short description</label><textarea id="ni-d" placeholder="What changes, in your words">${esc(n.desc)}</textarea>
    <label for="ni-c">Category</label><select id="ni-c" data-ni="cat"><option value="">Choose…</option>${Object.keys(ICATS).map(c => `<option ${c === n.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
    ${n.cat ? `<label for="ni-s">Sub-category</label><select id="ni-s" data-ni="subcat"><option value="">Choose…</option>${subs.map(c => `<option ${c === n.subcat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` : ""}
    ${det.length ? `<label for="ni-t">Detail</label><select id="ni-t" data-ni="detail"><option value="">Choose…</option>${det.map(c => `<option ${c === n.detail ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` : ""}
    <span class="lbl">What changes</span><div class="chips">${ICHANGES.map(c => `<label class="chip"><input type="checkbox" data-nich="${esc(c)}" ${n.changes.includes(c) ? "checked" : ""}> ${esc(c)}</label>`).join("")}</div>
  </div>
  ${n.cat && n.changes.length ? `<div class="tsec"><div class="tsec-h"><span class="ai">AI</span> Claude proposes · ${n.asked ? "edit or confirm" : "press “Ask Claude”"}</div>
    ${n.asked ? `<div class="small"><strong>Calculation</strong><ul>${blocks.map(b => `<li>${b}</li>`).join("")}</ul><strong>Mapping</strong><ul><li>Service: ${esc(n.subcat || n.cat)}${n.detail ? " · " + esc(n.detail) : ""}</li><li>Clients: all on that service (edit later)</li><li>Site: both (edit later)</li>${n.changes.includes("Supplier & price") ? "<li>Xero supplier and account: choose when saving the first bill</li>" : ""}</ul>
      <div class="row"><label class="small" for="ni-e">Estimated saving $ / month</label><input id="ni-e" class="mini" type="number" value="${n.est || 1200}"></div></div>` : `<button class="btn" data-act="askclaude">Ask Claude</button>`}</div>` : '<p class="meta">Pick a category and what changes; Claude then proposes the calculation and mapping.</p>'}
  <div class="row"><button class="btn primary" data-act="saveidea" ${n.asked ? "" : "disabled"}>Save idea</button></div>`;
}

/* ===== Finance (made-up figures) ===== */
const FIN = {
  rev12: [575, 598, 712, 560, 571, 604, 618, 633, 627, 641, 652, 668].map(v => v * 1000),
  ebitda12: [41, 44, 66, 30, 33, 42, 45, 48, 46, 49, 51, 54].map(v => v * 1000),
  pl: [["Revenue", 6.12, 7.03, 7.46, 2.03], ["Cost of services", -4.71, -5.40, -5.77, -1.58], ["Gross profit", 1.41, 1.63, 1.69, 0.45], ["Overheads", -0.97, -1.09, -1.15, -0.30], ["EBITDA", 0.44, 0.54, 0.54, 0.15], ["Depreciation & interest", -0.21, -0.24, -0.25, -0.06], ["Net profit before tax", 0.23, 0.30, 0.29, 0.09]],
  ratios: [["DSCR", "1.62×", "lender minimum usually 1.25×", "green"], ["Interest cover", "4.1×", "", "green"], ["Debt / EBITDA", "2.3×", "", "amber"], ["Current ratio", "1.31", "", "green"], ["Debtor days", "34", "was 41", "green"], ["Creditor days", "29", "", "green"]],
  conc: [["mwu", 0.17], ["sony", 0.12], ["lmnd", 0.10], ["kora", 0.09], ["colx", 0.07]]
};
let showNames = false, PACK = { "P&L (3 years + YTD)": true, "Balance sheet": true, "Cash flow": true, "Ratios (DSCR, debt, working capital)": true, "Client concentration (anonymised)": true, "12–24 month forecast": true, "Tax & obligations (BAS, super, payroll tax)": true }, APPROVAL = "Not requested";
function pFinance() {
  const r = FIN.rev12, e = FIN.ebitda12, last = r[11];
  if (sub === "P&L") return `<div class="card"><h2>Profit & loss · $ million</h2><p class="sub">From Xero P&L. Financial years July–June. Reconciles to lodged figures.</p><div class="tw"><table><thead><tr><th></th><th class="r">FY24</th><th class="r">FY25</th><th class="r">FY26</th><th class="r">FY27 YTD (Q1)</th></tr></thead><tbody>${FIN.pl.map(l => `<tr class="clickable ${["Gross profit", "EBITDA", "Net profit before tax"].includes(l[0]) ? "tot" : ""}" data-row="fin|${esc(l[0])}"><td class="sup">${esc(l[0])}</td>${l.slice(1).map(v => `<td class="r num">${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  if (sub === "Cash & debt") return `<div class="card"><h2>Debt service and cash</h2><div class="kpis kpis6">${FIN.ratios.slice(0, 3).map(x => `<div class="kpi clickable" data-row="fin|${esc(x[0])}"><div class="l">${x[0]}</div><div class="v">${x[1]}</div><div class="s">${esc(x[2])}</div></div>`).join("")}</div></div><div class="card"><h2>EBITDA · 12 months</h2>${lineChart([{ v: e, c: "var(--blue)", area: true }], { labels: MON12, fmt: v => "$" + Math.round(v / 1000) + "k", fc: fcast(e), aria: "EBITDA by month" })}</div>`;
  if (sub === "Working capital") return `<div class="card"><h2>Working capital</h2><div class="kpis kpis6">${FIN.ratios.slice(3).map(x => `<div class="kpi clickable" data-row="fin|${esc(x[0])}"><div class="l">${x[0]}</div><div class="v">${x[1]}</div><div class="s">${esc(x[2])}</div></div>`).join("")}</div><p class="meta">Aged receivables and payables come from Xero; detail is in the Accounts Hub.</p></div>`;
  if (sub === "Clients") return `<div class="card"><h2>Client concentration</h2><p class="sub">Share of revenue, last 12 months. Names hidden by default in anything sent outside FA.</p><label class="small"><input type="checkbox" id="shownames" ${showNames ? "checked" : ""}> Show client names</label><div class="tw" style="margin-top:8px"><table><tbody>${FIN.conc.map((c, k) => `<tr><td class="sup">${showNames ? esc(cl(c[0]).name) : "Client " + "ABCDE"[k]}</td><td style="width:60%"><div class="stack"><i style="width:${c[1] * 400}%;background:var(--blue)"></i></div></td><td class="r num">${pct(c[1], 0)}</td></tr>`).join("")}<tr class="tot"><td>Top 5</td><td></td><td class="r num">${pct(FIN.conc.reduce((a, c) => a + c[1], 0), 0)}</td></tr></tbody></table></div></div>`;
  if (sub === "Bank pack") return `<div class="card"><h2>Bank pack</h2><p class="sub">Report type <strong>External finance</strong>: company totals only, no client rates or margins, no pay by person, client names hidden. Goes only to Lenders & advisers, after approval.</p>
    ${Object.keys(PACK).map(k => `<div><label class="small"><input type="checkbox" data-pack="${esc(k)}" ${PACK[k] ? "checked" : ""}> ${esc(k)}</label></div>`).join("")}
    <dl class="dl" style="margin-top:12px"><dt>Approval</dt><dd><span class="pill ${APPROVAL === "Approved by Mark" ? "p-green" : APPROVAL === "Waiting for Mark" ? "p-amber" : "p-grey"}">${APPROVAL}</span></dd></dl>
    <div class="row" style="margin-top:10px"><button class="btn" data-act="reqapprove">Request approval from Mark</button><button class="btn primary" data-share="bank" ${APPROVAL === "Approved by Mark" ? "" : "disabled"}>Email / PDF</button><span class="meta">Sending is locked until approved.</span></div></div>
    <div class="callout">Ask your bank manager for their exact list; banks differ. Typical: financial statements 2–3 years, profitability, debt service, working capital, client concentration, forecast, tax obligations, security and covenants.</div>`;
  return `<div class="ph"><div><h1>Finance</h1><p>Company-level figures for management and the bank · ${esc(PLABEL)}</p></div></div>
  <div class="kpis"><button class="kpi" data-goto="finance|P&L"><div class="l">Revenue · last month</div><div class="v">${m0(last)}</div><div class="s">▲ ${pct((last - r[10]) / r[10])} vs previous</div></button>
    <button class="kpi" data-goto="finance|P&L"><div class="l">EBITDA margin</div><div class="v">${pct(e[11] / last)}</div><div class="s">${m0(e[11])} a month</div></button>
    <button class="kpi green" data-goto="finance|Cash & debt"><div class="l">DSCR</div><div class="v">1.62×</div><div class="s">bank minimum usually 1.25×</div></button>
    <button class="kpi" data-goto="finance|Working capital"><div class="l">Debtor days</div><div class="v">34</div><div class="s">was 41</div></button></div>
  <div class="card"><h2>Revenue · 12 months</h2><p class="sub">Turn on Forecast (top bar) for the next 6 months with a range.</p>${lineChart([{ v: r, c: "var(--blue)", area: true }], { labels: MON12, fmt: v => "$" + Math.round(v / 1000) + "k", fc: fcast(r), aria: "Revenue by month" })}</div>`;
}

/* ===== KPI overview (traffic light) ===== */
const KPI_TGT = { "Orders per day": ["3,000", "g"], "Dispatched before cut-off": ["98%", "r"], "Dock-to-stock": ["24 h", "a"], "Picks per hour": ["135", "g"], "Overtime share": ["< 5%", "r"], "Services margin": ["15%", "r"], "Debtor days": ["35", "g"], "Pallet positions used · Smithfield": ["90%", "g"], "Slow stock (90+ days)": ["< 1,000", "a"], "Mis-pick rate": ["< 0.3%", "a"], "Tickets per 100 orders": ["< 2", "g"] };
function pKpiOverview() {
  return `<div class="ph"><div><h1>KPI overview</h1><p>Key KPIs vs target · ${esc(PLABEL)}. Click a group for all its KPIs, or a line for how it is calculated.</p></div></div>
  <div class="grid2">${Object.entries(KPIS).map(([g, list]) => { const keys = list.filter(k => KPI_TGT[k[0]]).slice(0, 3); return `<div class="card"><h2><button class="lnk" data-goto="kpi|${esc(g)}" style="font-size:13px;padding:0">${esc(g)} →</button></h2><div class="tw"><table><tbody>${keys.map(k => `<tr class="clickable" data-row="kpi|${esc(k[0])}"><td style="width:10px"><span class="dot ${({ g: "green", a: "amber", r: "red" })[KPI_TGT[k[0]][1]]}"></span></td><td class="sup">${esc(k[0])}</td><td class="r num">${esc(k[1])}</td><td class="meta nowrap">target ${esc(KPI_TGT[k[0]][0])}</td></tr>`).join("")}</tbody></table></div></div>`; }).join("")}</div>`;
}

/* ===== Leakage overview ===== */
function pLeakOverview(M) {
  const tot = LEAK.reduce((a, L) => a + leakAmount(L, M), 0), rec = LEAK.filter(L => L.status === "Recovered").reduce((a, L) => a + (L.recovered || 0), 0);
  const types = {}, stats = {}; LEAK.forEach(L => { types[L.kind] = (types[L.kind] || 0) + leakAmount(L, M); stats[L.status] = (stats[L.status] || 0) + 1; });
  const mx = Math.max(...Object.values(types));
  return `<div class="ph"><div><h1>Leakage</h1><p>Revenue not collected · ${esc(PLABEL)}</p></div></div>
  <div class="kpis"><button class="kpi" data-goto="leakage|Under-billing"><div class="l">Found</div><div class="v">${m0(tot)}</div><div class="s">a month while unfixed</div></button>
    <button class="kpi green" data-goto="leakage|Leakage log"><div class="l">Recovered</div><div class="v">${m0(rec)}</div><div class="s">billed by hand in Xero</div></button>
    <button class="kpi red" data-goto="leakage|Under-billing"><div class="l">Open</div><div class="v">${LEAK.filter(L => L.status === "Open").length}</div><div class="s">need a decision</div></button>
    <button class="kpi" data-goto="leakage|Rate checks"><div class="l">Rate mismatches</div><div class="v">${Object.keys(DYSPATCH_RATE).length + Object.keys(WMS_RATE).length}</div><div class="s">CLM vs Dyspatch vs WMS</div></button></div>
  <div class="grid2"><div class="card"><h2>By type</h2>${Object.entries(types).map(([k, v]) => `<div class="catbar"><span>${esc(k)}</span><span class="track"><i style="width:${v / mx * 100}%"></i></span><span class="num small">${m0(v)}</span></div>`).join("")}<h2 style="margin-top:14px">By status</h2><div class="chips">${Object.entries(stats).map(([k, v]) => `${stPill(k)} <span class="small">${v}</span>`).join(" ")}</div></div>
  <div class="card"><h2>Top 5 open</h2><div class="tw"><table><tbody>${LEAK.filter(L => L.status !== "Recovered").sort((a, b) => leakAmount(b, M) - leakAmount(a, M)).slice(0, 5).map(L => `<tr class="clickable" data-leak="${L.id}"><td class="sup">${esc(cl(L.client).short)}<div class="meta">${esc(L.cause)}</div></td><td class="r num">${money(leakAmount(L, M))}</td><td>${stPill(L.status)}</td></tr>`).join("")}</tbody></table></div></div></div>
  <div class="callout">This app never changes Xero, Dyspatch or the WMS. A person decides, and a task is created to fix the other system by hand.</div>`;
}

/* ===== Notifications ===== */
let NOTIFS = [
  { id: "n1", kind: "staff", src: "Thomax", when: "23/10/2026 02:00", text: "New staff member in Thomax: J. Tran (code JTR04, Smithfield)", data: { name: "J. Tran", site: "smi", codes: { thomax: "JTR04", p3l: "", logiwa: "" } } },
  { id: "n2", kind: "client", src: "Dyspatch export", when: "22/10/2026 16:20", text: "New client in Dyspatch: Peppr Foods (Customer ID 10458)", data: { name: "Peppr Foods", dyspatch: "10458" } },
  { id: "n3", kind: "supplier", src: "Xero", when: "22/10/2026 02:00", text: "New supplier in Xero: Bubble Pack Supplies Pty Ltd", data: { name: "Bubble Pack Supplies Pty Ltd" } }
];
let CLIENTS_EXTRA = [], SUPPLIERS = [
  { name: "Charter Hall", pool: "Rent", site: "smi", fv: "Fixed", rebill: false, exp: 78000, xero: "CH-001" },
  { name: "CMC Machinery (finance & service)", pool: "Automation", site: "smi", fv: "Fixed", rebill: false, exp: 15600, xero: "CMC-001" },
  { name: "Packaging supplier (mailers)", pool: "Packaging", site: "both", fv: "Variable", rebill: false, exp: 21500, xero: "PKG-004" },
  { name: "Toyota Material Handling", pool: "Equipment", site: "both", fv: "Fixed", rebill: false, exp: 9800, xero: "TMH-002" },
  { name: "Logiwa", pool: "Software", site: "both", fv: "Fixed", rebill: false, exp: 4900, xero: "LOG-001" },
  { name: "Client-branded boxes supplier", pool: "Packaging", site: "both", fv: "Variable", rebill: true, exp: 6200, xero: "PKG-009" }
];
function notifHTML() {
  return `<h3>Notifications</h3><p class="small muted">Found in the last syncs. Nothing is added until you confirm.</p>${NOTIFS.length ? NOTIFS.map(n => `<div class="ctk"><div class="row" style="justify-content:space-between"><span class="pill p-blue">${esc(n.src)}</span><span class="meta">${esc(n.when)}</span></div><div class="small" style="margin:6px 0">${esc(n.text)}</div><div class="row"><button class="btn primary" data-addnotif="${n.id}">Add to Analytics</button><button class="btn" data-dismiss="${n.id}">Dismiss</button></div></div>`).join("") : '<div class="empty">Nothing new.</div>'}`;
}
function addNotifHTML(id) {
  const n = NOTIFS.find(x => x.id === id), d = n.data;
  if (n.kind === "staff") return `<h3>Add staff member</h3><p class="small muted">Pre-filled from ${esc(n.src)}. Complete the rest.</p>${staffForm(d)}<div class="row"><button class="btn primary" data-savenotif="${id}">Save</button></div>`;
  if (n.kind === "client") return `<h3>Add client</h3><p class="small muted">Pre-filled from ${esc(n.src)}.</p><div class="formgrid"><label for="nc-n">Name</label><input id="nc-n" type="text" value="${esc(d.name)}"><label for="nc-s">Site</label><select id="nc-s"><option value="smi">Smithfield</option><option value="par">Parramatta</option></select><label for="nc-t">Type</label><select id="nc-t"><option>B2C</option><option>B2B</option><option>Mixed</option></select><label for="nc-st">Status</label><select id="nc-st"><option>Active</option><option>One-off services</option></select><label>Dyspatch Customer ID</label><input type="text" value="${esc(d.dyspatch)}" disabled></div><div class="row"><button class="btn primary" data-savenotif="${id}">Save</button></div>`;
  return `<h3>Add supplier</h3><p class="small muted">Pre-filled from ${esc(n.src)}.</p><div class="formgrid"><label for="ns-n">Name</label><input id="ns-n" type="text" value="${esc(d.name)}"><label for="ns-p">Cost pool</label><select id="ns-p">${["Packaging", "Labour hire", "Rent", "Equipment", "Automation", "Software", "Admin"].map(o => `<option>${o}</option>`).join("")}</select><label for="ns-f">Fixed or variable</label><select id="ns-f"><option>Variable</option><option>Fixed</option></select><label for="ns-r">Passed through to a client</label><select id="ns-r"><option value="0">No · FA cost</option><option value="1">Yes · rebilled</option></select></div><div class="row"><button class="btn primary" data-savenotif="${id}">Save</button></div>`;
}
function staffForm(d = {}) {
  return `<div class="formgrid"><label for="sf-n">Name</label><input id="sf-n" type="text" value="${esc(d.name || "")}"><label for="sf-s">Site</label><select id="sf-s">${["smi", "par", "both"].map(s => `<option value="${s}" ${d.site === s ? "selected" : ""}>${siteName(s)}</option>`).join("")}</select>
  <label for="sf-p">Position</label><select id="sf-p">${["Picker / packer", "Manual packer", "CMC pre-packer", "Forklift / receiving", "Warehouse lead", "Warehouse manager", "CSR", "Operations manager"].map(p => `<option>${p}</option>`).join("")}</select>
  <label for="sf-t">Type</label><select id="sf-t"><option>Permanent</option><option>Casual</option><option>Agency</option></select>
  <span class="lbl">Codes in each WMS</span><div class="row"><input id="sf-c1" type="text" placeholder="Thomax" value="${esc(d.codes?.thomax || "")}" style="width:110px"><input id="sf-c2" type="text" placeholder="3PLWMS" value="${esc(d.codes?.p3l || "")}" style="width:110px"><input id="sf-c3" type="text" placeholder="Logiwa" value="${esc(d.codes?.logiwa || "")}" style="width:110px"></div>
  <label for="sf-x">Xero Payroll ID</label><input id="sf-x" type="text" placeholder="leave empty if not set up yet" value=""></div>
  <p class="meta">Client % is set in the allocation matrix after saving (floor staff: filled from the WMS automatically).</p>`;
}
function saveStaffFromForm(fromNotif) {
  const v = (id) => ($("#" + id) || {}).value || "";
  const s = { id: "s" + Date.now(), name: v("sf-n").trim() || "New staff member", site: v("sf-s"), pos: v("sf-p"), pool: v("sf-p") === "CSR" ? "csr" : v("sf-p") === "Operations manager" ? "admin" : "floor", type: v("sf-t"), xero: v("sf-x").trim() || null, codes: { thomax: v("sf-c1"), p3l: v("sf-c2"), logiwa: v("sf-c3") }, login: false, alloc: {}, src: "manual" };
  STAFF.push(s); logX("staff|" + s.id, `Added${fromNotif ? " from notification" : ""}`);
  if (!s.xero) addTask({ pr: "High", topic: "Set up", co: s.name, where: "Xero Payroll", what: `Set up ${s.name} in Xero Payroll`, why: "No pay or hours = labour cost can't be calculated", owner: "Khalid", verify: "xero-payroll" });
  if (s.type === "Agency") addTask({ pr: "Medium", topic: "Set up", co: s.name, where: "Settings", what: "Link the agency supplier in Settings → Suppliers", why: "Agency cost comes from supplier bills", owner: "Asal" });
  return s;
}
function addTask(t) { const id = "T" + (TASKS.length + 1) + Date.now() % 1000; TASKS.unshift({ id, age: 0, st: "open", ...t }); logX("task|" + id, "Task created: " + t.what); return id; }

/* ===== Settings: rules, clients, suppliers, staff & allocation ===== */
let MSITE = "all";
function pRules() {
  const groups = {}; Object.keys(SDEF).forEach(k => { const g = SDEF[k][2]; (groups[g] = groups[g] || []).push(k); });
  return Object.entries(groups).map(([g, ks]) => `<div class="card"><h2>${esc(g)}</h2><p class="sub">Same values as in the details panels; a change here or there updates both and is logged.</p><dl class="dl setdl">${ks.map(k => setRow(k)).join("")}</dl></div>`).join("");
}
function pClientsSet() {
  const all = [...CLIENTS.map(c => ({ name: c.name, site: SITES[c.site], type: c.type, st: "Active", cmc: c.cmc, ids: `Xero ✓ · Dyspatch ✓ · Thomax ✓ · Logiwa —`, id: c.id })), ...CLIENTS_EXTRA];
  return `<div class="card"><h2>Clients</h2><p class="sub">Status, site, type, IDs in each system, CLM contract, weekly minimum, packing method. New clients arrive as notifications.</p><div class="tw"><table><thead><tr><th>Client</th><th>Status</th><th>Site</th><th>Type</th><th>CMC share</th><th>IDs</th><th>CLM</th></tr></thead><tbody>
  ${all.map(c => `<tr ${c.id ? `class="clickable" data-client="${c.id}"` : ""}><td class="sup">${esc(c.name)}</td><td><span class="pill ${c.st === "Active" ? "p-green" : "p-grey"}">${esc(c.st)}</span></td><td>${esc(c.site)}</td><td>${esc(c.type)}</td><td class="num">${c.cmc != null ? pct(c.cmc, 0) : "—"}</td><td class="meta">${esc(c.ids)}</td><td class="meta">${c.id ? "contract linked" : "not yet"}</td></tr>`).join("")}</tbody></table></div></div>`;
}
function pSuppliers() {
  return `<div class="card"><h2>Suppliers</h2><p class="sub">For costing: which pool and site a supplier's bills go to, fixed or variable (break-even), and whether the cost is passed through to a client (then excluded from cost).</p><div class="tw"><table><thead><tr><th>Supplier</th><th>Cost pool</th><th>Site</th><th>Fixed / variable</th><th>Passed through</th><th class="r">Expected / month</th><th>Xero</th></tr></thead><tbody>
  ${SUPPLIERS.map((s, i) => `<tr><td class="sup">${esc(s.name)}</td><td>${esc(s.pool)}</td><td>${siteName(s.site)}</td><td><select data-supfv="${i}" aria-label="Fixed or variable">${["Fixed", "Variable"].map(o => `<option ${o === s.fv ? "selected" : ""}>${o}</option>`).join("")}</select></td><td>${s.rebill ? '<span class="pill p-amber">yes · excluded</span>' : '<span class="pill p-grey">no</span>'}</td><td class="r num">${s.exp ? m0(s.exp) : "—"}</td><td class="mono">${esc(s.xero || "—")}</td></tr>`).join("")}</tbody></table></div></div>`;
}
function pStaff() {
  const cs = CLIENTS.filter(c => MSITE === "all" || c.site === MSITE), ss = STAFF.filter(s => MSITE === "all" || s.site === MSITE || s.site === "both");
  return `<div class="card"><h2>Staff</h2><p class="sub">From Xero Payroll and the WMS; new people arrive as notifications. Click a person for details.</p><div class="tw"><table><thead><tr><th>Name</th><th>Site</th><th>Position</th><th>Type</th><th>Xero Payroll</th><th>WMS codes (Thomax / 3PLWMS / Logiwa)</th><th>Login</th></tr></thead><tbody>
  ${ss.map(s => `<tr class="clickable" data-row="staff|${s.id}"><td class="sup">${esc(s.name)}</td><td>${siteName(s.site)}</td><td>${esc(s.pos)}</td><td>${esc(s.type)}</td><td>${s.xero ? `<span class="mono">${esc(s.xero)}</span>` : '<span class="pill p-red">not set up</span>'}</td><td class="mono">${esc(s.codes.thomax || "—")} / ${esc(s.codes.p3l || "—")} / ${esc(s.codes.logiwa || "—")}</td><td>${s.login ? "yes" : "—"}</td></tr>`).join("")}</tbody></table></div><div class="row" style="margin-top:10px"><button class="btn" data-act="newstaff">New staff member</button></div></div>
  <div class="card"><h2>Allocation matrix · % of each person's time per client</h2><p class="sub">Floor staff: filled from the WMS (who picked or packed which orders); type a value to override. CSR and managers: set by hand. A row can't go over 100%.</p>
    <div class="seg" role="group" aria-label="Site filter">${[["all", "All"], ["smi", "Smithfield"], ["par", "Parramatta"]].map(([k, l]) => `<button data-msite="${k}" aria-pressed="${MSITE === k}">${l}</button>`).join("")}</div>
    <div class="tw" style="margin-top:10px"><table class="matrix"><thead><tr><th>Staff</th>${cs.map(c => `<th class="r">${esc(c.short)}</th>`).join("")}<th class="r">Total</th></tr></thead><tbody>
    ${ss.map(s => { const t = pctSum(s); return `<tr><td class="sup">${esc(s.name)}<div class="meta">${esc(s.pos)} · ${s.src === "WMS" ? "from WMS" : "manual"}</div></td>${cs.map(c => `<td class="r"><input class="mini cell" type="number" min="0" max="100" step="5" value="${s.alloc[c.id] || ""}" placeholder="0" data-alloc="${s.id}|${c.id}" aria-label="${esc(s.name)} on ${esc(c.short)}"></td>`).join("")}<td class="r num ${t > 100 ? "delta-neg" : ""}">${t}%</td></tr>`; }).join("")}</tbody></table></div></div>`;
}
function staffHTML(id) {
  const s = stf(id), cs = Object.entries(s.alloc).filter(([, v]) => +v > 0);
  return `<h3>${esc(s.name)}</h3><dl class="dl"><dt>Site</dt><dd>${siteName(s.site)}</dd><dt>Position</dt><dd>${esc(s.pos)}</dd><dt>Type</dt><dd>${esc(s.type)}</dd><dt>Xero Payroll</dt><dd>${s.xero ? esc(s.xero) : '<span class="pill p-red">not set up · task created</span>'}</dd><dt>Thomax / 3PLWMS / Logiwa</dt><dd class="mono">${esc(s.codes.thomax || "—")} / ${esc(s.codes.p3l || "—")} / ${esc(s.codes.logiwa || "—")}</dd><dt>App login</dt><dd>${s.login ? "yes (gets tasks and reminders)" : "no (listed as participant only)"}</dd></dl>
  <div class="tsec"><div class="tsec-h">Clients · ${pctSum(s)}% · ${s.src === "WMS" ? "from WMS" : "manual"}</div><table><tbody>${cs.map(([c, v]) => `<tr><td>${esc(cl(c).short)}</td><td class="r"><input class="mini" type="number" value="${v}" data-alloc="${s.id}|${c}" aria-label="% on ${esc(cl(c).short)}"> %</td></tr>`).join("") || '<tr><td class="empty">No clients yet.</td></tr>'}</tbody></table><div class="row" style="margin-top:8px"><button class="btn" data-goto="settings|Staff & allocation">Open allocation matrix</button><button class="lnk logsbtn" data-xlogs="staff|${s.id}|${esc(s.name)}">Logs</button></div></div>`;
}

/* ===== Client, line, task, misc panels ===== */
function clientHTML(id) {
  const M = model(), c = M.clients.find(x => x.id === id), lk = LEAK.filter(L => L.client === id), ppl = STAFF.filter(s => +s.alloc[id] > 0);
  return `<div class="row" style="justify-content:space-between"><h3>${esc(c.name)}</h3>${mpill(c.marginPct)}</div>
  <dl class="dl"><dt>Type · site</dt><dd>${esc(c.type)} · ${SITES[c.site]} · CMC ${pct(c.cmc, 0)} of orders</dd><dt>Renewal (CLM)</dt><dd>${c.renew}</dd><dt>Billed</dt><dd class="num">${money(c.revenue)}</dd><dt>Cost · ${VAR === "T" ? "TDABC" : "Full absorption"}</dt><dd class="num">${money(c.cost)} <span class="meta">(${VAR === "T" ? "Full" : "TDABC"}: ${money(VAR === "T" ? c.costF : c.costT)})</span></dd><dt>Margin</dt><dd class="num">${money(c.margin)}</dd><dt>Cost per order</dt><dd class="num">${money(c.cpo)}</dd></dl>
  <div class="tsec"><div class="tsec-h">By service · click a line for its breakdown</div><div class="tw"><table><thead><tr><th>Service</th><th class="r">Vol</th><th class="r">Rate</th><th class="r">Cost / unit</th><th class="r">Cost $</th><th>Margin</th></tr></thead><tbody>
  ${c.lines.map(l => `<tr class="clickable" data-row="line|${c.id}|${l.code}"><td>${esc(l.s.name)}</td><td class="r num">${num(l.vol)}</td><td class="r num">${l.s.unbilled ? "—" : money(l.rate)}</td><td class="r num">${money(l.unitCost)}</td><td class="r num">${m0(l.cost)}</td><td>${mpill(l.marginPct)}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="tsec"><div class="tsec-h">Staff working on ${esc(c.short)} · % of their time (synced with Settings → Staff & allocation)</div><table><tbody>${ppl.map(s => `<tr class="clickable" data-row="staff|${s.id}"><td>${esc(s.name)}<div class="meta">${esc(s.pos)} · ${s.src === "WMS" ? "from WMS" : "manual"}</div></td><td class="r"><input class="mini" type="number" min="0" max="100" step="5" value="${s.alloc[id]}" data-alloc="${s.id}|${id}" aria-label="${esc(s.name)} %"> %</td></tr>`).join("") || '<tr><td class="empty">Nobody allocated yet.</td></tr>'}</tbody></table>
    <div class="row" style="margin-top:8px"><button class="btn" data-goto="settings|Staff & allocation">Add staff member</button><span class="meta">Set a value to 0 to remove someone from this client.</span></div></div>
  <div class="tsec"><div class="tsec-h">Leakage</div>${lk.length ? lk.map(L => `<div class="ctk clickable" data-leak="${L.id}" style="cursor:pointer"><div class="row" style="justify-content:space-between"><strong>${money(leakAmount(L, M))}</strong>${stPill(L.status)}</div><div class="small">${esc(L.cause)}</div></div>`).join("") : '<div class="empty">No leakage found this month.</div>'}</div>
  <div class="row"><button class="btn primary" data-review="${c.id}">Start rate review</button></div>`;
}
function lineHTML(id) {
  const [cid, code] = id.split("|"), M = model(), c = M.clients.find(x => x.id === cid), l = c.lines.find(x => x.code === code);
  const dy = DYSPATCH_RATE[id], wm = WMS_RATE[id], ppl = STAFF.filter(s => +s.alloc[cid] > 0 && (code === "ACC-MGT" ? s.pool === "csr" : s.pool === "floor"));
  return `<h3>${esc(c.short)} · ${esc(l.s.name)}</h3><dl class="dl"><dt>Rate (CLM)</dt><dd class="num">${l.s.unbilled ? "not billed" : money(l.rate) + " per " + esc(l.s.unit)}</dd><dt>Cost per unit</dt><dd class="num">TDABC ${money(l.unitT, 3)} · Full ${money(l.unitF, 3)}</dd><dt>Margin</dt><dd>${mpill(l.marginPct)}</dd><dt>Volume</dt><dd class="num">${num(l.vol)}</dd></dl>
  <div class="tsec"><div class="tsec-h">What the ${money(l.unitCost, 3)} (${VAR === "T" ? "TDABC" : "Full"}) is made of · click a part</div><table><tbody>${l.parts.map(p => `<tr class="clickable" data-row="${p[2]}"><td>${esc(p[0])}</td><td class="r num">${money(p[1], 3)}</td></tr>`).join("")}<tr class="tot"><td>Total</td><td class="r num">${money(l.unitCost, 3)}</td></tr></tbody></table></div>
  <div class="tsec"><div class="tsec-h">This period</div><div class="formula">Should bill = ${num(l.vol)} × ${money(l.rate)} = ${money(l.expected)}<br>Billed in Xero = ${money(l.billed)}<br>Cost = ${num(l.vol)} × ${money(l.unitCost, 3)} = ${money(l.cost)}<br>Margin = ${money(l.billed - l.cost)}</div></div>
  <div class="tsec"><div class="tsec-h">Rate in each system</div><table><tbody><tr><td>CLM</td><td class="r num">${money(l.rate)}</td></tr><tr><td>Dyspatch</td><td class="r num">${dy != null ? money(dy) : money(l.rate)}</td></tr><tr><td>WMS</td><td class="r num">${wm ? esc(wm) : money(l.rate)}</td></tr></tbody></table>${dy != null || wm ? '<span class="pill p-red">don\'t match</span>' : '<span class="pill p-green">match</span>'}</div>
  <div class="tsec"><div class="tsec-h">Staff on ${esc(c.short)} for this work</div><table><tbody>${ppl.map(s => `<tr><td>${esc(s.name)} <span class="meta">· ${esc(s.pos)}</span></td><td class="r"><input class="mini" type="number" min="0" max="100" step="5" value="${s.alloc[cid]}" data-alloc="${s.id}|${cid}" aria-label="${esc(s.name)} %"> %</td></tr>`).join("") || '<tr><td class="empty">Nobody allocated.</td></tr>'}</tbody></table><div class="row" style="margin-top:8px"><button class="btn" data-goto="settings|Staff & allocation">Add staff member</button></div></div>
  <div class="tsec"><div class="tsec-h">Sources</div><div class="small">Volume: Thomax ${esc(PLABEL)} · rate: CLM · billed: Xero invoice lines · cost: Base cost (${SITES[c.site]} pool).</div></div>
  <div class="row"><button class="btn" data-review="${cid}">Rate review for ${esc(c.short)}</button></div>`;
}
function taskHTML(id) {
  const t = TASKS.find(x => x.id === id);
  const links = { Xero: "Open Xero", "Xero Payroll": "Open Xero Payroll", WMS: "Open Thomax", "CLM / Dyspatch": "Open CLM", CLM: "Open CLM", Dyspatch: "Open Dyspatch", Floor: "", Settings: "Open Settings" };
  const L = LEAK.find(l => l.task === id || ("From leakage " + l.id) === t.why);
  const tl = (LOGS_EXTRA["task|" + id] || []).slice().reverse();
  return `<div class="row" style="justify-content:space-between"><h3>${esc(t.topic)} · ${esc(t.co)}</h3><span class="pill ${t.pr === "High" ? "p-red" : t.pr === "Medium" ? "p-amber" : "p-grey"}">${t.pr}</span></div>
  <dl class="dl"><dt>What to do</dt><dd>${esc(t.what)}</dd><dt>Why</dt><dd>${esc(t.why)}</dd><dt>Fix in</dt><dd>${esc(t.where)} (by hand) ${links[t.where] ? `· <a class="ref" href="https://go.xero.com" target="_blank" rel="noopener">${links[t.where]} ↗</a>` : ""}</dd><dt>Owner</dt><dd>${esc(t.owner)}</dd><dt>Status</dt><dd>${t.st === "snoozed" ? `Snoozed until ${esc(t.wake)}` : t.st}</dd>${t.verify ? `<dt>Closing rule</dt><dd>${t.verify === "dyspatch" ? "Confirmed by hand (Dyspatch has no API yet)" : "Checked by API before it can be resolved"}</dd>` : ""}</dl>
  ${L ? `<div class="tsec"><div class="tsec-h">Created from</div><div class="ctk clickable" data-leak="${L.id}" style="cursor:pointer"><strong>${esc(L.kind)} · ${esc(cl(L.client).short)}</strong><div class="small">${esc(L.cause)}</div></div></div>` : ""}
  <div class="tsec"><div class="tsec-h">Timeline</div><ul class="tl">${tl.map(x => `<li class="k-note"><div class="tl-h"><strong>${esc(x.when)}</strong> · ${esc(x.who)}</div><div class="tl-b">${esc(x.text)}</div></li>`).join("") || `<li class="k-in"><div class="tl-h"><strong>${t.age} days ago</strong> task created</div><div class="tl-b">Assigned to ${esc(t.owner)}</div></li>`}</ul></div>
  <div class="row">${t.st !== "done" ? `<button class="btn primary" data-done="${t.id}">${t.verify && t.verify !== "dyspatch" ? "Resolve (check by API)" : t.verify === "dyspatch" ? "Confirm by hand" : "Resolve"}</button>` : `<button class="btn" data-reopen="${t.id}">Re-open</button>`}</div>`;
}
function resolveTask(id) {
  const t = TASKS.find(x => x.id === id);
  if (t.verify && t.verify !== "dyspatch" && !t.passNext) {
    t.st = "snoozed"; t.wake = "24/10/2026 " + nowStr().slice(11); t.passNext = true;
    logX("task|" + id, `API check failed: ${t.co} not found in ${t.where}. Snoozed 24 h; re-checked at the next sync.`, "System");
    toast(`Check failed: not found in ${t.where}. Snoozed 24 h, re-checked at the next sync.`); return;
  }
  t.st = "done"; logX("task|" + id, t.verify && t.verify !== "dyspatch" ? "Confirmed by API · resolved" : t.verify === "dyspatch" ? "Confirmed by hand · resolved" : "Resolved");
  toast(t.verify && t.verify !== "dyspatch" ? "Confirmed by API. Task resolved." : "Task resolved.");
}
function runSync() { TASKS.filter(t => t.st === "snoozed" && t.passNext).forEach(t => { t.st = "done"; logX("task|" + t.id, `Re-checked at sync: found in ${t.where} · closed automatically`, "System"); }); toast("Sync done. Snoozed checks re-run."); }
function finHTML(id) {
  const how = { DSCR: "Cash available for debt service (EBITDA − tax − capex) ÷ loan repayments + interest, last 12 months", "Interest cover": "EBITDA ÷ interest", "Debt / EBITDA": "Total borrowings ÷ EBITDA (12 months)", "Current ratio": "Current assets ÷ current liabilities", "Debtor days": "Receivables ÷ average daily sales", "Creditor days": "Payables ÷ average daily purchases" }[id] || "From the Xero P&L (financial year July–June)";
  return `<h3>${esc(id)}</h3><div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">${esc(how)}</div></div><div class="tsec"><div class="tsec-h">Source</div><div class="small">Xero reports (P&L, balance sheet, aged receivables / payables), read-only. Demo figures.</div></div>`;
}

/* ===== Email / PDF (with costing variant + External finance) ===== */
let LENDERS = [{ name: "Business banker (bank)", email: "banker@example-bank.com.au" }, { name: "External accountant", email: "partner@example-accountants.com.au" }];
function shareHTML() {
  const r = SHARE.r, opt = (o) => `<option value="${esc(o.e)}" ${o.ok ? "" : "disabled"}>${esc(o.n)} — ${esc(o.e)}${o.ok ? "" : " (" + o.why + ")"}</option>`;
  const intl = INTERNAL.people.map(p => ({ e: p.email, n: p.name, ok: r.cls !== "External finance", why: "bank pack goes to lenders & advisers only" }));
  const cli = CCON.flatMap(c => c.contacts.map(k => ({ e: k.email, n: k.name + " · " + cl(c.client).short, ok: r.cls === "Client-safe" && r.client === c.client, why: r.cls === "Client-safe" ? "other client" : "not a client report" })));
  const len = LENDERS.map(l => ({ e: l.email, n: l.name, ok: r.cls === "External finance", why: "only External finance reports" }));
  return `<h3>Email / PDF · ${esc(r.name)}</h3>
  <dl class="dl"><dt>Report type</dt><dd><span class="pill ${r.cls === "Internal" ? "p-purple" : r.cls === "Client-safe" ? "p-green" : "p-blue"}">${r.cls}</span></dd><dt>Sent from</dt><dd>FA Accounts mailbox via Front</dd></dl>
  ${SHARE.costing ? `<div class="tsec"><div class="tsec-h">Costing views in the file</div><div class="seg">${[["T", "TDABC only"], ["F", "Full absorption only"], ["B", "Both"]].map(([k, l]) => `<button data-shvar="${k}" aria-pressed="${SHARE.vsel === k}">${l}</button>`).join("")}</div><p class="meta" style="margin:6px 0 0">The view you leave out is not in the file at all: no card, chart, Unused capacity line or mention in the AI summary.</p></div>` : ""}
  <div class="tsec"><div class="tsec-h">Recipients · only from Contacts & recipients</div><div class="chips">${SHARE.to.map(e => `<span class="chip">${esc(e)}<button data-rmto="${esc(e)}" aria-label="Remove">×</button></span>`).join("") || '<span class="meta">none yet</span>'}</div>
    <div class="row" style="margin-top:8px"><select id="sh-to" aria-label="Add recipient" style="max-width:100%"><option value="">Add recipient…</option><optgroup label="Internal">${intl.map(opt).join("")}</optgroup><optgroup label="Clients">${cli.map(opt).join("")}</optgroup><optgroup label="Lenders & advisers">${len.map(opt).join("")}</optgroup></select><button class="btn" data-act="addto">Add</button></div></div>
  <div class="tsec"><div class="tsec-h">Send once</div><div class="row"><button class="btn primary" data-act="sendnow">Send PDF now</button><button class="btn" data-act="pdfprev">Preview PDF</button></div></div>
  ${r.cls !== "External finance" ? `<div class="tsec"><div class="tsec-h">Schedule</div><div class="row"><label class="small"><input type="checkbox" id="sh-on" ${r.on ? "checked" : ""}> On</label><select id="sh-f" aria-label="Frequency"><option>Weekly · Monday 7:30</option><option>Monthly · 1st business day</option><option>Quarterly · 5th business day</option></select><select id="sh-m" aria-label="Mode"><option>Dry run (to Asal only)</option><option>Draft in Front for review</option><option>Send automatically</option></select><button class="btn" data-act="savesched">Save schedule</button></div></div>` : '<p class="meta">External finance reports are sent one at a time, after approval.</p>'}
  <div class="callout">Before every send: recipients re-checked, and the PDF scanned for costs, margins, other clients' names${SHARE.costing ? " and the costing view you left out" : ""}. If anything is found, the send is blocked and a task is created.</div>`;
}
function shareDrawer(id) {
  const base = id === "kpi" ? { id, name: sub + " KPIs", cls: "Internal", on: false } : id === "bank" ? { id, name: "Bank pack", cls: "External finance", on: false }
    : id === "page" ? { id, name: PAGES[cur].label + (sub && sub !== "Overview" ? " · " + sub : ""), cls: "Internal", on: false } : REPORTS.find(x => x.id === id);
  SHARE = { id, r: base, to: [], costing: id === "page" && cur === "cost", vsel: "B" };
  drawer(() => shareHTML());
}

/* ===== extra handlers (called from the main click / change handlers) ===== */
function extraClick(e, t, d) {
  if (d.bsel) { BSEL = BSEL === d.bsel ? null : d.bsel; render(); return true; }
  if (d.btab) { btab = d.btab; render(); return true; }
  if (d.var) { VAR = d.var; render(); renderStack(); return true; }
  if (d.logs) { e.stopPropagation(); drawer(() => logsHTML(d.logs)); return true; }
  if (d.xlogs) { e.stopPropagation(); const [a, b, ...n] = d.xlogs.split("|"); drawer(() => rowLogsHTML(a + "|" + b, n.join("|"))); return true; }
  if (t.id === "perbtn") { perOpen = !perOpen; render(); return true; }
  if (d.perpick) { const p = PERIODS.find(x => x[0] === d.perpick); setPeriod(p[0], p[1], p[2]); return true; }
  if (t.id === "bell") { drawer(() => notifHTML()); return true; }
  if (d.addnotif) { drawer(() => addNotifHTML(d.addnotif)); return true; }
  if (d.dismiss) { NOTIFS = NOTIFS.filter(n => n.id !== d.dismiss); render(); renderStack(); return true; }
  if (d.savenotif) {
    const n = NOTIFS.find(x => x.id === d.savenotif);
    if (n.kind === "staff") { const s = saveStaffFromForm(true); toast(`${s.name} added. Follow-up task: set up in Xero Payroll.`); }
    if (n.kind === "client") { const nm = $("#nc-n").value; CLIENTS_EXTRA.push({ name: nm, site: SITES[$("#nc-s").value], type: $("#nc-t").value, st: $("#nc-st").value, cmc: null, ids: "Dyspatch ✓ · Xero — · Thomax —" });
      addTask({ pr: "High", topic: "Set up", co: nm, where: "Xero", what: `Create ${nm} as a contact in Xero`, why: "Client is in Dyspatch but not in Xero", owner: "David", verify: "xero-contact" });
      addTask({ pr: "Medium", topic: "Set up", co: nm, where: "WMS", what: `Set up ${nm} as a tenant in the WMS`, why: "Client is in Dyspatch but has no WMS tenant", owner: "Paul", verify: "wms" }); toast(`${nm} added. Two follow-up tasks created.`); }
    if (n.kind === "supplier") { SUPPLIERS.push({ name: $("#ns-n").value, pool: $("#ns-p").value, site: "both", fv: $("#ns-f").value, rebill: $("#ns-r").value === "1", exp: 0, xero: "new" }); toast("Supplier added to Settings → Suppliers."); }
    NOTIFS = NOTIFS.filter(x => x.id !== n.id); closeAll(); render(); return true;
  }
  if (d.imp) { drawer(() => impHTML(d.imp)); return true; }
  if (d.impact) { const [a, id] = d.impact.split("|"), i = IMPS.find(x => x.id === id);
    if (a === "approve") { i.status = "Approved"; i.start = nowStr().slice(0, 10); const steps = STEP_TPL[i.cat] || STEP_TPL.Workflow; i.project = { people: suggestPeople(i), steps: steps.map((s, k) => [s, k === 0 ? "Asal" : k < 3 ? "Asal" : "Neil", "", "", "todo"]) };
      i.project.steps.forEach((s, k) => { const d0 = new Date(2026, 9, 26 + k * 7), d1 = new Date(2026, 9, 30 + k * 7), f = (x) => String(x.getDate()).padStart(2, "0") + "/" + String(x.getMonth() + 1).padStart(2, "0"); s[2] = f(d0); s[3] = f(d1); });
      addTask({ pr: "Medium", topic: "Improvement", co: "FA", where: "Floor", what: `${i.name}: ${i.project.steps[0][0]}`, why: "First project step", owner: i.project.steps[0][1] });
      logX("imp|" + id, "Approved · project created with " + i.project.steps.length + " steps (suggested by Claude)"); toast("Approved. Project steps and people suggested; edit freely."); }
    if (a === "park") { i.status = "Parked"; logX("imp|" + id, "Parked"); }
    if (a === "reject") { i.status = "Rejected"; logX("imp|" + id, "Rejected"); }
    if (a === "verify") { i.status = "Verified"; logX("imp|" + id, "Verified with measured data"); toast("Marked verified."); }
    render(); renderStack(); return true; }
  if (d.rmppl) { const [id, pid] = d.rmppl.split("|"), i = IMPS.find(x => x.id === id); i.project.people = i.project.people.filter(p => p !== pid); logX("imp|" + id, "Removed " + stf(pid).name); renderStack(); return true; }
  if (d.addppl) { const i = IMPS.find(x => x.id === d.addppl), v = $("#addppl").value; if (v && !i.project.people.includes(v)) { i.project.people.push(v); logX("imp|" + i.id, "Added " + stf(v).name); } renderStack(); return true; }
  if (d.icat) { icat = d.icat; render(); return true; }
  if (d.msite) { MSITE = d.msite; render(); return true; }
  if (d.shvar) { SHARE.vsel = d.shvar; renderStack(); return true; }
  if (d.act === "perapply") { const f = $("#pf").value, to = $("#pt").value; PCMP = $("#pc").value; PFROM = f; PTO = to; const days = Math.max(1, (new Date(to) - new Date(f)) / 864e5 + 1); setPeriod("Custom", days / 30.4, fmtD(f) + " – " + fmtD(to)); return true; }
  if (d.act === "perclose") { perOpen = false; render(); return true; }
  if (d.act === "newidea") { NEWIDEA = { name: "", desc: "", cat: "", subcat: "", detail: "", changes: [], asked: false }; drawer(() => newIdeaHTML()); return true; }
  if (d.act === "askclaude") { NEWIDEA.name = $("#ni-n").value; NEWIDEA.desc = $("#ni-d").value; NEWIDEA.asked = true; renderStack(); return true; }
  if (d.act === "saveidea") { NEWIDEA.name = $("#ni-n").value.trim() || "New idea"; NEWIDEA.desc = $("#ni-d").value; const est = +($("#ni-e")?.value || 0);
    const i = { id: "i" + Date.now(), ...NEWIDEA, status: "Idea", type: NEWIDEA.changes.includes("People & rosters") ? "Hard saving" : "Hard saving", owner: "Asal", start: "", blocks: [], est };
    IMPS.push(i); logX("imp|" + i.id, "Idea created with Claude's proposed calculation"); closeAll(); go("improve", "Ideas"); toast("Idea saved."); return true; }
  if (d.act === "newstaff") { drawer(() => `<h3>New staff member</h3>${staffForm()}<div class="row"><button class="btn primary" data-act="savestaff">Save</button></div>`); return true; }
  if (d.act === "savestaff") { const s = saveStaffFromForm(false); closeAll(); render(); toast(`${s.name} added${s.xero ? "" : ". Task created: set up in Xero Payroll"}.`); return true; }
  if (d.act === "reqapprove") { APPROVAL = APPROVAL === "Waiting for Mark" ? "Approved by Mark" : "Waiting for Mark"; render(); toast(APPROVAL === "Waiting for Mark" ? "Approval requested from Mark (demo: click again to simulate his approval)." : "Approved by Mark."); return true; }
  if (d.act === "runsync") { runSync(); render(); return true; }
  return false;
}
function extraChange(el, d) {
  if (d.set) { setVal(d.set, parseFloat(el.value)); return true; }
  if (d.alloc) { const [sid, cid] = d.alloc.split("|"), s = stf(sid), v = Math.max(0, Math.min(100, parseFloat(el.value) || 0)), before = s.alloc[cid] || 0;
    const tot = pctSum(s) - before + v; if (tot > 100) { toast(`${s.name} would be at ${tot}%. A person can't go over 100%.`); el.value = before; return true; }
    if (v) s.alloc[cid] = v; else delete s.alloc[cid]; s.src = "manual"; logX("staff|" + sid, `${cl(cid).short}: ${before}% → ${v}%`); render(); renderStack(); toast("Allocation saved and synced."); return true; }
  if (d.ni) { NEWIDEA[d.ni] = el.value; if (d.ni === "cat") { NEWIDEA.subcat = ""; NEWIDEA.detail = ""; } if (d.ni === "subcat") NEWIDEA.detail = ""; NEWIDEA.name = $("#ni-n")?.value ?? NEWIDEA.name; NEWIDEA.desc = $("#ni-d")?.value ?? NEWIDEA.desc; NEWIDEA.asked = false; renderStack(); return true; }
  if (d.nich) { const c = d.nich; NEWIDEA.changes = el.checked ? [...NEWIDEA.changes, c] : NEWIDEA.changes.filter(x => x !== c); NEWIDEA.name = $("#ni-n").value; NEWIDEA.desc = $("#ni-d").value; NEWIDEA.asked = false; renderStack(); return true; }
  if (d.step) { const [id, k] = d.step.split("|"), i = IMPS.find(x => x.id === id); i.project.steps[+k][4] = el.value; if (i.status === "Approved" && el.value !== "todo") i.status = "In progress"; if (i.project.steps.every(s => s[4] === "done")) i.status = "Done"; logX("imp|" + id, `${i.project.steps[+k][0]} → ${el.selectedOptions[0].text}`); render(); renderStack(); return true; }
  if (d.supfv) { SUPPLIERS[+d.supfv].fv = el.value; toast("Saved. Break-even uses this split."); return true; }
  if (d.pack) { PACK[d.pack] = el.checked; return true; }
  if (el.id === "shownames") { showNames = el.checked; render(); return true; }
  if (el.id === "fc") { FC = el.checked; render(); return true; }
  return false;
}

/* ================= PAGES ================= */
function withSub(body) {
  const p = PAGES[cur];
  if (cur === "reports") p.subs = [...REPORTS.map(r => r.name), "+ New report"];
  if (!p.subs.length) return `<div class="nosub">${body}</div>`;
  return `<div class="withsub"><nav class="subnav">${p.subs.map(s => `<button data-sub="${s}" aria-current="${s === sub}">${s}</button>`).join("")}</nav><div class="subbody">${body}</div></div>`;
}
const show = (name) => sub === name;

let ovSel = null;
const MON12 = ["Oct 25", "Nov", "Dec", "Jan 26", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const FA = { orders12: [86400, 91200, 104800, 82100, 84900, 90300, 92600, 95100, 93800, 94700, 96200, 98000], casualShare: 0.25, revPerOrder: 6.95 };
function breakeven(M) {
  const P = M.pools, floor = P.floor_smi.total + P.floor_par.total;
  const variable = S.casualShare * floor + FA.orders12[11] * (S.b2cCmcShare * S.matCmc + (1 - S.b2cCmcShare) * S.matMan);
  const fixed = (1 - S.casualShare) * floor + P.csr.total + S.rent_smi + S.cmcCost + OVH.reduce((a, o) => a + o.amount, 0);
  const orders = FA.orders12[11], varPerOrder = variable / orders, contrib = FA.revPerOrder - varPerOrder, be = fixed / contrib;
  return { fixed, variable, orders, varPerOrder, contrib, be, safety: (orders - be) / orders };
}
function pOverview(M) {
  const leakTot = LEAK.reduce((a, L) => a + leakAmount(L, M), 0), rec = LEAK.filter(L => L.status === "Recovered").reduce((a, L) => a + (L.recovered || 0), 0);
  const rev = M.clients.reduce((a, c) => a + c.revenue, 0), cost = M.clients.reduce((a, c) => a + c.cost, 0), mg = (rev - cost) / rev;
  const below = []; M.clients.forEach(c => c.lines.forEach(l => { if (l.marginPct != null && l.marginPct < 0) below.push({ c, l }); }));
  below.sort((a, b) => a.l.unitMargin * a.l.vol - b.l.unitMargin * b.l.vol);
  const sub$ = -below.reduce((a, b) => a + b.l.unitMargin * b.l.vol, 0);
  const o = FA.orders12, oChg = (o[11] - o[10]) / o[10], be = breakeven(M);
  const mTrend = [15.3, 15.0, 16.1, 13.9, 14.2, 14.8, 15.2, 15.6, 14.4, 13.6, 12.9, Math.round(mg * 1000) / 10];
  const tiles = [
    ["margin", "Services margin · " + (VAR === "T" ? "TDABC" : "Full"), pct(mg), `floor ${pct(RULES.floor, 0)} · ▼ ${(12.9 - mg * 100).toFixed(1)} pts vs Aug`, mg < RULES.floor ? "amber" : ""],
    ["leak", "Leakage found", m0(leakTot), `a month · ${LEAK.filter(L => L.status === "Open").length} open · ${m0(rec)} recovered`, ""],
    ["below", "Priced below cost", m0(sub$), `a month · ${below.length} service lines`, "red"],
    ["orders", "Orders", num(o[11]), `${MONTH} · ${oChg >= 0 ? "▲" : "▼"} ${pct(Math.abs(oChg))} vs Aug`, ""],
    ["be", "Break-even", num(Math.round(be.be / 100) * 100) + " orders", `a month · now ${num(be.orders)} · ${pct(be.safety, 0)} above`, be.safety < 0.1 ? "amber" : "green"]
  ];
  const showB = (k) => !ovSel || ovSel === k;
  const wl = workload("Week");
  let h = `<div class="ph"><div><h1>Good evening, Asal</h1><p>${MONTH} · click a card to see only its detail; click it again to see all</p></div></div>
  <div class="kpis tabtiles ovtiles">${tiles.map(t => `<button class="kpi ${t[4]}" data-ov="${t[0]}" aria-pressed="${ovSel === t[0]}"><div class="l">${t[1]}</div><div class="v">${t[2]}</div><div class="s">${t[3]}</div></button>`).join("")}</div>`;
  if (showB("margin")) h += `<div class="grid2"><div class="card"><h2>Services margin · 12 months</h2><p class="sub">Processing services, cost model method. Dashed: ${pct(RULES.floor, 0)} floor and the FY25-26 "before" average.</p>${lineChart([{ v: mTrend, c: "var(--blue)", area: true }], { labels: MON12, fmt: v => v.toFixed(1) + "%", min: 10, max: 18, fc: fcast(mTrend, 6, 1.0), lines: [{ v: RULES.floor * 100, c: "var(--amber)", t: "Floor 15%" }, { v: REPORT.baseline, c: "var(--header)", t: "Before " + REPORT.baseline + "%" }], aria: "Services margin by month" })}</div>
    <div class="card"><h2>Margin by client</h2><p class="sub">${MONTH}. Worst first. Click a client for the breakdown.</p><div class="tw"><table><tbody>${M.clients.slice().sort((a, b) => a.marginPct - b.marginPct).map(c => `<tr class="clickable" data-client="${c.id}"><td class="sup">${esc(c.short)}</td><td style="width:60%">${mbar(c.marginPct)}</td><td class="r num">${m0(c.margin)}</td></tr>`).join("")}</tbody></table></div></div></div>`;
  if (showB("leak")) h += `<div class="card"><h2>Leakage · open items</h2><p class="sub">Should have billed (CLM rate × WMS volume) vs billed in Xero. Leakage log started 29/09/2026, so there is no earlier trend yet.</p><div class="tw"><table><thead><tr><th>Client</th><th>Service</th><th class="r">Gap / month</th><th>Status</th></tr></thead><tbody>
    ${LEAK.slice().sort((a, b) => leakAmount(b, M) - leakAmount(a, M)).map(L => `<tr class="clickable" data-leak="${L.id}"><td class="sup">${esc(cl(L.client).short)}</td><td>${L.code === "WK-MIN" ? "Weekly minimum" : esc(C(L.code).name)}<div class="meta">${esc(L.kind)}</div></td><td class="r num">${money(leakAmount(L, M))}</td><td>${stPill(L.status)}</td></tr>`).join("")}</tbody></table></div></div>`;
  if (showB("below")) h += `<div class="card alert"><h2>Priced below cost</h2><p class="sub">Contract rate lower than our cost per unit. Fixed through a rate review.</p><div class="tw"><table><thead><tr><th>Client</th><th>Service</th><th class="r">Rate</th><th class="r">Cost</th><th class="r">$ / month</th><th></th></tr></thead><tbody>
    ${below.slice(0, 8).map(({ c, l }) => `<tr class="clickable" data-row="line|${c.id}|${l.code}"><td class="sup">${esc(c.short)}</td><td>${esc(l.s.name)}</td><td class="r num">${money(l.rate)}</td><td class="r num">${money(l.unitCost)}</td><td class="r num" style="color:var(--red)">${money(l.unitMargin * l.vol)}</td><td><button class="lnk" data-review="${c.id}">Rate review</button></td></tr>`).join("")}</tbody></table></div></div>`;
  if (showB("orders")) h += `<div class="grid2"><div class="card"><h2>Orders · 12 months</h2><p class="sub">All clients, from the WMS. December peak is seasonal.</p>${barChart(o, MON12, { fmt: v => Math.round(v / 1000) + "k", fc: fcast(o), aria: "Orders by month" })}</div>
    <div class="card"><h2>This week vs last week</h2><p class="sub">Biggest growth and drops by client.</p><div class="tw"><table><tbody>${wl.slice().sort((a, b) => b.chg - a.chg).filter((x, i, a) => i < 3 || i >= a.length - 3).map(x => `<tr class="clickable" data-row="wl|r1|${x.c.id}"><td class="sup">${esc(x.c.short)}</td><td class="r num">${num(x.orders)}</td><td class="r num ${x.chg >= 0 ? "delta-pos" : "delta-neg"}">${x.chg >= 0 ? "▲" : "▼"} ${pct(Math.abs(x.chg))}</td></tr>`).join("")}</tbody></table></div></div></div>`;
  if (showB("be")) h += `<div class="grid2"><div class="card"><h2>Break-even · orders per month</h2><p class="sub">Orders needed to cover fixed costs, vs actual. Dashed line = break-even for ${MONTH} costs.</p>${lineChart([{ v: o, c: "var(--blue)", area: true }], { labels: MON12, fmt: v => Math.round(v / 1000) + "k", min: 60000, max: 120000, fc: fcast(o), lines: [{ v: be.be, c: "var(--red)", t: "Break-even " + num(Math.round(be.be / 100) * 100) }], aria: "Orders vs break-even" })}</div>
    <div class="card"><h2>How break-even is calculated</h2><div class="formula">Fixed costs a month = ${m0(be.fixed)}<br>(permanent floor staff, CSR, Smithfield rent, CMC, machinery, software, admin · Xero, not notional rent)<br>Variable cost per order = ${money(be.varPerOrder)}<br>(packaging materials + casual labour share ${pct(S.casualShare, 0)})<br>Average revenue per order = ${money(FA.revPerOrder)}<br>Contribution per order = ${money(be.contrib)}<br><strong>Break-even = ${m0(be.fixed)} ÷ ${money(be.contrib)} = ${num(Math.round(be.be))} orders</strong><br>Actual ${num(be.orders)} → ${pct(be.safety, 1)} safety margin</div>
    <p class="meta" style="margin:10px 0 0">Which costs count as fixed or variable is set in Settings → Rules (to confirm with Mark). Revenue per order and costs come from Xero; orders from the WMS. Postage is excluded.</p></div></div>`;
  // needs attention
  const att = [];
  LEAK.filter(L => L.status === "Open").forEach(L => att.push({ pr: 1, t: `Leakage · ${cl(L.client).short}`, d: `${money(leakAmount(L, M))} / month · ${L.cause}`, a: `data-leak="${L.id}"` }));
  TASKS.filter(t => t.st === "open" && t.age >= 7).forEach(t => att.push({ pr: 2, t: `Task open ${t.age} days · ${t.co}`, d: t.what, a: `data-task="${t.id}"` }));
  M.clients.filter(c => (toDate(c.renew) - new Date(2026, 9, 23)) / 864e5 <= 60).forEach(c => att.push({ pr: 1, t: `Renewal ${c.renew} · ${c.short}`, d: `margin ${pct(c.marginPct)} · ${c.review || "no rate review started"}`, a: `data-client="${c.id}"` }));
  h += `<div class="card"><h2>Needs attention</h2><p class="sub">Click a line to open it.</p><div class="tw"><table><tbody>${att.sort((a, b) => a.pr - b.pr).map(x => `<tr class="clickable" ${x.a}><td style="width:8px"><span class="dot ${x.pr === 1 ? "red" : "amber"}"></span></td><td class="sup">${esc(x.t)}<div class="meta">${esc(x.d)}</div></td></tr>`).join("")}</tbody></table></div></div>
  <div class="card"><h2>Renewals and reviews coming up</h2><p class="sub">From CLM (contract dates) joined with margin from this app.</p><div class="tw"><table><thead><tr><th>Client</th><th>Renewal</th><th>Margin</th><th>Review</th><th></th></tr></thead><tbody>
    ${M.clients.slice().sort((a, b) => toDate(a.renew) - toDate(b.renew)).slice(0, 5).map(c => `<tr class="clickable" data-client="${c.id}"><td class="sup">${esc(c.name)}</td><td class="num">${c.renew}</td><td>${mbar(c.marginPct)}</td><td class="meta">${esc(c.review || "Not started")}</td><td><button class="lnk" data-review="${c.id}">Rate review</button></td></tr>`).join("")}
  </tbody></table></div></div>`;
  return h;
}
const toDate = (s) => { const [d, m, y] = s.split("/"); return new Date(+y, m - 1, +d); };


function pLeakage(M) {
  if (sub === "Overview") return pLeakOverview(M);
  let h = "";
  const ub = LEAK.filter(L => L.kind === "Under-billing"), tot = LEAK.reduce((a, L) => a + leakAmount(L, M), 0);
  const rec = LEAK.filter(L => L.status === "Recovered").reduce((a, L) => a + (L.recovered || 0), 0);
  if (sub === "Overview") h += `<div class="kpis">
    <div class="kpi"><div class="l">Found · ${MONTH}</div><div class="v">${m0(tot)}</div><div class="s">per month while it stays unfixed</div></div>
    <div class="kpi green"><div class="l">Recovered so far</div><div class="v">${m0(rec)}</div><div class="s">billed by hand in Xero</div></div>
    <div class="kpi red"><div class="l">Open</div><div class="v">${LEAK.filter(L => L.status === "Open").length}</div><div class="s">need a decision</div></div>
    <div class="kpi"><div class="l">Tolerance</div><div class="v">${money(RULES.tolerance, 0)}</div><div class="s">gaps below this are ignored</div></div></div>
    <div class="callout">This app never changes Xero, Dyspatch or the WMS. Each check shows <strong>match</strong> or <strong>don't match</strong>. A person decides, and a task is created to fix the other system by hand.</div>`;
  if (show("Under-billing")) {
    h += `<div class="card"><h2>Under-billing · ${MONTH}</h2><p class="sub">Should have billed = CLM rate × WMS volume (Thomax export). Billed = Xero invoice lines. Click a line for the working.</p><div class="tw"><table><thead><tr><th>Client</th><th>Service</th><th class="r">WMS volume</th><th class="r">Should bill</th><th class="r">Billed</th><th class="r">Gap</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${ub.map(L => { const c = M.clients.find(x => x.id === L.client); const l = c.lines.find(x => x.code === L.code);
      const exp = l ? l.expected : null, bil = l ? l.billed : null;
      return `<tr class="clickable" data-leak="${L.id}"><td class="sup">${esc(c.short)}</td><td>${L.code === "WK-MIN" ? "Weekly minimum top-up" : esc(l.s.name)}<div class="meta">${esc(L.cause)}</div></td><td class="r num">${l ? num(l.vol) : "3 weeks"}</td><td class="r num">${l ? money(exp) : money(900)}</td><td class="r num">${l ? money(bil) : money(490)}</td><td class="r num" style="color:var(--red)">${money(leakAmount(L, M))}</td><td>${stPill(L.status)}</td><td class="actions">${leakActions(L)}</td></tr>`; }).join("")}
    </tbody></table></div></div>`;
  }
  if (show("Under-pricing")) {
    const rows = []; M.clients.forEach(c => c.lines.forEach(l => { if (l.marginPct != null && l.marginPct < 0) rows.push({ c, l }); }));
    rows.sort((a, b) => a.l.unitMargin * a.l.vol - b.l.unitMargin * b.l.vol);
    h += `<div class="card alert"><h2>Under-pricing · rate below cost</h2><p class="sub">Billed correctly, but the rate itself loses money. Fixed through a rate review, not an invoice.</p><div class="tw"><table><thead><tr><th>Client</th><th>Service</th><th class="r">Rate</th><th class="r">Cost / unit</th><th class="r">Volume</th><th class="r">Loss / month</th><th></th></tr></thead><tbody>
    ${rows.map(({ c, l }) => `<tr class="clickable" data-client="${c.id}"><td class="sup">${esc(c.short)}</td><td>${esc(l.s.name)}</td><td class="r num">${money(l.rate)}</td><td class="r num">${money(l.unitCost)}</td><td class="r num">${num(l.vol)}</td><td class="r num" style="color:var(--red)">${money(l.unitMargin * l.vol)}</td><td><button class="lnk" data-review="${c.id}">Rate review</button></td></tr>`).join("")}
    <tr class="tot"><td colspan="5">Total subsidised a month</td><td class="r num" style="color:var(--red)">${money(rows.reduce((a, r) => a + r.l.unitMargin * r.l.vol, 0))}</td><td></td></tr>
    </tbody></table></div></div>`;
  }
  if (show("Rate checks")) {
    const rows = [];
    CLIENTS.forEach(c => BILLABLE.forEach(code => {
      const k = c.id + "|" + code, dy = DYSPATCH_RATE[k], wm = WMS_RATE[k], clm = c.rates[code];
      if (dy != null || wm != null) rows.push({ c, code, clm, dy: dy != null ? money(dy) : money(clm), wm: wm || money(clm), ok: false });
    }));
    h += `<div class="card"><h2>Rate checks · CLM vs Dyspatch vs WMS</h2><p class="sub">CLM is the master for client prices. Only mismatches are listed; ${CLIENTS.length * BILLABLE.length - rows.length} other rates match. Sometimes Dyspatch holds the newer, correct price, so a person decides.</p><div class="tw"><table><thead><tr><th>Client</th><th>Service</th><th class="r">CLM</th><th class="r">Dyspatch</th><th class="r">WMS</th><th>Result</th><th>Actions</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="clickable" data-row="rc|${r.c.id}|${r.code}"><td class="sup">${esc(r.c.short)}</td><td>${esc(C(r.code).name)}</td><td class="r num">${money(r.clm)}</td><td class="r num">${r.dy}</td><td class="r num">${esc(r.wm)}</td><td><span class="pill p-red">don't match</span></td><td class="actions"><button class="lnk" data-act="clmupd" data-c="${r.c.short}">CLM is wrong · update CLM</button><button class="lnk" data-act="extask" data-c="${r.c.short}">Other system is wrong · create task</button></td></tr>`).join("")}
    </tbody></table></div></div>`;
  }
  if (show("Leakage log")) {
    h += `<div class="card"><h2>Leakage log</h2><p class="sub">Running record of findings since 29/09/2026. Replaces FA_Leakage_Log.xlsx once imported.</p><div class="tw"><table><thead><tr><th>Found</th><th>Client</th><th>Type</th><th>Cause</th><th class="r">$ / month</th><th>Status</th><th>Fixed by</th></tr></thead><tbody>
    ${LEAK.map(L => `<tr class="clickable" data-leak="${L.id}"><td class="num">${esc(L.month)}</td><td class="sup">${esc(cl(L.client).short)}</td><td>${esc(L.kind)}</td><td class="meta">${esc(L.cause)}</td><td class="r num">${money(leakAmount(L, M))}</td><td>${stPill(L.status)}</td><td class="meta">${L.inv ? `<a class="ref" href="https://go.xero.com" target="_blank" rel="noopener">${L.inv}</a>` : L.task ? "Task " + L.task : "—"}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  }
  return h;
}
function leakActions(L) {
  if (L.status === "Recovered") return '<span class="meta">done</span>';
  return `<button class="lnk" data-leakact="task" data-id="${L.id}">create task</button><button class="lnk" data-leakact="explain" data-id="${L.id}">explained</button><button class="lnk" data-leakact="rec" data-id="${L.id}">recovered</button>`;
}

function pRates(M) {
  const c = M.clients.find(x => x.id === rateClient);
  const rows = c.lines.filter(l => !l.s.unbilled);
  let curM = 0, newM = 0;
  const tr = rows.map(l => {
    const nr = newRates[c.id + "|" + l.code] ?? l.rate;
    const nm = nr - l.unitT, np = nm / nr;
    curM += (l.rate - l.unitT) * l.avg3; newM += nm * l.avg3;
    return `<tr class="clickable" data-row="line|${c.id}|${l.code}"><td class="sup">${esc(l.s.name)}<div class="meta mono">${l.code} · per ${esc(l.s.unit)}</div></td><td class="r num">${money(l.rate)}</td><td class="r num">${money(l.unitT)}</td><td>${mpill(l.marginPctT)}</td><td class="r num">${num(l.avg3)}</td><td class="r"><label class="lock" for="nr-${l.code}" hidden>New rate</label><input id="nr-${l.code}" class="mini ${nr !== l.rate ? "changed" : ""}" type="number" step="0.05" min="0" value="${nr.toFixed(2)}" data-nr="${l.code}"></td><td>${mpill(np)}</td><td class="r num ${(nm - (l.rate - l.unitT)) > 0 ? "delta-pos" : ""}">${(nm - (l.rate - l.unitT)) ? money((nm - (l.rate - l.unitT)) * l.avg3) : "—"}</td></tr>`;
  }).join("");
  const tickets = c.lines.find(l => l.code === "ACC-MGT");
  return `<div class="ph"><div><h1>Rate review</h1><p>Costs are TDABC (practical capacity). CLM asks this app for each service: current rate, cost, margin and last 3 months' volume. You set new rates; CLM builds the schedule of rates for the amendment.</p></div></div>
  <div class="card"><div class="selrow"><label for="rc" class="small muted">Client</label><select id="rc">${CLIENTS.map(x => `<option value="${x.id}" ${x.id === rateClient ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
    <span class="meta">Renewal ${c.renew} · ${esc(c.review || "no review open")}</span><span style="flex:1"></span>
    <label for="tg" class="small muted">Target margin</label><input id="tg" class="mini" type="number" step="1" min="0" max="60" value="${Math.round(target * 100)}"><span class="small">%</span>
    <button class="btn" data-act="applytarget">Raise lines below target</button><button class="btn" data-act="resetrates">Reset</button></div></div>
  <div class="kpis">
    <div class="kpi"><div class="l">New margin / month</div><div class="v">${m0(newM)}</div><div class="s">on 3-month average volume</div></div>
    <div class="kpi"><div class="l">Current margin / month</div><div class="v">${m0(curM)}</div><div class="s">billable services only</div></div>
    <div class="kpi green"><div class="l">Change / month</div><div class="v">${m0(newM - curM)}</div><div class="s">${m0((newM - curM) * 12)} a year</div></div>
    <div class="kpi"><div class="l">Account management</div><div class="v">${m0(tickets.cost)}</div><div class="s">${tickets.vol} Front tickets a month, not billed</div></div></div>
  <div class="card"><h2>Services · ${esc(c.name)}</h2><p class="sub">Costs are internal and never leave FA. The schedule sent to CLM for the client contains rates only.</p><div class="tw"><table><thead><tr><th>Service</th><th class="r">Current rate</th><th class="r">Cost</th><th>Margin</th><th class="r">3-mo avg volume</th><th class="r">New rate</th><th>New margin</th><th class="r">+ $ / month</th></tr></thead><tbody>${tr}</tbody></table></div>
  <div class="row" style="margin-top:12px"><button class="btn primary" data-act="sendclm">Send schedule of rates to CLM</button><span class="meta">Creates an amendment draft in CLM. Nothing changes in Dyspatch, the WMS or Xero.</span></div></div>`;
}

function chartSVG(points, base) {
  const W = 640, H = 230, L = 40, R = 16, T = 16, B = 30, min = 10, max = 20;
  const x = (i) => L + (i + 0.5) * ((W - L - R) / points.length), y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const bw = (W - L - R) / points.length * 0.56;
  let g = "";
  for (let v = min; v <= max; v += 2) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
  const bars = points.map((p, i) => `<rect x="${x(i) - bw / 2}" y="${y(p.v)}" width="${bw}" height="${y(min) - y(p.v)}" rx="3" fill="${i === points.length - 1 ? "var(--blue)" : "var(--blue-light)"}"/><text x="${x(i)}" y="${y(p.v) - 6}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${p.v.toFixed(1)}%</text><text x="${x(i)}" y="${H - 10}" text-anchor="middle">${p.m}</text>`).join("");
  const bl = `<line x1="${L}" x2="${W - R}" y1="${y(base)}" y2="${y(base)}" stroke="var(--header)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W - R}" y="${y(base) - 6}" text-anchor="end" style="fill:var(--header);font-weight:600">Before: ${base}%</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Services margin by month">${g}${bars}${bl}</svg>`;
}
function pReport(M) {
  const rev = M.clients.reduce((a, c) => a + c.revenue, 0), cost = M.clients.reduce((a, c) => a + c.cost, 0);
  const sep = Math.round((rev - cost) / rev * 1000) / 10;
  const found = LEAK.reduce((a, L) => a + leakAmount(L, M), 0), rec = LEAK.filter(L => L.status === "Recovered").reduce((a, L) => a + (L.recovered || 0), 0);
  const sub0 = []; M.clients.forEach(c => c.lines.forEach(l => { if (l.marginPct != null && l.marginPct < 0) sub0.push(l.unitMargin * l.vol); }));
  return `<div class="ph"><div><h1>Monthly report for Mark</h1><p>Revenue protection · ${MONTH}. Sent as an email on the 5th business day; same look as the Hub digests.</p></div><div class="row"><span class="pill p-amber">Dry run · goes to Asal only</span><button class="btn" data-act="sendtest">Send test to me</button></div></div>
  <dl class="envelope"><dt>From</dt><dd>FA Analytics &lt;accounts@fulfilmentaustralia.com.au&gt;</dd><dt>To</dt><dd>Mark Mina, Marcus Mina · cc Asal</dd><dt>Subject</dt><dd>[DRY RUN] Revenue protection · ${MONTH}</dd></dl>
  <div class="mailwrap"><div class="mail"><div class="mh"><img data-logo="dark" src="${brand.logoDark}" alt="Fulfilment Australia"><span>Revenue protection · ${MONTH}</span></div>
  <div class="mb"><p class="mt">${m0(found)} a month of leakage found; ${m0(rec)} recovered so far</p>
    <div class="mk"><div><div class="l">Recovered (billed)</div><div class="v">${m0(rec)}</div></div><div><div class="l">Leakage found / month</div><div class="v">${m0(found)}</div></div><div><div class="l">Below-cost lines / month</div><div class="v">${m0(-sub0.reduce((a, b) => a + b, 0))}</div></div><div><div class="l">Services margin</div><div class="v">${sep}%</div></div></div>
    <div class="sec blue"><h4>Cash collected faster · shown separately, not profit</h4><div class="small">Debtor days ${REPORT.dsoBefore} → ${REPORT.dsoNow} since the Xero reminders and the 60-day hold rule. About ${m0(REPORT.cashFaster)} came in earlier than it would have. This is timing, not extra income.</div></div>
    <div class="sec"><h4>Services margin vs before</h4><div class="chart">${chartSVG([...REPORT.marginTrend, { m: "Sep", v: sep }], REPORT.baseline)}</div><div class="small muted">"Before" = FY25-26 monthly average from Xero history, same cost method.</div></div>
    <div class="sec red"><h4>Leakage found</h4><table><thead><tr><th>Client</th><th>What</th><th class="r">$ / month</th><th>Status</th></tr></thead><tbody>${LEAK.map(L => `<tr><td>${esc(cl(L.client).short)}</td><td>${esc(L.cause)}</td><td class="r num">${money(leakAmount(L, M))}</td><td>${stPill(L.status)}</td></tr>`).join("")}</tbody></table></div>
    <div class="sec amber"><h4>Rate reviews</h4><div class="small">MWU review in progress: order fee, pallet receiving and returns are below cost. 11MODE renews 15/12/2026; Sony Music 31/12/2026.</div></div>
  </div><div class="mf">Internal: contains FA costs and margins. Do not forward to clients. Generated by FA Analytics; figures link to the app.</div></div></div>`;
}


function pTasks() {
  const list = TASKS.filter(t => sub === "Done" ? t.st === "done" : sub === "Snoozed" ? t.st === "snoozed" : t.st === "open");
  return `<div class="card"><h2>${esc(sub)}</h2><p class="sub">${sub === "Snoozed" ? "Tasks waiting for an API re-check at the next sync (or until their wake-up time)." : "Fixes done by hand in other systems, set-up steps and improvement project steps. Tasks linked to a system are checked by API before they can be resolved."} Click a line for details.</p>
  ${sub === "Snoozed" ? '<div class="row" style="margin-bottom:10px"><button class="btn" data-act="runsync">Run sync now</button></div>' : ""}
  <div class="tw"><table><thead><tr><th>Priority</th><th>Topic</th><th>Company / person</th><th>What to do</th><th>Check</th><th class="r">Age</th><th>Owner</th><th>Actions</th></tr></thead><tbody>
  ${list.map(t => `<tr class="clickable" data-task="${t.id}"><td><span class="pill ${t.pr === "High" ? "p-red" : t.pr === "Medium" ? "p-amber" : "p-grey"}">${t.pr}</span></td><td>${esc(t.topic)}</td><td class="sup">${esc(t.co)}<div class="meta">Fix in ${esc(t.where)}</div></td><td>${esc(t.what)}<div class="meta">${esc(t.why)}${t.st === "snoozed" ? " · wakes " + esc(t.wake) : ""}</div></td><td class="meta">${t.verify ? (t.verify === "dyspatch" ? "by hand" : "API") : "—"}</td><td class="r num">${t.age}d</td><td>${esc(t.owner)}</td><td class="actions">${t.st !== "done" ? `<button class="lnk" data-done="${t.id}">resolve</button>` : `<button class="lnk" data-reopen="${t.id}">re-open</button>`}</td></tr>`).join("") || '<tr><td colspan="8" class="empty">Nothing here.</td></tr>'}
  </tbody></table></div></div>`;
}

function pData() {
  const tiles = [
    ["wms", "WMS · volumes", "3 systems", "Thomax · 3PLWMS · Logiwa"],
    ["xero", "Accounting · Xero", "Read-only, everything", "Ledger · reports · payroll · files"],
    ["front", "Client service · Front", "Read-only", "Emails · tickets · files"],
    ["rates", "Contracts & rates", "CLM master", "CLM · Dyspatch export"],
    ["ai", "AI · Claude", "Reads files", "Invoices · attachments"]
  ];
  let h = `<div class="ph"><div><h1>Data sources</h1><p>Everything this app reads. It only reads; nothing is ever written back. History is stored in the app's own database, so it stays after a system is switched off.</p></div></div>
  <div class="kpis tabtiles">${tiles.map(t => `<button class="kpi" data-ds="${t[0]}" aria-pressed="${dsTab === t[0]}"><div class="l">${t[1]}</div><div class="v" style="font-size:18px">${t[2]}</div><div class="s">${t[3]}</div></button>`).join("")}</div>`;
  if (dsTab === "wms") {
    const done = DS.pulled;
    const yrs = [2021, 2022, 2023, 2024, 2025, 2026, 2027];
    const ml = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
    let idx = 0;
    const grid = yrs.map(y => `<div class="ygrid"><span class="yl">${y}</span>${ml.map((m, i) => {
      const inRange = (y > 2021 || i >= DS.startMonth) && (y < 2027 || i <= 4);
      if (!inRange) return `<i class="mc out" title=""></i>`;
      const past = y < 2026 || (y === 2026 && i <= 9);
      const st = idx++ < done ? "ok" : past ? "todo" : "future";
      return `<i class="mc ${st}" title="${ml[i]} ${y}: ${st === "ok" ? "stored" : st === "todo" ? "to pull" : "pulled nightly once it happens"}"></i>`;
    }).join("")}</div>`).join("");
    const pastMonths = (2026 - 2021) * 12 + 9 - DS.startMonth + 1;
    h += `<div class="card warn"><h2>Thomax (dotWMS) <span class="pill p-green">API key</span><span class="pill p-amber">Contract ends 31/05/2027</span></h2>
      <p class="sub">Main history source, 2021 to today. After the contract ends there is about one month to export, so the full history is pulled now, a few months per night, not in a rush at the end. Once stored, it stays here as a read-only archive.</p>
      <dl class="dl"><dt>Connection</dt><dd>Query API · login with read-only rights · key saved <span class="mono">••••d41f</span> <button class="lnk" data-act="src" data-n="Thomax key">change</button></dd>
      <dt>History pull</dt><dd><strong>${Math.min(done, pastMonths)} of ${pastMonths}</strong> months stored · ${DS.perNight} months a night · 25,000 rows per request</dd>
      <dt>Tables</dt><dd class="mono" style="font-size:11px">PCK PCK1 PCK4 WVE CON CON3 MAN RCPE RCPA ACT TNT CAR CAR1 <span class="muted">+ billing charges table (to confirm)</span></dd>
      <dt>After 05/2027</dt><dd>Archive only; no more pulls</dd></dl>
      <div class="ycal">${grid}</div>
      <div class="row small muted" style="margin-top:6px"><span><i class="mc ok"></i> stored</span><span><i class="mc todo"></i> to pull</span><span><i class="mc future"></i> pulled nightly until May 2027</span></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="pullmore">Pull next ${DS.perNight} months now</button><button class="btn" data-act="src" data-n="Check">Check row counts vs WMS reports</button><span class="meta">Start month 2021 to confirm with the first test query</span></div></div>
    <div class="card"><h2>3PLWMS (Tarek's system) <span class="pill p-grey">No API · file uploads</span></h2>
      <p class="sub">Used for about 2–3 months in 2026 before going back to Thomax. Few clients and orders, but it fills that gap. Upload the exports in several files; each file is checked for duplicates and date overlap before it is added.</p>
      <div class="tw"><table><thead><tr><th>File</th><th>Period</th><th class="r">Rows</th><th>Check</th><th>Added</th></tr></thead><tbody>
      ${DS.files.map((f, fi) => `<tr class="clickable" data-row="file|${fi}"><td class="mono">${esc(f.n)}</td><td class="num">${f.p}</td><td class="r num">${num(f.r)}</td><td>${f.ok ? '<span class="pill p-green">no overlap</span>' : '<span class="pill p-amber">overlaps Thomax 3 days</span>'}</td><td class="num">${f.d}</td></tr>`).join("")}
      </tbody></table></div><div class="row" style="margin-top:10px"><button class="btn" data-act="upload3pl">Upload file</button></div></div>
    <div class="card"><h2>Logiwa <span class="pill p-grey">Not live yet</span></h2>
      <p class="sub">Implementation started October 2026, no data yet. When it goes live: add the API key here, and Logiwa becomes the only live WMS source. Its data joins the Thomax and 3PLWMS history in one timeline.</p>
      <div class="row"><button class="btn" data-act="src" data-n="Logiwa">Add API key</button></div></div>
    <div class="callout">One timeline from three systems: each WMS has its own client IDs and charge codes. A mapping table (Thomax tenant → 3PLWMS client → Logiwa client, and old codes → the 44 standard codes) joins them. It lives in Settings.</div>`;
  }
  if (dsTab === "xero") {
    const A = [
      ["Accounting", "Invoices, bills, credit notes, payments, contacts, bank transactions, manual journals"],
      ["Reports", "P&L, balance sheet, trial balance, general ledger, aged receivables/payables, BAS/GST, tracking categories"],
      ["Payroll", "Pay runs, employees, timesheets, leave, super, PAYG. Pay by person visible to Asal and Mark only"],
      ["Assets & settings", "Chart of accounts, fixed assets, organisation details"],
      ["Attachments", "Original supplier invoices attached to bills (PDF, photos). Opened and read by Claude AI: lines, quantities, rates, period, client"]
    ];
    h += `<div class="card"><h2>Xero <span class="pill p-amber">Not connected</span></h2><p class="sub">One read-only connection to everything, so taxes, insurance, rent and every other cost can be pulled into the cost pools. Nothing is ever written to Xero.</p>
      <div class="tw"><table><thead><tr><th>Area</th><th>What is read</th><th>Access</th></tr></thead><tbody>${A.map(a => `<tr><td class="sup">${a[0]}</td><td>${a[1]}</td><td><span class="pill p-blue">read-only</span></td></tr>`).join("")}</tbody></table></div>
      <dl class="dl" style="margin-top:12px"><dt>History</dt><dd>Everything Xero holds, stored here month by month</dd><dt>Refresh</dt><dd>Nightly; month-end figures locked once the month is closed</dd><dt>Mapping</dt><dd>Which Xero account goes to which cost pool is set in Settings</dd><dt>Original bills</dt><dd>Read from the bill's attachment. Older bills with no attachment: found in Front (supplier email with the invoice), matched by supplier, number and amount</dd></dl>
      <div class="callout purple" style="margin-top:12px"><span class="ai">AI</span> Claude reads each original invoice and pulls the line detail Xero doesn't hold. Every value shows its confidence and links to the file; low-confidence values wait for a person. Never guessed: unreadable = "unknown, check original".</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="src" data-n="Xero">Connect Xero (read-only)</button><span class="meta">Needs your Xero login with payroll access. Scope names checked at build time.</span></div></div>`;
  }
  if (dsTab === "front") {
    h += `<div class="card"><h2>Front <span class="pill p-amber">Not connected</span></h2><p class="sub">Client service effort: tickets per client by type × standard minutes. Waiting time between messages is not counted as work.</p>
      <dl class="dl"><dt>Inboxes</dt><dd>FA Accounts · FA Support · FA Sales (never personal inboxes)</dd><dt>Access</dt><dd>Read-only token</dd><dt>Counted</dt><dd>Tickets per client a month, by type: order issue, damage/missing, rate question, invoice question, onboarding, other</dd><dt>Attachments</dt><dd>Files on emails are opened and read by Claude AI (supplier invoices, client claims, rate sheets)</dd><dt>Until connected</dt><dd>Manual estimate per client</dd></dl>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="src" data-n="Front">Connect Front (read-only)</button></div></div>`;
  }
  if (dsTab === "ai") {
    h += `<div class="card"><h2>Claude AI <span class="pill p-amber">Key not added</span></h2><p class="sub">Opens and reads files from Xero (original supplier invoices on bills) and Front (email attachments). Separate API key, every call logged with its cost; monthly budget with a warning at 80% and a pause at 100%. Anthropic does not train on API data by default.</p>
      <div class="tw"><table><thead><tr><th>Job</th><th>Model</th><th class="r">This month</th></tr></thead><tbody>
      <tr><td>Read original supplier invoices</td><td>Sonnet</td><td class="r num">$0.00</td></tr><tr><td>Read email attachments</td><td>Sonnet</td><td class="r num">$0.00</td></tr><tr><td>Sort tickets by client and type</td><td>Haiku</td><td class="r num">$0.00</td></tr></tbody></table></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="src" data-n="Claude AI">Add key</button><span class="meta">Budget US$30 / month (editable)</span></div></div>`;
  }
  if (dsTab === "rates") {
    h += `<div class="card"><h2>CLM <span class="pill p-grey">Later</span></h2><p class="sub">Master for client prices and contract dates. Used for the under-billing check and rate reviews; CLM asks this app for cost and margin.</p><div class="row"><button class="btn" data-act="src" data-n="CLM">Add key</button></div></div>
    <div class="card"><h2>Dyspatch <span class="pill p-grey">Export file</span></h2><p class="sub">For the rate checks (CLM vs Dyspatch) and as the rate source until CLM is live. API not confirmed, so a rate export upload is enough.</p><div class="row"><button class="btn" data-act="src" data-n="Dyspatch">Upload rate export</button></div></div>`;
  }
  return h;
}

function pApis() {
  const stP = (s) => ({ Active: "p-green", Ending: "p-amber", "Not connected": "p-grey", Ended: "p-grey", "Files only": "p-blue", Revoked: "p-grey", Expired: "p-grey" }[s] || "p-grey");
  if (sub === "Connected to") {
    const act = APIIN.filter(a => a.st !== "Ended"), old = APIIN.filter(a => a.st === "Ended");
    const row = (a) => `<tr class="clickable" data-row="api|${esc(a.n)}"><td class="sup">${esc(a.n)}<div class="meta">${esc(a.cat)}</div></td><td>${esc(a.how)}</td><td>${esc(a.acc)}</td><td><span class="pill ${stP(a.st)}">${esc(a.st === "Ending" ? "Active · ends " + a.end : a.st)}</span></td><td class="num">${esc(a.sync)}</td><td class="num">${esc(a.data)}</td><td class="actions">${a.st === "Ended" ? '<span class="meta">archive kept</span>' : a.st === "Not connected" ? `<button class="lnk" data-act="src" data-n="${esc(a.n)}">connect</button>` : a.how === "File upload" ? `<button class="lnk" data-go="data">upload</button>` : `<button class="lnk" data-act="testconn" data-n="${esc(a.n)}">test</button><button class="lnk" data-act="src" data-n="${esc(a.n)} key">change key</button>`}</td></tr>`;
    return `<div class="card"><h2>Connected to</h2><p class="sub">Systems this app reads from, with their status. Keys are stored on the server (Vercel env vars) and shown only as the last 4 characters.</p><div class="tw"><table><thead><tr><th>System</th><th>How</th><th>Access</th><th>Status</th><th>Last sync</th><th>Data stored</th><th>Actions</th></tr></thead><tbody>${act.map(row).join("")}</tbody></table></div></div>
    <div class="card"><h2>Ended connections</h2><p class="sub">No longer connected. Their data stays in this app as a read-only archive. Thomax moves here after 31/05/2027.</p><div class="tw"><table><thead><tr><th>System</th><th>How</th><th>Access</th><th>Status</th><th>Last sync</th><th>Data stored</th><th></th></tr></thead><tbody>${old.map(row).join("")}</tbody></table></div></div>`;
  }
  return `<div class="card"><h2>Keys this app gives out</h2><p class="sub">Give another app (CLM, Marcus's app, the Accounts Hub) a key so it can read from FA Analytics. Read-only. Each key sees only what you tick. Pay by person is never available through a key.</p><div class="tw"><table><thead><tr><th>App</th><th>Can read</th><th>Key</th><th>Created</th><th>Expires</th><th>Last used</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${KEYS.map(k => `<tr class="clickable" data-row="key|${k.last4}"><td class="sup">${esc(k.app)}<div class="meta">${esc(k.who)}</div></td><td class="small">${k.scopes.map(s => `<span class="pill p-grey" style="margin:1px">${esc(s)}</span>`).join(" ")}</td><td class="mono">fa_an_••••${k.last4}</td><td class="num">${k.created}</td><td class="num">${k.exp}</td><td class="num meta">${k.used}</td><td><span class="pill ${stP(k.st)}">${k.st}</span></td><td class="actions">${k.st === "Active" ? `<button class="lnk" data-revoke="${k.last4}">revoke</button>` : ""}</td></tr>`).join("")}
  </tbody></table></div></div>
  <div class="card"><h2>Create a key</h2><div class="dl" style="grid-template-columns:max-content minmax(0,1fr);align-items:start">
    <dt><label for="kapp">App</label></dt><dd><input id="kapp" type="text" placeholder="e.g. Marcus HR app" style="width:min(320px,100%)"></dd>
    <dt>Can read</dt><dd class="chips">${SCOPES.map((s, i) => `<label class="chip"><input type="checkbox" id="ks${i}" data-scope="${esc(s)}"> ${esc(s)}</label>`).join("")}</dd>
    <dt><label for="kexp">Expires</label></dt><dd><select id="kexp"><option>in 12 months</option><option>in 6 months</option><option>in 3 months</option><option>never</option></select></dd></div>
    <div class="row" style="margin-top:12px"><button class="btn primary" data-act="mkkey">Create key</button><span class="meta">The full key is shown once. Copy it into the other app's settings.</span></div>
    ${NEWKEY ? `<div class="callout" style="margin-top:12px"><strong>Copy this key now; it won't be shown again:</strong><div class="row" style="margin-top:6px"><span class="mono" id="nk" style="user-select:all">${NEWKEY}</span><button class="btn" data-act="copykey">Copy</button></div></div>` : ""}</div>`;
}

function pSettings() {
  const OWN = USERS.find(u => u.role === "Owner");
  if (sub === "Company") return `<div class="card"><h2>Company</h2><p class="sub">The app is not hard-coded to FA. These values show in the top bar, emails and reports.</p>
    <div class="dl" style="grid-template-columns:max-content minmax(0,1fr);align-items:center">
    <dt><label for="co-n">Name</label></dt><dd><input id="co-n" type="text" value="${esc(COMPANY.name)}" data-co="name" style="width:min(320px,100%)"></dd>
    <dt><label for="co-s">Short name</label></dt><dd><input id="co-s" type="text" value="${esc(COMPANY.short)}" data-co="short" style="width:120px"></dd>
    <dt>Owner</dt><dd>${esc(OWN.name)} <span class="pill p-purple">Owner · locked</span></dd>
    <dt><label for="co-d">Email domain</label></dt><dd><input id="co-d" type="text" value="${esc(COMPANY.domain)}" data-co="domain" style="width:min(320px,100%)"> <span class="meta">only these emails can be users</span></dd>
    <dt><label for="co-t">Timezone</label></dt><dd><select id="co-t" data-co="tz"><option selected>Australia/Sydney</option><option>Pacific/Auckland</option><option>Asia/Shanghai</option></select></dd>
    <dt>Dates · currency</dt><dd>DD/MM/YYYY · AUD</dd><dt>Financial year</dt><dd>July – June</dd><dt>Logo</dt><dd>see <button class="lnk" data-sub="Branding">Branding</button></dd></div>
    <div class="row" style="margin-top:12px"><button class="btn primary" data-act="savecompany">Save</button></div></div>`;
  if (sub === "Users") {
    const roleSel = (u) => u.role === "Owner" ? '<span class="pill p-purple">Owner</span> <span class="lock">🔒 can\'t be changed</span>'
      : `<span class="pill p-grey">${esc(u.role)}</span>`;
    return `<div class="card"><h2>Users</h2><p class="sub">Add and remove users. Roles will be set up later. Nobody can change or remove the owner.</p><div class="tw"><table><thead><tr><th>User</th><th>Role</th><th>Pay by person</th><th>2FA</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead><tbody>
    ${USERS.map(u => `<tr class="clickable" data-row="user|${u.id}"><td class="sup">${esc(u.name)}<div class="meta">${esc(u.email)}</div></td><td>${roleSel(u)}</td><td>${u.role === "Owner" ? '<span class="pill p-green">yes</span>' : `<label class="small"><input type="checkbox" data-upay="${u.id}" ${u.pay ? "checked" : ""}> ${u.pay ? "yes" : "no"}</label>`}</td><td>${u.tfa ? '<span class="pill p-green">on</span>' : '<span class="pill p-amber">not set up</span>'}</td><td><span class="pill ${u.st === "Active" ? "p-green" : "p-amber"}">${u.st}</span></td><td class="num meta">${esc(u.last)}</td>
      <td class="actions">${u.st === "Invited" ? `<button class="lnk" data-uact="resend" data-u="${u.id}">resend invite</button>` : `<button class="lnk" data-uact="reset" data-u="${u.id}">reset password</button><button class="lnk" data-uact="tfa" data-u="${u.id}">reset 2FA</button>`}${u.role !== "Owner" ? `<button class="lnk" data-uact="remove" data-u="${u.id}" style="color:var(--red)">remove</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div>
    ${CONFIRM ? `<div class="callout" style="margin-top:12px">Remove <strong>${esc(USERS.find(u => u.id === CONFIRM).name)}</strong>? They lose access straight away. <button class="btn danger" data-uact="removeyes" data-u="${CONFIRM}">Remove</button> <button class="btn" data-uact="removeno">Cancel</button></div>` : ""}</div>
    <div class="card"><h2>Invite a user</h2><p class="sub">Only people on the Internal list can be invited. They get an email link to set their own password and 2FA.</p><div class="row">
      <input id="nu-n" type="text" placeholder="Name" aria-label="Name" style="width:160px"><input id="nu-e" type="email" placeholder="name@${esc(COMPANY.domain)}" aria-label="Email" style="width:min(260px,100%)">
<button class="btn primary" data-act="invite">Send invitation</button></div>
      ${INVITE_ERR ? `<div class="warnbox" style="margin-top:8px">${esc(INVITE_ERR)}</div>` : ""}</div>
`;
  }
  if (sub === "Contacts & recipients") return pContacts();
  if (sub === "Login & security") return `<div class="card"><h2>Login & security</h2><p class="sub">Same as the Accounts Hub.</p>
    <div class="dl" style="grid-template-columns:max-content minmax(0,1fr);align-items:center">
    <dt><label for="sec-s">Session length</label></dt><dd><select id="sec-s" data-sec="session">${[4, 8, 12].map(h => `<option value="${h}" ${SEC.session === h ? "selected" : ""}>${h} hours</option>`).join("")}</select> <span class="meta">then log in again with password + 2FA</span></dd>
    <dt>Two-factor</dt><dd>Required for everyone, authenticator app (6-digit code), asked at every new login</dd>
    <dt>Who can log in</dt><dd>Only the Internal list in Contacts & recipients (trusted domains + approved people, e.g. a personal or DTS email)</dd>
    <dt>Forgot password</dt><dd>Link sent to the user's own email, valid 30 minutes, one use</dd>
    <dt>Failed logins</dt><dd>5 wrong attempts → locked for 15 minutes; owner gets an email</dd>
    <dt>Owner recovery</dt><dd>Owner can always reset own password and 2FA by email; owner role can't be removed</dd></div></div>
    <div class="card"><h2>Login screen preview</h2><div class="loginprev">
      <div class="lp"><img src="${brand.logoLight}" alt="" style="height:34px"><h3>Sign in to Analytics</h3>${LOGINSTEP === 0 ? `
        <label class="small" for="lp-e">Work email</label><input id="lp-e" type="email" placeholder="name@${esc(COMPANY.domain)}"><label class="small" for="lp-p">Password</label><input id="lp-p" type="password" placeholder="••••••••">
        <button class="btn primary" data-lp="1">Sign in</button><button class="lnk" data-lp="forgot">Forgot password?</button>` : LOGINSTEP === 1 ? `
        <label class="small" for="lp-c">6-digit code from your authenticator app</label><input id="lp-c" type="text" inputmode="numeric" placeholder="123 456"><button class="btn primary" data-lp="0">Verify</button><span class="meta">Signed in for ${SEC.session} hours</span>` : `
        <p class="small">Enter your work email. We'll send a reset link to it if it belongs to a user.</p><input id="lp-f" type="email" placeholder="name@${esc(COMPANY.domain)}"><button class="btn primary" data-lp="sent">Send reset link</button><button class="lnk" data-lp="0">Back to sign in</button>`}
      </div></div></div>`;
  if (sub === "Branding") return `<div class="card"><h2>Branding</h2><p class="sub">Logos and colours used across the app and in every email and report. Changes show straight away.</p>
    <div class="brandgrid">
      <div><div class="small muted">Logo on dark background (email header)</div><div class="logobox dark"><img alt="Logo for dark backgrounds" data-logo="dark" src="${brand.logoDark}"></div><label class="btn" for="up-dark">Upload logo…</label><input type="file" id="up-dark" accept="image/svg+xml,image/png,image/jpeg" data-uplogo="logoDark" hidden></div>
      <div><div class="small muted">Logo on light background (menu, print, PDFs)</div><div class="logobox"><img alt="Logo for light backgrounds" data-logo="light" src="${brand.logoLight}"></div><label class="btn" for="up-light">Upload logo…</label><input type="file" id="up-light" accept="image/svg+xml,image/png,image/jpeg" data-uplogo="logoLight" hidden></div>
      <div style="display:grid;gap:10px;align-content:start">${[["header", "Dark accents (lead cards, email header)"], ["blue", "Primary (buttons, links, highlights)"], ["ink", "Text"]].map(([k, l]) => `<label class="colorrow" for="c-${k}"><input type="color" id="c-${k}" data-bc="${k}" value="${brand[k]}"><span>${l}</span><span class="mono">${brand[k].toUpperCase()}</span></label>`).join("")}
        <div class="row"><button class="btn" data-act="brandreset">Reset to FA brand</button></div></div></div>
    <p class="meta" style="margin:10px 0 0">SVG works best (sharp at any size). Status colours (red, amber, green) stay fixed so warnings always look like warnings.</p></div>`;
  if (sub === "Clients") return pClientsSet();
  if (sub === "Suppliers") return pSuppliers();
  if (sub === "Staff & allocation") return pStaff();
  return pRules();
}

/* ===== Reports, KPI, contacts, sharing ===== */
let REPORTS = [
  { id: "r1", name: "Client workload · weekly", tpl: "workload", per: "Week", cls: "Internal", sched: "Mon 7:30", on: true },
  { id: "r2", name: "Client workload · monthly", tpl: "workload", per: "Month", cls: "Internal", sched: "1st business day", on: true },
  { id: "r3", name: "Client workload · quarterly", tpl: "workload", per: "Quarter", cls: "Internal", sched: "Off", on: false },
  { id: "r4", name: "Revenue protection · Mark", tpl: "mark", per: "Month", cls: "Internal", sched: "5th business day", on: true },
  { id: "r5", name: "Kora Organics · monthly volumes", tpl: "workload", per: "Month", cls: "Client-safe", client: "kora", sched: "Off", on: false }
];
const TPL = { workload: "Client workload & period comparison", mark: "Revenue protection (monthly)" };
const INTERNAL = {
  domains: ["fulfilmentaustralia.com.au"],
  people: [
    { name: "Asal Artikbaeva", email: "asal@fulfilmentaustralia.com.au", login: true },
    { name: "Mark Mina", email: "mark@example-personal.com", login: true, note: "personal email" },
    { name: "Khalid", email: "khalid@example-dts.com.au", login: true, note: "DTS domain" },
    { name: "Marcus Mina", email: "marcus@fulfilmentaustralia.com.au", login: true }
  ]
};
let CCON = [
  { client: "kora", domains: ["example-kora.com"], contacts: [{ name: "Ops team", email: "ops@example-kora.com" }], st: "Active" },
  { client: "mwu", domains: ["example-mwu.com.au"], contacts: [{ name: "Warehouse contact", email: "logistics@example-mwu.com.au" }], st: "Active" },
  { client: "coastal", domains: ["example-coastalgrl.com"], contacts: [], st: "Active" }
];
let SUGG = [
  { email: "accounts@example-kora.com", guess: "kora", src: "Xero contact", kind: "client" },
  { email: "jess@example-coastalgrl.com", guess: "coastal", src: "Front · 14 emails", kind: "client" },
  { email: "finance@example-dts.com.au", guess: null, src: "Front · internal thread", kind: "internal" }
];
let ccTab = "Internal", SHARE = null, newRep = false;
const isInternal = (em) => INTERNAL.domains.some(d => em.endsWith("@" + d)) || INTERNAL.people.some(p => p.email === em);
const clientOf = (em) => { const c = CCON.find(x => x.contacts.some(k => k.email === em)); return c ? c.client : null; };

function seeded(i, j) { const x = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return x - Math.floor(x); }
function workload(per, onlyClient) {
  const f = per === "Week" ? 0.23 : per === "Quarter" ? 3 : 1;
  return CLIENTS.filter(c => !onlyClient || c.id === onlyClient).map((c, i) => {
    const orders = Math.round(c.vols["ORD-FEE"] * f), units = Math.round(c.vols["PCK-UNIT"] * f);
    const upo = units / orders;
    let s1 = Math.max(0.15, Math.min(0.85, 1.25 - upo * 0.3)), s4 = Math.max(0.02, Math.min(0.5, (upo - 1.2) * 0.07));
    let s2 = (1 - s1 - s4) * 0.62, s3 = 1 - s1 - s2 - s4;
    const chg = (seeded(i, per.length) - 0.4) * 0.3;
    return { c, orders, units, upo, mix: [s1, s2, s3, s4], prev: Math.round(orders / (1 + chg)), chg };
  }).sort((a, b) => b.orders - a.orders);
}
function pWorkload(r) {
  const rows = workload(r.per, r.cls === "Client-safe" ? r.client : null);
  const per = r.per.toLowerCase(), cols = ["var(--blue-light)", "var(--blue-mid)", "var(--blue)", "var(--header)"];
  const tot = rows.reduce((a, x) => a + x.orders, 0), totP = rows.reduce((a, x) => a + x.prev, 0);
  return `<div class="kpis"><div class="kpi"><div class="l">Orders this ${per}</div><div class="v">${num(tot)}</div><div class="s">${tot >= totP ? "▲" : "▼"} ${pct((tot - totP) / totP)} vs previous ${per}</div></div>
    <div class="kpi"><div class="l">Single-SKU orders</div><div class="v">${pct(rows.reduce((a, x) => a + x.mix[0] * x.orders, 0) / tot, 0)}</div><div class="s">easiest work</div></div>
    <div class="kpi"><div class="l">4+ SKU orders</div><div class="v">${pct(rows.reduce((a, x) => a + x.mix[3] * x.orders, 0) / tot, 0)}</div><div class="s">heaviest work</div></div>
    <div class="kpi"><div class="l">Units per order</div><div class="v">${(rows.reduce((a, x) => a + x.units, 0) / tot).toFixed(2)}</div><div class="s">all clients</div></div></div>
  <div class="card"><h2>Workload by client · orders by number of SKUs</h2><p class="sub">From WMS order lines. More SKUs per order = more picks and longer packing. Source: Thomax PCK1 (later Logiwa).</p>
    <div class="row small muted" style="margin-bottom:8px">${["1 SKU", "2 SKUs", "3 SKUs", "4+ SKUs"].map((l, i) => `<span><i class="mc" style="background:${cols[i]};border-color:${cols[i]}"></i> ${l}</span>`).join("")}</div>
    <div class="tw"><table><thead><tr><th>Client</th><th class="r">Orders</th><th style="min-width:200px">SKU mix</th><th class="r">1</th><th class="r">2</th><th class="r">3</th><th class="r">4+</th><th class="r">Units / order</th></tr></thead><tbody>
    ${rows.map(x => `<tr class="clickable" data-row="wl|${r.id}|${x.c.id}"><td class="sup">${esc(x.c.short)}</td><td class="r num">${num(x.orders)}</td><td><div class="stack">${x.mix.map((m, i) => `<i style="width:${m * 100}%;background:${cols[i]}"></i>`).join("")}</div></td>${x.mix.map(m => `<td class="r num">${pct(m, 0)}</td>`).join("")}<td class="r num">${x.upo.toFixed(2)}</td></tr>`).join("")}
    </tbody></table></div></div>
  <div class="card"><h2>Compared with previous ${per}</h2><p class="sub">Growth or drop in orders per client.</p><div class="tw"><table><thead><tr><th>Client</th><th class="r">Previous</th><th class="r">This ${per}</th><th class="r">Change</th><th style="min-width:160px"></th></tr></thead><tbody>
    ${rows.slice().sort((a, b) => b.chg - a.chg).map(x => { const w = Math.min(50, Math.abs(x.chg) * 160); return `<tr class="clickable" data-row="wl|${r.id}|${x.c.id}"><td class="sup">${esc(x.c.short)}</td><td class="r num">${num(x.prev)}</td><td class="r num">${num(x.orders)}</td><td class="r num ${x.chg >= 0 ? "delta-pos" : "delta-neg"}">${x.chg >= 0 ? "▲" : "▼"} ${pct(Math.abs(x.chg))}</td><td><div class="diverge"><span></span><i style="${x.chg >= 0 ? "left:50%" : "right:50%"};width:${w}%;background:${x.chg >= 0 ? "var(--green)" : "var(--red)"}"></i></div></td></tr>`; }).join("")}
    </tbody></table></div></div>
  <div class="callout purple"><span class="ai">AI</span> Summary written by Claude from the figures above appears at the top of the PDF, e.g. "Sony Music orders are mostly 4+ SKUs; Coastal Grl grew fastest this ${per}."</div>`;
}
function pReports(M) {
  if (sub === "+ New report" || newRep) {
    return `<div class="card"><h2>New report</h2><p class="sub">Each report you save appears as its own item in the Reports menu.</p><div class="dl" style="grid-template-columns:max-content minmax(0,1fr);align-items:center">
      <dt><label for="nr-n">Name</label></dt><dd><input id="nr-n" type="text" placeholder="e.g. Client workload · fortnightly" style="width:min(340px,100%)"></dd>
      <dt><label for="nr-t">Template</label></dt><dd><select id="nr-t">${Object.entries(TPL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select> <span class="meta">more templates added later (from your old report files)</span></dd>
      <dt><label for="nr-p">Period</label></dt><dd><select id="nr-p"><option>Week</option><option selected>Month</option><option>Quarter</option></select></dd>
      <dt><label for="nr-c">Type</label></dt><dd><select id="nr-c"><option>Internal</option><option>Client-safe</option></select> <select id="nr-cl" aria-label="Client"><option value="">All clients</option>${CLIENTS.map(c => `<option value="${c.id}">${esc(c.short)}</option>`).join("")}</select> <span class="meta">Client-safe = one client, no costs or margins</span></dd></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="saverep">Save report</button></div></div>`;
  }
  const r = REPORTS.find(x => x.name === sub) || REPORTS[0];
  const head = `<div class="ph"><div><h1>${esc(r.name)}</h1><p>${esc(TPL[r.tpl])} · ${r.per.toLowerCase()} · <span class="pill ${r.cls === "Internal" ? "p-purple" : "p-green"}">${r.cls}${r.client ? " · " + esc(cl(r.client).short) : ""}</span> · schedule: ${r.on ? esc(r.sched) : "off"}</p></div>
    <div class="row"><button class="btn primary" data-share="${r.id}">Email / PDF</button><button class="btn danger" data-delrep="${r.id}">Delete report</button></div></div>`;
  return head + (r.tpl === "mark" ? pReport(M) : pWorkload(r));
}
const KPIS = {
  Operations: [["Orders per day", "3,240", "▲ 4.1%", "target 3,000"], ["Dispatched before cut-off", "96.8%", "▼ 0.6 pts", "target 98%"], ["Dock-to-stock", "26 h", "▲ 3 h", "target 24 h"], ["Returns processed in 48 h", "91%", "▲ 2 pts", "target 95%"]],
  People: [["Picks per hour", "142", "▲ 6", "WMS pick times"], ["Orders per labour hour", "11.4", "▲ 0.3", ""], ["Labour cost per order", "$2.06", "▼ $0.04", ""], ["Overtime share", "7.2%", "▲ 1.1 pts", "target < 5%"]],
  Finance: [["Services margin", "11.8%", "▼ 1.1 pts", "floor 15%"], ["Cost per order", "$4.71", "▲ $0.08", ""], ["Revenue per order", "$5.34", "▲ $0.02", ""], ["Leakage found", "$3,277", "this month", ""], ["Debtor days", "34", "▼ 7", "before 41"], ["Credit notes", "1.4%", "of revenue", ""]],
  Warehouse: [["Pallet positions used · Smithfield", "84%", "▲ 2 pts", ""], ["Pallet positions used · Parramatta", "77%", "▼ 1 pt", ""], ["Revenue per pallet position", "$31.20", "per month", ""], ["Slow stock (90+ days)", "1,140 pallets", "▲ 60", "storage rate review"]],
  "Quality & clients": [["Mis-pick rate", "0.31%", "▼ 0.04 pts", "from claims + credit notes"], ["Damage claims", "0.08%", "flat", ""], ["Stock accuracy", "99.2%", "cycle counts", ""], ["Tickets per 100 orders", "1.9", "▲ 0.2", "Front"], ["Top 5 clients' share", "58%", "of revenue", "concentration risk"], ["Client growth", "+3 / −1", "this quarter", ""]]
};
function pKpi() {
  const list = KPIS[sub] || KPIS.Operations;
  return `<div class="ph"><div><h1>${esc(sub)} KPIs</h1><p>${MONTH} vs previous month. Click "Email / PDF" to send or schedule this page.</p></div><button class="btn primary" data-share="kpi">Email / PDF</button></div>
  <div class="kpis kpis6">${list.map(k => `<div class="kpi clickable" data-row="kpi|${esc(k[0])}"><div class="l">${esc(k[0])}</div><div class="v">${esc(k[1])}</div><div class="s">${esc(k[2])}${k[3] ? " · " + esc(k[3]) : ""}</div></div>`).join("")}</div>
  <div class="callout">Demo figures. In the real app each KPI links to its source (WMS, Xero, Front) and has an editable target in Settings → Rules.</div>`;
}
function pContacts() {
  const owner = true;
  const tabs = `<div class="seg" style="margin-bottom:4px">${["Internal", "Clients", "Lenders & advisers", "Suggestions"].map(t => `<button data-cc="${t}" aria-pressed="${ccTab === t}">${t}${t === "Suggestions" && SUGG.length ? " (" + SUGG.length + ")" : ""}</button>`).join("")}</div>`;
  let body = "";
  if (ccTab === "Internal") body = `<div class="card"><h2>Internal</h2><p class="sub">Can receive any report, including costs and margins, and can be given a login. Only the owner can add or remove entries here.</p>
    <div class="tsec-h">Trusted domains</div><div class="chips" style="margin-bottom:12px">${INTERNAL.domains.map(d => `<span class="chip">@${esc(d)}<button data-rmdom="${esc(d)}" aria-label="Remove">×</button></span>`).join("")}<input id="ad-d" type="text" placeholder="add domain, e.g. DTS domain" style="width:200px"><button class="btn" data-act="adddom">Add</button></div>
    <div class="tsec-h">Approved people outside those domains</div><div class="tw"><table><thead><tr><th>Name</th><th>Email</th><th>Note</th><th>Can log in</th><th></th></tr></thead><tbody>
    ${INTERNAL.people.map((p, i) => `<tr><td class="sup">${esc(p.name)}</td><td class="mono">${esc(p.email)}</td><td class="meta">${esc(p.note || "")}</td><td>${p.login ? '<span class="pill p-green">yes</span>' : '<span class="pill p-grey">no</span>'}</td><td>${p.name === "Asal Artikbaeva" ? '<span class="lock">owner</span>' : `<button class="lnk" data-rmint="${i}" style="color:var(--red)">remove</button>`}</td></tr>`).join("")}
    </tbody></table></div><div class="row" style="margin-top:10px"><input id="ai-n" type="text" placeholder="Name" style="width:150px"><input id="ai-e" type="email" placeholder="email" style="width:min(240px,100%)"><button class="btn" data-act="addint">Add person</button></div></div>`;
  if (ccTab === "Clients") body = `<div class="card"><h2>Clients</h2><p class="sub">Client contacts can only receive Client-safe reports, and only about their own company.</p><div class="tw"><table><thead><tr><th>Client</th><th>Domains</th><th>Contacts</th><th>Status</th></tr></thead><tbody>
    ${CCON.map(c => `<tr><td class="sup">${esc(cl(c.client).name)}</td><td class="mono">${c.domains.map(esc).join(", ")}</td><td>${c.contacts.length ? c.contacts.map(k => `<div>${esc(k.name)} <span class="mono">${esc(k.email)}</span></div>`).join("") : '<span class="meta">none yet</span>'}</td><td><span class="pill p-green">${c.st}</span></td></tr>`).join("")}
    </tbody></table></div><div class="row" style="margin-top:10px"><select id="ac-c" aria-label="Client">${CLIENTS.map(c => `<option value="${c.id}">${esc(c.short)}</option>`).join("")}</select><input id="ac-n" type="text" placeholder="Name" style="width:150px"><input id="ac-e" type="email" placeholder="email" style="width:min(240px,100%)"><button class="btn" data-act="addcc">Add contact</button></div></div>`;
  if (ccTab === "Lenders & advisers") body = `<div class="card"><h2>Lenders & advisers</h2><p class="sub">Bank, external accountant, auditor, broker. They can receive only External finance reports (company totals, no client margins, no pay by person), and only after approval.</p><div class="tw"><table><thead><tr><th>Name</th><th>Email</th></tr></thead><tbody>${LENDERS.map(l => `<tr><td class="sup">${esc(l.name)}</td><td class="mono">${esc(l.email)}</td></tr>`).join("")}</tbody></table></div><div class="row" style="margin-top:10px"><input id="al-n" type="text" placeholder="Name / role" style="width:180px"><input id="al-e" type="email" placeholder="email" style="width:min(240px,100%)"><button class="btn" data-act="addlender">Add</button></div></div>`;
  if (ccTab === "Suggestions") body = `<div class="card"><h2>Suggestions from Xero and Front</h2><p class="sub">Found in Xero contacts and Front emails. Nothing is added until you confirm; nobody is ever added to Internal automatically.</p><div class="tw"><table><thead><tr><th>Email</th><th>Found in</th><th>Looks like</th><th>Actions</th></tr></thead><tbody>
    ${SUGG.map((s, i) => `<tr><td class="mono">${esc(s.email)}</td><td class="meta">${esc(s.src)}</td><td>${s.guess ? esc(cl(s.guess).short) + " (client)" : "Internal?"}</td><td class="actions">${s.guess ? `<button class="lnk" data-sg="client" data-i="${i}">add to ${esc(cl(s.guess).short)}</button>` : ""}<button class="lnk" data-sg="internal" data-i="${i}">add to Internal</button><button class="lnk" data-sg="ignore" data-i="${i}">ignore</button></td></tr>`).join("") || '<tr><td colspan="4" class="empty">No new suggestions.</td></tr>'}
    </tbody></table></div></div>`;
  return tabs + body + `<div class="callout">Reports can only be sent to addresses in these lists. Unknown address = blocked.</div>`;
}

/* ===== Detail panels for every line ===== */
const KPI_HOW = {
  "Orders per day": ["Orders dispatched ÷ working days", "WMS (Thomax PCK, later Logiwa)"],
  "Dispatched before cut-off": ["Orders dispatched the same day they arrived before the cut-off ÷ all such orders", "WMS order and consignment timestamps (PCK, CON)"],
  "Dock-to-stock": ["Average hours from receipt arrival to stock available to pick", "WMS receipts (RCPE, RCPA)"],
  "Picks per hour": ["Units picked ÷ hours on pick activity", "WMS timed activities (ACT), pick confirmations"],
  "Labour cost per order": ["Floor labour cost ÷ orders", "Xero Payroll + WMS orders"],
  "Services margin": ["(Billed − cost to serve) ÷ billed, processing only", "Xero invoice lines + cost model"],
  "Debtor days": ["Receivables ÷ average daily sales", "Xero aged receivables"],
  "Mis-pick rate": ["Orders with a mis-pick claim ÷ orders", "Front tickets + Xero credit notes"],
  "Tickets per 100 orders": ["Front tickets per client ÷ orders × 100", "Front + WMS"]
};
function rowHTML(type, id) {
  const cp = costPanelHTML(type, id); if (cp) return cp;
  if (type === "line") return lineHTML(id);
  if (type === "staff") return staffHTML(id);
  if (type === "fin") return finHTML(id);
  const M = model();
  if (type === "svc") {
    const s = C(id), u = M.unit[id], p = s.pool ? M.pools[s.pool] : null;
    const ovl = Object.entries(s.ovh).map(([k, n]) => { const o = OVH.find(x => x.id === k); return `${n} × ${money(M.ovhRate[k], 3)} (${esc(o.name)}, per ${o.unit}) = ${money(n * M.ovhRate[k], 3)}`; });
    return (`<h3>${esc(s.name)}</h3><dl class="dl"><dt>Code</dt><dd class="mono">${s.code}</dd><dt>Per</dt><dd>${esc(s.unit)}</dd><dt>Minutes</dt><dd>${s.min} · <span class="pill ${s.basis === "Estimate" ? "p-amber" : "p-blue"}">${s.basis}</span></dd><dt>Cost per unit</dt><dd class="num"><strong>${money(u.total, 3)}</strong></dd></dl>
    <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">${s.pool ? `Labour: ${s.min} min × ${money(p.cpm, 3)} per minute (${esc(POOLS[s.pool].name)}) = ${money(u.lab, 3)}<br>Admin share: ${s.min} min × ${money(M.ovhRate.admin, 3)} = ${money(u.adm, 3)}<br>` : ""}${ovl.join("<br>")}${ovl.length ? "<br>" : ""}<strong>Total = ${money(u.total, 3)}</strong></div></div>
    ${s.warn ? `<div class="warnbox">${esc(s.warn)}</div>` : ""}
    <div class="tsec"><div class="tsec-h">Where the numbers come from</div><div class="small">Minutes: ${s.basis === "Estimate" ? "estimate, to be replaced by the time study" : s.basis}. Cost per minute: Xero Payroll for ${MONTH} (see Labour). Overheads: Xero P&L accounts (see Cost pools).</div></div>
    ${s.unbilled ? "" : `<div class="tsec"><div class="tsec-h">Client rates vs this cost</div><table><tbody>${M.clients.map(c => { const l = c.lines.find(x => x.code === id); return `<tr><td>${esc(c.short)}</td><td class="r num">${money(l.rate)}</td><td>${mpill(l.marginPct)}</td></tr>`; }).join("")}</tbody></table></div>`}
    <div class="row"><button class="btn" data-goto="model|Standard minutes">Change minutes</button></div>`);
  }
  if (type === "lab") {
    const p = POOLS[id], c = M.pools[id];
    return (`<h3>${esc(p.name)}</h3><p class="small muted">${esc(p.who)} · ${p.staff} staff</p>
    <div class="tsec"><div class="tsec-h">How cost per minute is calculated</div><div class="formula">Gross wages ${money(c.gross)} (PAYG is inside gross)<br>+ Super ${pct(ONCOST.superRate, 0)} = ${money(c.sup)}<br>+ Payroll tax ${pct(ONCOST.payrollTax, 2)} of gross + super = ${money(c.ptax)}<br>+ Workers comp ${pct(ONCOST.workersComp, 1)} = ${money(c.wc)}<br><strong>= Labour cost ${money(c.total)}</strong><br><br>${num(p.hours)} paid hours × 60 × ${pct(p.util, 0)} utilisation = ${num(c.minutes)} practical minutes<br><strong>Cost per minute = ${money(c.total)} ÷ ${num(c.minutes)} = ${money(c.cpm, 3)}</strong></div></div>
    <div class="tsec"><div class="tsec-h">Sources</div><div class="small">Xero Payroll pay runs for ${MONTH}: gross, super, hours. Payroll tax and workers comp rates from Settings → Rules. Utilisation = share of paid time spent on activities (breaks, idle, training removed).</div></div>
    <div class="tsec"><div class="tsec-h">Used by</div><div class="small">${SERVICES.filter(s => s.pool === id).map(s => esc(s.name)).join(" · ")}</div></div>`);
  }
  if (type === "ovh") {
    const o = OVH.find(x => x.id === id), tot = o.id === "admin" ? M.labourMin : o.total;
    return (`<h3>${esc(o.name)}</h3><dl class="dl"><dt>Amount</dt><dd class="num">${money(o.amount)}</dd><dt>Source</dt><dd>${esc(o.src)}</dd><dt>Spread by</dt><dd>${esc(o.driver)}</dd></dl>
    <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">${money(o.amount)} ÷ ${num(tot)} ${esc(o.unit)}s (FA-wide, all tenants) = ${money(M.ovhRate[o.id], 3)} per ${esc(o.unit)}</div></div>
    <div class="tsec"><div class="tsec-h">Used by</div><div class="small">${o.id === "admin" ? "Every labour minute in every service" : SERVICES.filter(s => s.ovh[o.id]).map(s => esc(s.name)).join(" · ")}</div></div>`);
  }
  if (type === "line") {
    const [cid, code] = id.split("|"), c = M.clients.find(x => x.id === cid), l = c.lines.find(x => x.code === code);
    const dy = DYSPATCH_RATE[id], wm = WMS_RATE[id];
    return (`<h3>${esc(c.short)} · ${esc(l.s.name)}</h3><dl class="dl"><dt>Rate (CLM)</dt><dd class="num">${money(l.rate)} per ${esc(l.s.unit)}</dd><dt>Cost per unit</dt><dd class="num">${money(l.unitCost)}</dd><dt>Margin</dt><dd>${mpill(l.marginPct)}</dd><dt>${MONTH} volume</dt><dd class="num">${num(l.vol)}</dd></dl>
    <div class="tsec"><div class="tsec-h">What the ${money(l.unitCost)} cost per unit is made of · click a part</div><table><tbody>
      ${(() => { const s = l.s, u = M.unit[code], parts = [];
        if (s.pool) { parts.push([`Labour · ${s.min} min × ${money(M.pools[s.pool].cpm, 3)} per minute`, u.lab, "lab|" + s.pool]); parts.push([`Admin share · ${s.min} min × ${money(M.ovhRate.admin, 3)}`, u.adm, "ovh|admin"]); }
        Object.entries(s.ovh).forEach(([k, n]) => { const o = OVH.find(x => x.id === k); parts.push([`${esc(o.name)} · ${n} × ${money(M.ovhRate[k], 3)} per ${o.unit}`, n * M.ovhRate[k], "ovh|" + k]); });
        return parts.map(x => `<tr class="clickable" data-row="${x[2]}"><td>${x[0]}</td><td class="r num">${money(x[1], 3)}</td></tr>`).join("") + `<tr class="clickable tot" data-row="svc|${code}"><td>Total · full calculation</td><td class="r num">${money(u.total, 3)}</td></tr>`; })()}
    </tbody></table></div>
    <div class="tsec"><div class="tsec-h">Last 3 months (WMS)</div><table><tbody>${MONTHS.map((m, i) => `<tr><td>${m} 2026</td><td class="r num">${num(Math.round(l.vol * c.trend[i]))}</td></tr>`).join("")}<tr class="tot"><td>Average</td><td class="r num">${num(l.avg3)}</td></tr></tbody></table></div>
    <div class="tsec"><div class="tsec-h">This month</div><div class="formula">Should bill = ${num(l.vol)} × ${money(l.rate)} = ${money(l.expected)}<br>Billed in Xero = ${money(l.billed)}<br>Cost = ${num(l.vol)} × ${money(l.unitCost)} = ${money(l.cost)}<br>Margin = ${money(l.billed - l.cost)}</div></div>
    <div class="tsec"><div class="tsec-h">Rate in each system</div><table><tbody><tr><td>CLM</td><td class="r num">${money(l.rate)}</td></tr><tr><td>Dyspatch</td><td class="r num">${dy != null ? money(dy) : money(l.rate)}</td></tr><tr><td>WMS</td><td class="r num">${wm ? esc(wm) : money(l.rate)}</td></tr></tbody></table>${dy != null || wm ? '<span class="pill p-red">don\'t match</span>' : '<span class="pill p-green">match</span>'}</div>
    <div class="row"><button class="btn" data-review="${cid}">Rate review for ${esc(c.short)}</button><button class="btn" data-goto="model|Standard minutes">How the cost is built</button></div>`);
  }
  if (type === "wl") {
    const [rid, cid] = id.split("|"), r = REPORTS.find(x => x.id === rid), x = workload(r.per, cid)[0], per = r.per.toLowerCase();
    return (`<h3>${esc(x.c.name)} · ${esc(r.per)}</h3><dl class="dl"><dt>Orders</dt><dd class="num">${num(x.orders)}</dd><dt>Units</dt><dd class="num">${num(x.units)}</dd><dt>Units per order</dt><dd class="num">${x.upo.toFixed(2)}</dd><dt>Previous ${per}</dt><dd class="num">${num(x.prev)} · <span class="${x.chg >= 0 ? "delta-pos" : "delta-neg"}">${x.chg >= 0 ? "▲" : "▼"} ${pct(Math.abs(x.chg))}</span></dd></dl>
    <div class="tsec"><div class="tsec-h">Orders by number of SKUs</div><table><tbody>${["1 SKU", "2 SKUs", "3 SKUs", "4+ SKUs"].map((lb, i) => `<tr><td>${lb}</td><td class="r num">${num(Math.round(x.mix[i] * x.orders))}</td><td class="r num">${pct(x.mix[i], 0)}</td></tr>`).join("")}</tbody></table></div>
    <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="small">Each order's lines are counted from the WMS (Thomax PCK1, later Logiwa); an order with 3 different SKUs counts as "3 SKUs". Previous ${per} uses the same rule for the period before.</div></div>
    <div class="row"><button class="btn" data-client="${x.c.id}">Client cost to serve</button></div>`);
  }
  if (type === "kpi") {
    const k = Object.values(KPIS).flat().find(x => x[0] === id), h = KPI_HOW[id] || ["Formula set at build time from the source data", "See Data sources"];
    return (`<h3>${esc(id)}</h3><dl class="dl"><dt>Value</dt><dd><strong>${esc(k[1])}</strong></dd><dt>Change</dt><dd>${esc(k[2])}</dd>${k[3] ? `<dt>Note</dt><dd>${esc(k[3])}</dd>` : ""}</dl>
    <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">${esc(h[0])}</div></div><div class="tsec"><div class="tsec-h">Source</div><div class="small">${esc(h[1])}</div></div>
    <div class="tsec"><div class="tsec-h">History</div><div class="small muted">Monthly values with the trend appear here in the real app.</div></div>`);
  }
  if (type === "rc") {
    const [cid, code] = id.split("|"), c = cl(cid), dy = DYSPATCH_RATE[id], wm = WMS_RATE[id];
    return (`<h3>Rate check · ${esc(c.short)} · ${esc(C(code).name)}</h3><table><tbody><tr><td>CLM (master)</td><td class="r num">${money(c.rates[code])}</td></tr><tr><td>Dyspatch</td><td class="r num">${dy != null ? money(dy) : money(c.rates[code])}</td></tr><tr><td>WMS</td><td class="r num">${wm ? esc(wm) : money(c.rates[code])}</td></tr></tbody></table>
    <div class="callout" style="margin-top:8px">CLM is the master, but Dyspatch sometimes holds the newer, correct price. You decide which is right; this app never changes Dyspatch or the WMS.</div>
    <div class="actions"><button class="btn" data-act="clmupd" data-c="${esc(c.short)}">CLM is wrong · update CLM</button><button class="btn" data-act="extask" data-c="${esc(c.short)}">Other system is wrong · create task</button></div>`);
  }
  if (type === "api") {
    const a = APIIN.find(x => x.n === id);
    return (`<h3>${esc(a.n)}</h3><dl class="dl"><dt>Category</dt><dd>${esc(a.cat)}</dd><dt>How</dt><dd>${esc(a.how)}</dd><dt>Access</dt><dd>${esc(a.acc)}</dd><dt>Status</dt><dd>${esc(a.st)}${a.end ? " · ends " + a.end : ""}</dd><dt>Last sync</dt><dd>${esc(a.sync)}</dd><dt>Data stored</dt><dd>${esc(a.data)}</dd></dl>
    <div class="tsec"><div class="tsec-h">Sync history</div><ul class="tl">${a.sync !== "—" ? `<li class="k-out"><div class="tl-h"><strong>${esc(a.sync)}</strong> sync OK</div><div class="tl-b">Demo entry</div></li>` : ""}<li><div class="tl-h"><strong>22/10/2026</strong> connection added to the app</div></li></ul></div>`);
  }
  if (type === "key") {
    const k = KEYS.find(x => x.last4 === id);
    return (`<h3>Key for ${esc(k.app)}</h3><dl class="dl"><dt>Purpose</dt><dd>${esc(k.who)}</dd><dt>Key</dt><dd class="mono">fa_an_••••${k.last4}</dd><dt>Can read</dt><dd>${k.scopes.map(esc).join(" · ")}</dd><dt>Created</dt><dd>${k.created}</dd><dt>Expires</dt><dd>${k.exp}</dd><dt>Status</dt><dd>${k.st}</dd></dl>
    <div class="tsec"><div class="tsec-h">Usage log</div><div class="small muted">${k.used === "not yet" ? "Not used yet." : "Calls by day appear here."}</div></div>${k.st === "Active" ? `<div class="row"><button class="btn danger" data-revoke="${k.last4}">Revoke</button></div>` : ""}`);
  }
  if (type === "user") {
    const u = USERS.find(x => x.id === id);
    return (`<h3>${esc(u.name)}</h3><dl class="dl"><dt>Email</dt><dd>${esc(u.email)}</dd><dt>Role</dt><dd>${esc(u.role)}</dd><dt>2FA</dt><dd>${u.tfa ? "on" : "not set up"}</dd><dt>Status</dt><dd>${u.st}</dd><dt>Last login</dt><dd>${esc(u.last)}</dd></dl>
    <div class="tsec"><div class="tsec-h">Activity</div><ul class="tl"><li class="k-in"><div class="tl-h"><strong>${esc(u.last)}</strong> signed in</div></li></ul></div>`);
  }
  if (type === "file") {
    const f = DS.files[+id];
    return (`<h3>${esc(f.n)}</h3><dl class="dl"><dt>Source</dt><dd>3PLWMS export (manual upload)</dd><dt>Period</dt><dd>${f.p}</dd><dt>Rows</dt><dd class="num">${num(f.r)}</dd><dt>Added</dt><dd>${f.d}</dd></dl>
    <div class="tsec"><div class="tsec-h">Checks</div><div class="small">${f.ok ? "No duplicate orders, no date overlap with Thomax." : "3 days overlap with Thomax data. Overlapping rows were not imported twice; check which system is right for those days."}</div></div>`);
  }
}
function rowPanel(type, id) { drawer(() => rowHTML(type, id)); }

/* ================= DRAWERS ================= */
function leakHTML(id) {
  const M = model(), L = LEAK.find(x => x.id === id), c = M.clients.find(x => x.id === L.client), l = c.lines.find(x => x.code === L.code);
  const work = l ? `<div class="formula">Should bill = ${num(l.vol)} ${esc(l.s.unit)}s (WMS) × ${money(l.rate)} (CLM) = ${money(l.expected)}<br>Billed in Xero = ${money(l.billed)}<br>Gap = ${money(l.gap)}</div>`
    : `<div class="formula">Weekly total (postage + processing) for weeks ending 07/09, 14/09, 21/09: $210, $140, $140<br>Minimum $300 a week → top-ups $90 + $160 + $160 = $410.00<br>Top-up lines in Xero: none</div>`;
  return (`<div class="row" style="justify-content:space-between"><h3>${esc(c.short)} · ${l ? esc(l.s.name) : "Weekly minimum"}</h3>${stPill(L.status)}</div>
  <dl class="dl"><dt>Type</dt><dd>${esc(L.kind)}</dd><dt>Month</dt><dd>${esc(L.month)}</dd><dt>Cause</dt><dd>${esc(L.cause)}</dd>${L.inv ? `<dt>Recovered on</dt><dd><a class="ref" href="https://go.xero.com" target="_blank" rel="noopener">${L.inv}</a></dd>` : ""}</dl>
  <div class="tsec"><div class="tsec-h">Working</div>${work}</div>
  <div class="tsec"><div class="tsec-h">Sources</div><div class="small">Volume: Thomax export 03/10/2026 · Rate: CLM contract · Billed: Xero invoice lines</div></div>
  <div class="callout">The app does not change Xero. "Create task" asks David to fix it by hand; "Recovered" records the Xero invoice once it's raised.</div>
  ${L.status !== "Recovered" ? `<div class="actions">${leakActions(L)}</div>` : ""}`);
}
function leakPanel(id) { drawer(() => leakHTML(id)); }
function clientPanel(id) { drawer(() => clientHTML(id)); }
function taskPanel(id) { drawer(() => taskHTML(id)); }

/* ================= RENDER & EVENTS ================= */
function render() {
  const M = model();
  $("#nav").innerHTML = navHTML(false); $("#nav2").innerHTML = navHTML(true);
  $("#crumb").innerHTML = esc(PAGES[cur].label) + (sub && sub !== "Overview" && PAGES[cur].subs.length ? ` <span>/ ${esc(sub)}</span>` : "");
  const f = { overview: pOverview, cost: pCost, leakage: pLeakage, improve: pImprove, rates: pRates, reports: pReports, kpi: () => sub === "Overview" ? pKpiOverview() : pKpi(), finance: pFinance, tasks: pTasks, data: pData, apis: pApis, settings: pSettings }[cur];
  $("#view").innerHTML = withSub(f(M));
  $("#sharebtn").hidden = !["overview", "cost", "leakage", "improve"].includes(cur);
  $("#perwrap").hidden = !PERIOD_PAGES.includes(cur);
  $("#perbtn").innerHTML = `${esc(PER === "Custom" ? PLABEL : PER + " · " + PLABEL)} ▾`;
  $("#perpop").innerHTML = perOpen ? perHTML() : "";
  $("#fcwrap").hidden = !FC_PAGES.includes(cur); $("#fc").checked = FC;
  $("#bn").textContent = NOTIFS.length; $("#bn").hidden = !NOTIFS.length;
}
document.addEventListener("click", (e) => {
  if (e.target.closest("input, select, textarea, label, a")) return;
  const t = e.target.closest("button, tr.clickable, .kpi.clickable, .ctk.clickable, [data-close], [data-closeall]"); if (!t) return;
  const d = t.dataset;
  if (d.closeall !== undefined) { closeAll(); return; }
  if (d.close !== undefined) { closeTop(); return; }
  if (extraClick(e, t, d)) return;
  if (d.nav) { NEWKEY = ""; CONFIRM = null; INVITE_ERR = ""; return go(d.nav); }
  if (d.go) { NEWKEY = ""; return go(d.go); }
  if (d.sub) { sub = d.sub; render(); return; }
  if (d.ds) { dsTab = d.ds; render(); return; }
  if (d.ov) { ovSel = ovSel === d.ov ? null : d.ov; render(); return; }
  if (d.cc) { ccTab = d.cc; render(); return; }
  if (d.share) { e.stopPropagation(); return shareDrawer(d.share); }
  if (d.rmto) { SHARE.to = SHARE.to.filter(x => x !== d.rmto); return renderStack(); }
  if (d.delrep) { REPORTS = REPORTS.filter(r => r.id !== d.delrep); go("reports"); toast("Report deleted."); return; }
  if (d.rmdom) { INTERNAL.domains = INTERNAL.domains.filter(x => x !== d.rmdom); render(); return; }
  if (d.rmint) { INTERNAL.people.splice(+d.rmint, 1); render(); toast("Removed. They can no longer receive internal reports or log in."); return; }
  if (d.sg) { const s = SUGG[+d.i];
    if (d.sg === "client") { CCON.find(c => c.client === s.guess)?.contacts.push({ name: "From " + s.src.split(" ")[0], email: s.email }); toast("Added to " + cl(s.guess).short + "."); }
    if (d.sg === "internal") { INTERNAL.people.push({ name: s.email.split("@")[0], email: s.email, login: false, note: "added from suggestions" }); toast("Added to Internal (no login until you turn it on)."); }
    SUGG.splice(+d.i, 1); render(); return; }
  if (d.lp !== undefined) { if (d.lp === "sent") { LOGINSTEP = 0; toast("If that email is a user, a reset link is on its way (valid 30 min)."); } else LOGINSTEP = d.lp === "forgot" ? 2 : +d.lp; render(); return; }
  if (d.uact) { const u = USERS.find(x => x.id === d.u);
    if (d.uact === "reset") toast("Reset link sent to " + u.email + ".");
    if (d.uact === "tfa") { u.tfa = false; toast(u.name + " sets up 2FA again at next login."); }
    if (d.uact === "resend") toast("Invitation sent again to " + u.email + ".");
    if (d.uact === "remove") CONFIRM = u.id;
    if (d.uact === "removeno") CONFIRM = null;
    if (d.uact === "removeyes") { USERS = USERS.filter(x => x.id !== d.u || x.role === "Owner"); CONFIRM = null; toast("User removed."); }
    render(); return; }
  if (d.revoke) { KEYS.find(k => k.last4 === d.revoke).st = "Revoked"; render(); toast("Key revoked. That app can no longer read."); return; }
  if (d.review) { e.stopPropagation(); rateClient = d.review; closeAll(); return go("rates"); }
  if (d.leakact) {
    e.stopPropagation(); const L = LEAK.find(x => x.id === d.id);
    if (d.leakact === "task") { L.status = "Task created"; const id = "T" + (TASKS.length + 1); TASKS.unshift({ id, pr: "High", topic: L.kind, co: cl(L.client).name, where: "Xero", what: "Fix by hand: " + L.cause, why: "From leakage " + L.id, owner: "David", age: 0, st: "open" }); toast("Task created for David. Xero not changed."); }
    if (d.leakact === "explain") { L.status = "Explained"; toast("Marked as explained."); }
    if (d.leakact === "rec") { L.status = "Recovered"; L.recovered = Math.round(leakAmount(L, model())); L.inv = "INV-219" + Math.floor(10 + Math.random() * 89); toast("Recorded as recovered."); }
    closeAll(); render(); return;
  }
  if (d.done) { e.stopPropagation(); resolveTask(d.done); render(); renderStack(); return; }
  if (d.reopen) { e.stopPropagation(); const t = TASKS.find(x => x.id === d.reopen); t.st = "open"; t.passNext = false; logX("task|" + t.id, "Re-opened"); render(); renderStack(); return; }
  if (d.act) {
    e.stopPropagation();
    const M = model();
    switch (d.act) {
      case "applytarget": { const c = M.clients.find(x => x.id === rateClient); c.lines.filter(l => !l.s.unbilled).forEach(l => { const need = l.unitT / (1 - target); if (l.rate < need) newRates[c.id + "|" + l.code] = Math.ceil(need * 20) / 20; }); render(); toast("Lines below target raised; others unchanged."); break; }
      case "resetrates": Object.keys(newRates).filter(k => k.startsWith(rateClient + "|")).forEach(k => delete newRates[k]); render(); break;
      case "sendclm": toast("Schedule of rates sent to CLM as an amendment draft (demo)."); break;
      case "sendtest": toast("Test report sent to Asal (demo)."); break;
      case "study": toast("Time study task added (demo)."); break;
      case "clmupd": toast(d.c + ": CLM rate updated in our own app only (demo)."); break;
      case "extask": toast(d.c + ": task created to fix the other system by hand (demo)."); break;
      case "addto": { const v = $("#sh-to").value; if (!v) break; const ok = SHARE.r.cls === "External finance" ? LENDERS.some(l => l.email === v) : isInternal(v) || (SHARE.r.cls === "Client-safe" && clientOf(v) === SHARE.r.client); if (!ok) { toast("Blocked: not allowed for this report."); break; } if (!SHARE.to.includes(v)) SHARE.to.push(v); renderStack(); break; }
      case "addlender": { const n = $("#al-n").value.trim(), em = $("#al-e").value.trim().toLowerCase(); if (!n || !em.includes("@")) { toast("Add a name and email."); break; } LENDERS.push({ name: n, email: em }); render(); toast("Added to Lenders & advisers."); break; }
      case "sendnow": if (!SHARE.to.length) { toast("Add at least one recipient."); break; } toast(SHARE.r.cls === "Client-safe" ? "Checks passed. Draft created in Front for your review (demo)." : SHARE.r.cls === "External finance" ? "Approved pack sent to lenders & advisers via Front (demo)." : "Checks passed. PDF sent via Front (demo)" + (SHARE.costing ? " · " + ({ T: "TDABC only", F: "Full absorption only", B: "both views" })[SHARE.vsel] : "") + "."); closeAll(); break;
      case "pdfprev": toast("PDF preview opens in the real app (demo)."); break;
      case "savesched": { const r = REPORTS.find(x => x.id === SHARE.id); if (r) { r.on = $("#sh-on").checked; r.sched = $("#sh-f").value; } toast("Schedule saved (" + $("#sh-m").value + ")."); closeAll(); render(); break; }
      case "saverep": { const n = $("#nr-n").value.trim(); if (!n) { toast("Give the report a name."); break; } const cls = $("#nr-c").value, clt = $("#nr-cl").value;
        if (cls === "Client-safe" && !clt) { toast("Client-safe reports need one client."); break; }
        REPORTS.push({ id: "r" + Date.now(), name: n, tpl: $("#nr-t").value, per: $("#nr-p").value, cls, client: clt || undefined, sched: "Off", on: false }); go("reports", n); toast("Report added to the menu."); break; }
      case "adddom": { const v = $("#ad-d").value.trim().replace(/^@/, "").toLowerCase(); if (v && !INTERNAL.domains.includes(v)) INTERNAL.domains.push(v); render(); break; }
      case "addint": { const n = $("#ai-n").value.trim(), em = $("#ai-e").value.trim().toLowerCase(); if (!n || !em.includes("@")) { toast("Add a name and email."); break; } INTERNAL.people.push({ name: n, email: em, login: true }); render(); toast("Added to Internal."); break; }
      case "addcc": { const c = $("#ac-c").value, n = $("#ac-n").value.trim(), em = $("#ac-e").value.trim().toLowerCase(); if (!n || !em.includes("@")) { toast("Add a name and email."); break; } if (isInternal(em)) { toast("That address is internal."); break; } let row = CCON.find(x => x.client === c); if (!row) { row = { client: c, domains: [em.split("@")[1]], contacts: [], st: "Active" }; CCON.push(row); } row.contacts.push({ name: n, email: em }); render(); toast("Contact added."); break; }
      case "invite": { const n = $("#nu-n").value.trim(), em = $("#nu-e").value.trim().toLowerCase(), r = "No role yet";
        if (!n || !em) INVITE_ERR = "Add a name and email.";
        else if (!isInternal(em)) INVITE_ERR = "Only people on the Internal list (Contacts & recipients) can be users.";
        else if (USERS.some(u => u.email === em)) INVITE_ERR = "That person is already a user.";
        else { INVITE_ERR = ""; USERS.push({ id: "u" + Date.now(), name: n, email: em, role: r, pay: false, tfa: false, st: "Invited", last: "—" }); toast("Invitation sent to " + em + "."); }
        render(); break; }
      case "savecompany": document.querySelectorAll("[data-co]").forEach(el => { if (el.dataset.co !== "tz") COMPANY[el.dataset.co] = el.value.trim() || COMPANY[el.dataset.co]; }); document.querySelector(".topbar .co").textContent = COMPANY.name; toast("Saved."); break;
      case "brandreset": Object.assign(brand, BRAND_DEFAULT); applyBrand(); render(); toast("Back to FA brand colours and logo."); break;
      case "mkkey": { const app = ($("#kapp").value || "").trim(); const sc = [...document.querySelectorAll("[data-scope]:checked")].map(x => x.dataset.scope);
        if (!app || !sc.length) { toast("Add the app name and tick at least one item."); break; }
        const rnd = Array.from({ length: 32 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]).join("");
        NEWKEY = "fa_an_" + rnd; const ex = $("#kexp").value;
        KEYS.push({ app, who: "Added 22/10/2026", scopes: sc, last4: rnd.slice(-4), created: "22/10/2026", exp: ex === "never" ? "never" : ex.replace("in ", "+"), used: "not yet", st: "Active" }); render(); break; }
      case "copykey": navigator.clipboard?.writeText(NEWKEY).then(() => toast("Copied."), () => toast("Select the key and copy it.")); break;
      case "testconn": toast(d.n + ": connection OK (demo)."); break;
      case "pullmore": DS.pulled += DS.perNight; render(); toast("Pulled and stored (demo)."); break;
      case "upload3pl": DS.files.push({ n: "3plwms_orders_part" + (DS.files.length + 1) + ".csv", p: "07/2026–09/2026", r: 3115, ok: DS.files.length !== 1, d: "22/10/2026" }); render(); toast("File checked and added (demo)."); break;
      case "src": toast(d.n + ": demo only, nothing connected."); break;
      case "newkey": toast("New key shown once in the real app (demo)."); break;
      case "comment": toast("Comment saved (demo)."); break;
    }
    return;
  }
  if (d.row) { const i = d.row.indexOf("|"); return rowPanel(d.row.slice(0, i), d.row.slice(i + 1)); }
  if (d.goto) { closeAll(); const [k, s] = d.goto.split("|"); return go(k, s); }
  if (d.client) return clientPanel(d.client);
  if (d.leak) return leakPanel(d.leak);
  if (d.task) return taskPanel(d.task);
});
document.addEventListener("change", (e) => {
  const el = e.target, d = el.dataset, v = parseFloat(el.value);
  if (extraChange(el, d)) return;
  if (el.id === "rc") { rateClient = el.value; render(); return; }
  if (el.id === "tg" && !isNaN(v)) { target = v / 100; return; }
  if (d.urole) { USERS.find(u => u.id === d.urole).role = el.value; render(); toast("Role changed."); return; }
  if (d.upay) { USERS.find(u => u.id === d.upay).pay = el.checked; render(); return; }
  if (d.uplogo) { const f = el.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { brand[d.uplogo] = rd.result; applyBrand(); render(); toast("Logo updated."); }; rd.readAsDataURL(f); return; }
  if (isNaN(v)) return;
  if (d.nr) { newRates[rateClient + "|" + d.nr] = v; render(); return; }
  if (d.min) { C(d.min).min = v; C(d.min).basis = C(d.min).basis === "Estimate" ? "Estimate" : C(d.min).basis; render(); toast("Costs recalculated."); return; }
  if (d.util) { POOLS[d.util].util = v / 100; render(); toast("Costs recalculated."); return; }
  if (d.urole) { USERS.find(u => u.id === d.urole).role = el.value; render(); toast("Role changed."); return; }
  if (d.upay) { USERS.find(u => u.id === d.upay).pay = el.checked; render(); return; }
  if (d.sec) { SEC[d.sec] = +el.value; render(); return; }
  if (d.uplogo) { const f = el.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { brand[d.uplogo] = rd.result; applyBrand(); render(); toast("Logo updated."); }; rd.readAsDataURL(f); return; }
  if (d.rule) { RULES[d.rule] = d.rule === "floor" ? v / 100 : v; render(); return; }
});
document.addEventListener("input", (e) => { const k = e.target.dataset?.bc; if (!k) return; brand[k] = e.target.value; applyBrand(); const sp = e.target.parentElement.querySelector(".mono"); if (sp) sp.textContent = e.target.value.toUpperCase(); });
// sidebar pin / peek (same behaviour as the Hub)
let pinned = true; try { pinned = localStorage.getItem("fa-an-pin") !== "0"; } catch (e) {}
const applyPin = () => { document.body.classList.toggle("pinned", pinned); $("#pin").setAttribute("aria-pressed", pinned); };
$("#pin").addEventListener("click", (e) => { e.stopPropagation(); pinned = !pinned; try { localStorage.setItem("fa-an-pin", pinned ? "1" : "0"); } catch (x) {} applyPin(); });
$("#side").addEventListener("mouseenter", () => { if (!pinned && innerWidth > 900) document.body.classList.add("peek"); });
$("#side").addEventListener("mouseleave", () => { if (innerWidth > 900) document.body.classList.remove("peek"); });
$("#menubtn").addEventListener("click", () => document.body.classList.toggle("peek"));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTop(); });
applyPin(); applyBrand(); render();
})();
