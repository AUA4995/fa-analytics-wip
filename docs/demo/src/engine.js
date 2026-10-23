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
      const s = C(code), vol = c.vols[code], uT = clientUnit(code, "T", c), uF = clientUnit(code, "F", c), u = VAR === "T" ? uT : uF;
      const rate = s.unbilled ? 0 : c.rates[code], d = BILLED_DIFF[c.id + "|" + code] || {};
      const bQty = d.qty ?? vol, bRate = d.rate ?? rate, expected = vol * rate, billed = bQty * bRate;
      const avg3 = Math.round(vol * (c.trend[0] + c.trend[1] + c.trend[2]) / 3);
      return { code, s, vol, avg3, rate, unitCost: u.total, unitT: uT.total, unitF: uF.total, parts: u.parts, cost: vol * u.total, costT: vol * uT.total, costF: vol * uF.total,
        expected, billed, gap: expected - billed, unitMargin: rate - u.total, marginPct: rate ? (rate - u.total) / rate : null, marginPctT: rate ? (rate - uT.total) / rate : null };
    });
    const revenue = lines.reduce((a, l) => a + l.billed, 0), cost = lines.reduce((a, l) => a + l.cost, 0), costT = lines.reduce((a, l) => a + l.costT, 0), costF = lines.reduce((a, l) => a + l.costF, 0);
    const o = c.vols["ORD-FEE"];
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
