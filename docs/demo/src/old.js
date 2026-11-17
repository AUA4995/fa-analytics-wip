
(() => {
/* ================= COST ENGINE (pure, no DOM) ================= */
const MONTH = "September 2026", MONTHS = ["Jul", "Aug", "Sep"];
const ONCOST = { superRate: 0.12, payrollTax: 0.0545, workersComp: 0.021 };
const POOLS = {
  floor: { name: "Warehouse floor labour", who: "Pickers, packers, receivers, forklift drivers", staff: 30, gross: 171600, hours: 4680, util: 0.85 },
  csr:   { name: "CSR & account management", who: "CSR team, account executive", staff: 5, gross: 32500, hours: 780, util: 0.80 }
};
const OVH = [
  { id: "rent",  name: "Rent & occupancy", src: "Xero: Rent – Smithfield lease, Parramatta occupancy costs", amount: 92000, driver: "Pallet-weeks stored", unit: "pallet-week", total: 26000 },
  { id: "equip", name: "Machinery (forklifts, high reach, order pickers)", src: "Xero: Equipment lease, repairs & maintenance", amount: 14500, driver: "Pallet moves", unit: "move", total: 3100 },
  { id: "auto",  name: "Automation (CartonWrap, bubble wrap, Sure Sort, cubic scan)", src: "Xero: Equipment finance, service contracts", amount: 15600, driver: "Orders", unit: "order", total: 98000 },
  { id: "soft",  name: "Software (WMS, Dyspach, Xero, Front)", src: "Xero: Subscriptions", amount: 11200, driver: "Orders", unit: "order", total: 98000 },
  { id: "pkg",   name: "Packaging materials (house stock)", src: "Xero: packaging purchases account", amount: 24500, driver: "Orders packed", unit: "order", total: 58300 },
  { id: "admin", name: "Admin & management", src: "Xero: Admin wages, insurance, office, utilities", amount: 52000, driver: "Labour minutes", unit: "minute", total: null }
];
const SERVICES = [
  { code: "RCV-CTN", name: "Receiving – carton", unit: "carton", pool: "floor", min: 1.6, ovh: {}, basis: "Estimate" },
  { code: "RCV-PLT", name: "Receiving – pallet", unit: "pallet", pool: "floor", min: 14, ovh: { equip: 2 }, basis: "Estimate" },
  { code: "STO-PLT", name: "Storage – pallet per week", unit: "pallet-week", pool: "floor", min: 0.5, ovh: { rent: 1 }, basis: "Estimate" },
  { code: "PCK-UNIT", name: "Pick – unit", unit: "unit", pool: "floor", min: 0.35, ovh: {}, basis: "WMS pick times" },
  { code: "ORD-FEE", name: "Order processing (pack)", unit: "order", pool: "floor", min: 1.9, ovh: { auto: 1, soft: 1 }, basis: "Estimate", warn: "WMS pack times are understated (scan before packing). Needs a floor time study." },
  { code: "PKG-STD", name: "Packaging – standard", unit: "order", pool: null, min: 0, ovh: { pkg: 1 }, basis: "Material only" },
  { code: "RTN", name: "Returns processing", unit: "return", pool: "floor", min: 5, ovh: {}, basis: "Estimate" },
  { code: "ACC-MGT", name: "Account management", unit: "Front ticket", pool: "csr", min: 14, ovh: {}, basis: "Estimate", unbilled: true }
];
const C = (code) => SERVICES.find(s => s.code === code);
const BILLABLE = SERVICES.filter(s => !s.unbilled).map(s => s.code);
const order = ["RCV-CTN", "RCV-PLT", "STO-PLT", "PCK-UNIT", "ORD-FEE", "PKG-STD", "RTN", "ACC-MGT"];
const mk = (arr) => Object.fromEntries(order.map((c, i) => [c, arr[i]]));
const mr = (arr) => Object.fromEntries(order.slice(0, 7).map((c, i) => [c, arr[i]]));
const CLIENTS = [
  { id: "mwu", name: "MWU – The Way Up Nutrition", short: "MWU", type: "B2C", site: "Parramatta", renew: "31/01/2027", vols: mk([220, 60, 1560, 16500, 9800, 9800, 140, 38]), rates: mr([1.60, 18, 6.50, 0.32, 2.10, 0.55, 4.50]), trend: [0.93, 0.97, 1], review: "In progress (Paul, Krystal, David)" },
  { id: "kora", name: "Kora Organics", short: "Kora", type: "B2C", site: "Smithfield", renew: "30/06/2027", vols: mk([80, 22, 607, 9600, 4200, 4200, 60, 22]), rates: mr([1.60, 24, 7.50, 0.38, 2.60, 0.60, 5.50]), trend: [1.04, 0.99, 1] },
  { id: "lmnd", name: "LMND", short: "LMND", type: "B2C", site: "Smithfield", renew: "28/02/2027", vols: mk([150, 30, 820, 10400, 6100, 6100, 180, 19]), rates: mr([1.80, 25, 6.80, 0.36, 2.45, 0.55, 5.00]), trend: [0.95, 0.98, 1] },
  { id: "elacia", name: "Elacia", short: "Elacia", type: "B2C", site: "Smithfield", renew: "31/03/2027", vols: mk([60, 12, 390, 4800, 2600, 2600, 40, 9]), rates: mr([2.00, 26, 7.20, 0.40, 2.80, 0.65, 6.00]), trend: [1, 1.02, 1] },
  { id: "11mode", name: "11MODE", short: "11MODE", type: "B2C + US", site: "Smithfield", renew: "15/12/2026", vols: mk([40, 18, 520, 5200, 3100, 3100, 95, 14]), rates: mr([1.80, 24, 7.00, 0.40, 2.70, 0.60, 5.50]), trend: [0.9, 0.96, 1] },
  { id: "colx", name: "Collagen X", short: "Collagen X", type: "B2C", site: "Parramatta", renew: "31/05/2027", vols: mk([90, 16, 450, 7300, 3900, 3900, 30, 11]), rates: mr([1.80, 22, 6.50, 0.34, 2.40, 0.55, 5.00]), trend: [0.97, 1.01, 1] },
  { id: "sony", name: "Sony Music", short: "Sony Music", type: "B2B + D2C", site: "Smithfield", renew: "31/12/2026", vols: mk([640, 48, 1150, 21800, 1900, 600, 20, 64]), rates: mr([1.50, 20, 6.00, 0.45, 3.20, 0.80, 6.00]), trend: [0.82, 1.1, 1] },
  { id: "coastal", name: "Coastal Grl", short: "Coastal Grl", type: "B2C", site: "Smithfield", renew: "18/08/2027", vols: mk([35, 8, 210, 3100, 2300, 2300, 70, 27]), rates: mr([2.00, 26, 7.50, 0.40, 2.75, 0.60, 5.50]), trend: [0.55, 0.8, 1] }
];
// What Xero shows as billed in September, where it differs from WMS volume × CLM rate
const BILLED_DIFF = {
  "sony|PCK-UNIT": { qty: 18560 },
  "mwu|STO-PLT": { qty: 1430 },
  "lmnd|PKG-STD": { qty: 5480 },
  "kora|RCV-CTN": { qty: 0 },
  "11mode|RTN": { rate: 4.50 }
};
const DYSPATCH_RATE = { "11mode|RTN": 4.50, "lmnd|ORD-FEE": 2.55 };
const WMS_RATE = { "sony|PCK-UNIT": "0.00 on 41 per-artist codes" };

function poolCost(p) {
  const gross = p.gross, sup = gross * ONCOST.superRate, ptax = (gross + sup) * ONCOST.payrollTax, wc = gross * ONCOST.workersComp;
  const total = gross + sup + ptax + wc, minutes = p.hours * 60 * p.util;
  return { gross, sup, ptax, wc, total, minutes, cpm: total / minutes };
}
function model() {
  const pools = Object.fromEntries(Object.entries(POOLS).map(([k, p]) => [k, poolCost(p)]));
  const labourMin = Object.values(pools).reduce((a, p) => a + p.minutes, 0);
  const ovhRate = {};
  OVH.forEach(o => { const t = o.id === "admin" ? labourMin : o.total; ovhRate[o.id] = o.amount / t; });
  const unit = {};
  SERVICES.forEach(s => {
    const lab = s.pool ? s.min * pools[s.pool].cpm : 0;
    const adm = s.pool ? s.min * ovhRate.admin : 0;
    const oth = Object.entries(s.ovh).reduce((a, [k, n]) => a + n * ovhRate[k], 0);
    unit[s.code] = { lab, adm, oth, total: lab + adm + oth };
  });
  const clients = CLIENTS.map(c => {
    const lines = order.map(code => {
      const s = C(code), vol = c.vols[code], cost = vol * unit[code].total;
      const rate = s.unbilled ? 0 : c.rates[code];
      const d = BILLED_DIFF[c.id + "|" + code] || {};
      const bQty = d.qty ?? vol, bRate = d.rate ?? rate;
      const expected = vol * rate, billed = bQty * bRate;
      const avg3 = Math.round(vol * (c.trend[0] + c.trend[1] + c.trend[2]) / 3);
      return { code, s, vol, avg3, rate, unitCost: unit[code].total, cost, expected, billed, gap: expected - billed,
        unitMargin: rate - unit[code].total, marginPct: rate ? (rate - unit[code].total) / rate : null };
    });
    const revenue = lines.reduce((a, l) => a + l.billed, 0), cost = lines.reduce((a, l) => a + l.cost, 0);
    return { ...c, lines, revenue, cost, margin: revenue - cost, marginPct: (revenue - cost) / revenue };
  });
  return { pools, labourMin, ovhRate, unit, clients };
}

/* ================= DEMO STATE ================= */
const RULES = { floor: 0.15, tolerance: 5, avgMonths: 3, wkMin: 300 };
let LEAK = [
  { id: "L1", client: "sony", code: "PCK-UNIT", month: "Sep 2026", kind: "Under-billing", cause: "Picks logged on legacy per-artist codes priced at $0.00 in the WMS", status: "Task created", task: "T1" },
  { id: "L2", client: "mwu", code: "STO-PLT", month: "Sep 2026", kind: "Under-billing", cause: "Storage billed on 330 pallets; WMS shows 360 for the month", status: "Recovered", recovered: 845, inv: "INV-21874" },
  { id: "L3", client: "coastal", code: "WK-MIN", month: "Sep 2026", kind: "Under-billing", cause: "Levy period ended 01/09/2026; $300 weekly minimum not topped up in 3 weeks", status: "Open", fixed: 410 },
  { id: "L4", client: "lmnd", code: "PKG-STD", month: "Sep 2026", kind: "Under-billing", cause: "620 manual-pack orders had no packaging charge", status: "Open" },
  { id: "L5", client: "kora", code: "RCV-CTN", month: "Sep 2026", kind: "Under-billing", cause: "Carton receiving charge code missing on Kora's WMS rate card", status: "Task created", task: "T4" },
  { id: "L6", client: "11mode", code: "RTN", month: "Sep 2026", kind: "Rate mismatch", cause: "CLM says $5.50; Dyspach billed $4.50. A person decides which is right", status: "Open" }
];
let TASKS = [
  { id: "T1", pr: "High", topic: "Under-billing", co: "Sony Music", where: "WMS", what: "Collapse 41 per-artist pick codes into PCK-UNIT ($0.45)", why: "3,240 picks billed at $0.00 in September", owner: "Paul", age: 6, st: "open" },
  { id: "T2", pr: "High", topic: "Back-bill", co: "Coastal Grl", where: "Xero", what: "Raise top-up invoice for weekly minimum, 3 weeks of September", why: "$410.00 not billed. Fix by hand in Xero", owner: "David", age: 3, st: "open" },
  { id: "T3", pr: "Medium", topic: "Rate mismatch", co: "11MODE", where: "CLM / Dyspach", what: "Confirm returns rate: CLM $5.50 vs Dyspach $4.50", why: "If Dyspach is right, update CLM. If CLM is right, fix Dyspach by hand", owner: "Asal", age: 2, st: "open" },
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
  api: '<path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8"/>',
  kpi: '<path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="2"/>',
  tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  data: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'
};
const PAGES = {
  overview: { label: "Overview", ic: "overview", subs: [] },
  clients: { label: "Cost to serve", ic: "clients", subs: ["Overview", "By client", "By service", "Below cost"] },
  leakage: { label: "Leakage", ic: "leak", subs: ["Overview", "Under-billing", "Under-pricing", "Rate checks", "Leakage log"] },
  rates: { label: "Rate review", ic: "rates", subs: [] },
  reports: { label: "Reports", ic: "report", subs: [] },
  kpi: { label: "KPI", ic: "kpi", subs: ["Operations", "People", "Finance", "Warehouse", "Quality & clients"] },
  model: { label: "Cost model", ic: "model", subs: ["Overview", "Cost pools", "Labour", "Standard minutes", "Overhead drivers"] },
  tasks: { label: "Tasks", ic: "tasks", subs: ["Open", "Done"] },
  data: { label: "Data sources", ic: "data", subs: [], bottom: true },
  apis: { label: "API connections", ic: "api", subs: ["Connected to", "Keys we give out"], bottom: true },
  settings: { label: "Settings", ic: "settings", subs: ["Company", "Users", "Contacts & recipients", "Login & security", "Branding", "Rules"], bottom: true }
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
  { n: "Dyspach", cat: "Contracts & rates", how: "File upload", acc: "—", st: "Files only", sync: "—", data: "—" },
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

/* ================= PAGES ================= */
function withSub(body) {
  const p = PAGES[cur];
  if (cur === "reports") p.subs = [...REPORTS.map(r => r.name), "+ New report"];
  if (!p.subs.length) return `<div class="nosub">${body}</div>`;
  return `<div class="withsub"><nav class="subnav">${p.subs.map(s => `<button data-sub="${s}" aria-current="${s === sub}">${s}</button>`).join("")}</nav><div class="subbody">${body}</div></div>`;
}
const show = (name) => sub === "Overview" || sub === name;

let ovSel = null;
const MON12 = ["Oct 25", "Nov", "Dec", "Jan 26", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const FA = { orders12: [86400, 91200, 104800, 82100, 84900, 90300, 92600, 95100, 93800, 94700, 96200, 98000], casualShare: 0.25, revPerOrder: 5.26 };
function breakeven(M) {
  const floor = M.pools.floor.total, csr = M.pools.csr.total;
  const pkg = OVH.find(o => o.id === "pkg").amount, otherOvh = OVH.filter(o => o.id !== "pkg").reduce((a, o) => a + o.amount, 0);
  const variable = pkg + floor * FA.casualShare, fixed = floor * (1 - FA.casualShare) + csr + otherOvh;
  const orders = FA.orders12[11], varPerOrder = variable / orders, contrib = FA.revPerOrder - varPerOrder;
  const be = fixed / contrib;
  return { fixed, variable, orders, varPerOrder, contrib, be, safety: (orders - be) / orders };
}
function lineChart(series, opts) {
  const W = 640, H = 220, L = 52, R = 16, T = 18, B = 28, n = series[0].v.length;
  const all = series.flatMap(s => s.v).concat((opts.lines || []).map(l => l.v));
  const min = opts.min ?? Math.min(...all) * 0.95, max = opts.max ?? Math.max(...all) * 1.05;
  const x = (i) => L + i * (W - L - R) / (n - 1), y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  let g = ""; const step = (max - min) / 4;
  for (let k = 0; k <= 4; k++) { const v = min + step * k; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${opts.fmt(v)}</text>`; }
  const labels = opts.labels.map((m, i) => (i % 2 === 0 || i === n - 1) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${m}</text>` : "").join("");
  const refs = (opts.lines || []).map(l => `<line x1="${L}" x2="${W - R}" y1="${y(l.v)}" y2="${y(l.v)}" stroke="${l.c}" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W - R}" y="${y(l.v) - 5}" text-anchor="end" style="fill:${l.c};font-weight:600">${l.t}</text>`).join("");
  const paths = series.map(s => { const d = s.v.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(""); const last = s.v[n - 1];
    return `${s.area ? `<path d="${d}L${x(n - 1)},${y(min)}L${x(0)},${y(min)}Z" fill="${s.c}" opacity=".10"/>` : ""}<path d="${d}" fill="none" stroke="${s.c}" stroke-width="2.2"/><circle cx="${x(n - 1)}" cy="${y(last)}" r="4" fill="${s.c}"/><text x="${x(n - 1) - 6}" y="${y(last) - 9}" text-anchor="end" style="fill:var(--ink);font-weight:600">${opts.fmt(last)}</text>`; }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}">${g}${refs}${paths}${labels}</svg></div>`;
}
function barChart(vals, labels, opts) {
  const W = 640, H = 200, L = 44, R = 10, T = 16, B = 26, n = vals.length, max = Math.max(...vals) * 1.12;
  const bw = (W - L - R) / n, y = (v) => T + (1 - v / max) * (H - T - B);
  let g = ""; for (let k = 0; k <= 3; k++) { const v = max / 3 * k; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${opts.fmt(v)}</text>`; }
  const bars = vals.map((v, i) => `<rect x="${L + i * bw + bw * 0.18}" y="${y(v)}" width="${bw * 0.64}" height="${y(0) - y(v)}" rx="2" fill="${i === n - 1 ? "var(--blue)" : "var(--blue-light)"}"/>${i % 2 === 0 || i === n - 1 ? `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${labels[i]}</text>` : ""}`).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}">${g}${bars}</svg></div>`;
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
    ["margin", "Services margin", pct(mg), `floor ${pct(RULES.floor, 0)} · ▼ ${(12.9 - mg * 100).toFixed(1)} pts vs Aug`, mg < RULES.floor ? "amber" : ""],
    ["leak", "Leakage found", m0(leakTot), `a month · ${LEAK.filter(L => L.status === "Open").length} open · ${m0(rec)} recovered`, ""],
    ["below", "Priced below cost", m0(sub$), `a month · ${below.length} service lines`, "red"],
    ["orders", "Orders", num(o[11]), `${MONTH} · ${oChg >= 0 ? "▲" : "▼"} ${pct(Math.abs(oChg))} vs Aug`, ""],
    ["be", "Break-even", num(Math.round(be.be / 100) * 100) + " orders", `a month · now ${num(be.orders)} · ${pct(be.safety, 0)} above`, be.safety < 0.1 ? "amber" : "green"]
  ];
  const showB = (k) => !ovSel || ovSel === k;
  const wl = workload("Week");
  let h = `<div class="ph"><div><h1>Good evening, Asal</h1><p>${MONTH} · click a card to see only its detail; click it again to see all</p></div></div>
  <div class="kpis tabtiles ovtiles">${tiles.map(t => `<button class="kpi ${t[4]}" data-ov="${t[0]}" aria-pressed="${ovSel === t[0]}"><div class="l">${t[1]}</div><div class="v">${t[2]}</div><div class="s">${t[3]}</div></button>`).join("")}</div>`;
  if (showB("margin")) h += `<div class="grid2"><div class="card"><h2>Services margin · 12 months</h2><p class="sub">Processing services, cost model method. Dashed: ${pct(RULES.floor, 0)} floor and the FY25-26 "before" average.</p>${lineChart([{ v: mTrend, c: "var(--blue)", area: true }], { labels: MON12, fmt: v => v.toFixed(1) + "%", min: 10, max: 18, lines: [{ v: RULES.floor * 100, c: "var(--amber)", t: "Floor 15%" }, { v: REPORT.baseline, c: "var(--header)", t: "Before " + REPORT.baseline + "%" }], aria: "Services margin by month" })}</div>
    <div class="card"><h2>Margin by client</h2><p class="sub">${MONTH}. Worst first. Click a client for the breakdown.</p><div class="tw"><table><tbody>${M.clients.slice().sort((a, b) => a.marginPct - b.marginPct).map(c => `<tr class="clickable" data-client="${c.id}"><td class="sup">${esc(c.short)}</td><td style="width:60%">${mbar(c.marginPct)}</td><td class="r num">${m0(c.margin)}</td></tr>`).join("")}</tbody></table></div></div></div>`;
  if (showB("leak")) h += `<div class="card"><h2>Leakage · open items</h2><p class="sub">Should have billed (CLM rate × WMS volume) vs billed in Xero. Leakage log started 29/09/2026, so there is no earlier trend yet.</p><div class="tw"><table><thead><tr><th>Client</th><th>Service</th><th class="r">Gap / month</th><th>Status</th></tr></thead><tbody>
    ${LEAK.slice().sort((a, b) => leakAmount(b, M) - leakAmount(a, M)).map(L => `<tr class="clickable" data-leak="${L.id}"><td class="sup">${esc(cl(L.client).short)}</td><td>${L.code === "WK-MIN" ? "Weekly minimum" : esc(C(L.code).name)}<div class="meta">${esc(L.kind)}</div></td><td class="r num">${money(leakAmount(L, M))}</td><td>${stPill(L.status)}</td></tr>`).join("")}</tbody></table></div></div>`;
  if (showB("below")) h += `<div class="card alert"><h2>Priced below cost</h2><p class="sub">Contract rate lower than our cost per unit. Fixed through a rate review.</p><div class="tw"><table><thead><tr><th>Client</th><th>Service</th><th class="r">Rate</th><th class="r">Cost</th><th class="r">$ / month</th><th></th></tr></thead><tbody>
    ${below.slice(0, 8).map(({ c, l }) => `<tr class="clickable" data-row="line|${c.id}|${l.code}"><td class="sup">${esc(c.short)}</td><td>${esc(l.s.name)}</td><td class="r num">${money(l.rate)}</td><td class="r num">${money(l.unitCost)}</td><td class="r num" style="color:var(--red)">${money(l.unitMargin * l.vol)}</td><td><button class="lnk" data-review="${c.id}">Rate review</button></td></tr>`).join("")}</tbody></table></div></div>`;
  if (showB("orders")) h += `<div class="grid2"><div class="card"><h2>Orders · 12 months</h2><p class="sub">All clients, from the WMS. December peak is seasonal.</p>${barChart(o, MON12, { fmt: v => Math.round(v / 1000) + "k", aria: "Orders by month" })}</div>
    <div class="card"><h2>This week vs last week</h2><p class="sub">Biggest growth and drops by client.</p><div class="tw"><table><tbody>${wl.slice().sort((a, b) => b.chg - a.chg).filter((x, i, a) => i < 3 || i >= a.length - 3).map(x => `<tr class="clickable" data-row="wl|r1|${x.c.id}"><td class="sup">${esc(x.c.short)}</td><td class="r num">${num(x.orders)}</td><td class="r num ${x.chg >= 0 ? "delta-pos" : "delta-neg"}">${x.chg >= 0 ? "▲" : "▼"} ${pct(Math.abs(x.chg))}</td></tr>`).join("")}</tbody></table></div></div></div>`;
  if (showB("be")) h += `<div class="grid2"><div class="card"><h2>Break-even · orders per month</h2><p class="sub">Orders needed to cover fixed costs, vs actual. Dashed line = break-even for ${MONTH} costs.</p>${lineChart([{ v: o, c: "var(--blue)", area: true }], { labels: MON12, fmt: v => Math.round(v / 1000) + "k", min: 60000, max: 110000, lines: [{ v: be.be, c: "var(--red)", t: "Break-even " + num(Math.round(be.be / 100) * 100) }], aria: "Orders vs break-even" })}</div>
    <div class="card"><h2>How break-even is calculated</h2><div class="formula">Fixed costs a month = ${m0(be.fixed)}<br>(permanent floor staff, CSR, rent, machinery, automation, software, admin)<br>Variable cost per order = ${money(be.varPerOrder)}<br>(packaging materials + casual labour share ${pct(FA.casualShare, 0)})<br>Average revenue per order = ${money(FA.revPerOrder)}<br>Contribution per order = ${money(be.contrib)}<br><strong>Break-even = ${m0(be.fixed)} ÷ ${money(be.contrib)} = ${num(Math.round(be.be))} orders</strong><br>Actual ${num(be.orders)} → ${pct(be.safety, 1)} safety margin</div>
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

function clientTable(M, list) {
  return `<div class="tw"><table><thead><tr><th>Client</th><th class="r">Orders</th><th class="r">Billed (Xero)</th><th class="r">Cost to serve</th><th class="r">Margin</th><th>Margin %</th><th class="r">Cost / order</th></tr></thead><tbody>
  ${list.map(c => `<tr class="clickable" data-client="${c.id}"><td class="sup">${esc(c.name)}<div class="meta">${esc(c.type)} · ${esc(c.site)}</div></td><td class="r num">${num(c.vols["ORD-FEE"])}</td><td class="r num">${m0(c.revenue)}</td><td class="r num">${m0(c.cost)}</td><td class="r num">${m0(c.margin)}</td><td>${mbar(c.marginPct)}</td><td class="r num">${money(c.cost / c.vols["ORD-FEE"])}</td></tr>`).join("")}
  <tr class="tot"><td>Total pilot</td><td class="r num">${num(list.reduce((a, c) => a + c.vols["ORD-FEE"], 0))}</td><td class="r num">${m0(list.reduce((a, c) => a + c.revenue, 0))}</td><td class="r num">${m0(list.reduce((a, c) => a + c.cost, 0))}</td><td class="r num">${m0(list.reduce((a, c) => a + c.margin, 0))}</td><td></td><td></td></tr>
  </tbody></table></div>`;
}
function pClients(M) {
  const rev = M.clients.reduce((a, c) => a + c.revenue, 0), cost = M.clients.reduce((a, c) => a + c.cost, 0);
  const worst = M.clients.slice().sort((a, b) => a.marginPct - b.marginPct)[0], best = M.clients.slice().sort((a, b) => b.marginPct - a.marginPct)[0];
  let h = "";
  if (show("By client") || sub === "Overview") h += `${sub === "Overview" ? `<div class="kpis">
    <div class="kpi"><div class="l">Billed · processing</div><div class="v">${m0(rev)}</div><div class="s">${MONTH}, 8 pilot clients</div></div>
    <div class="kpi"><div class="l">Cost to serve</div><div class="v">${m0(cost)}</div><div class="s">labour + overheads by driver</div></div>
    <div class="kpi red"><div class="l">Lowest margin</div><div class="v">${pct(worst.marginPct)}</div><div class="s">${esc(worst.short)}</div></div>
    <div class="kpi green"><div class="l">Highest margin</div><div class="v">${pct(best.marginPct)}</div><div class="s">${esc(best.short)}</div></div></div>` : ""}
    <div class="card"><h2>Cost to serve by client</h2><p class="sub">Billed = Xero invoice lines for processing (postage excluded). Cost = activity volume × standard minutes × cost per minute, plus overheads by driver. Click a client for the service breakdown.</p>${clientTable(M, M.clients.slice().sort((a, b) => a.marginPct - b.marginPct))}</div>`;
  if (show("By service")) {
    h += `<div class="card"><h2>Cost per unit by service</h2><p class="sub">Click a line for the full calculation. Same cost per unit for every client. Client differences come from their mix and from their rates.</p><div class="tw"><table><thead><tr><th>Service</th><th>Unit</th><th class="r">Labour</th><th class="r">Admin share</th><th class="r">Other overheads</th><th class="r">Cost / unit</th><th class="r">Rate range</th><th>Below cost</th></tr></thead><tbody>
    ${SERVICES.map(s => { const u = M.unit[s.code]; const rs = CLIENTS.map(c => c.rates[s.code]).filter(x => x != null); const bc = s.unbilled ? [] : M.clients.filter(c => c.rates[s.code] < u.total);
      return `<tr class="clickable" data-row="svc|${s.code}"><td class="sup">${esc(s.name)}<div class="meta mono">${s.code}</div></td><td>${esc(s.unit)}</td><td class="r num">${money(u.lab, 3)}</td><td class="r num">${money(u.adm, 3)}</td><td class="r num">${money(u.oth, 3)}</td><td class="r num"><strong>${money(u.total, 2)}</strong></td><td class="r num">${rs.length ? money(Math.min(...rs)) + " – " + money(Math.max(...rs)) : '<span class="pill p-grey">not billed</span>'}</td><td>${bc.length ? bc.map(c => `<span class="pill p-red">${esc(c.short)}</span>`).join(" ") : (s.unbilled ? '<span class="meta">absorbed</span>' : '<span class="pill p-green">none</span>')}</td></tr>`; }).join("")}
    </tbody></table></div></div>`;
  }
  if (show("Below cost")) {
    const rows = []; M.clients.forEach(c => c.lines.forEach(l => { if (l.marginPct != null && l.marginPct < RULES.floor) rows.push({ c, l }); }));
    rows.sort((a, b) => a.l.marginPct - b.l.marginPct);
    h += `<div class="card"><h2>Below cost or under the ${pct(RULES.floor, 0)} floor</h2><p class="sub">Each line is a candidate for the next rate review.</p><div class="tw"><table><thead><tr><th>Client</th><th>Service</th><th class="r">Rate</th><th class="r">Cost</th><th>Margin</th><th class="r">3-month avg volume</th><th class="r">$ / month</th><th></th></tr></thead><tbody>
    ${rows.map(({ c, l }) => `<tr class="clickable" data-client="${c.id}"><td class="sup">${esc(c.short)}</td><td>${esc(l.s.name)}</td><td class="r num">${money(l.rate)}</td><td class="r num">${money(l.unitCost)}</td><td>${mpill(l.marginPct)}</td><td class="r num">${num(l.avg3)}</td><td class="r num">${money(l.unitMargin * l.avg3)}</td><td><button class="lnk" data-review="${c.id}">Rate review</button></td></tr>`).join("")}
    </tbody></table></div></div>`;
  }
  return h;
}

function pLeakage(M) {
  let h = "";
  const ub = LEAK.filter(L => L.kind === "Under-billing"), tot = LEAK.reduce((a, L) => a + leakAmount(L, M), 0);
  const rec = LEAK.filter(L => L.status === "Recovered").reduce((a, L) => a + (L.recovered || 0), 0);
  if (sub === "Overview") h += `<div class="kpis">
    <div class="kpi"><div class="l">Found · ${MONTH}</div><div class="v">${m0(tot)}</div><div class="s">per month while it stays unfixed</div></div>
    <div class="kpi green"><div class="l">Recovered so far</div><div class="v">${m0(rec)}</div><div class="s">billed by hand in Xero</div></div>
    <div class="kpi red"><div class="l">Open</div><div class="v">${LEAK.filter(L => L.status === "Open").length}</div><div class="s">need a decision</div></div>
    <div class="kpi"><div class="l">Tolerance</div><div class="v">${money(RULES.tolerance, 0)}</div><div class="s">gaps below this are ignored</div></div></div>
    <div class="callout">This app never changes Xero, Dyspach or the WMS. Each check shows <strong>match</strong> or <strong>don't match</strong>. A person decides, and a task is created to fix the other system by hand.</div>`;
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
    h += `<div class="card"><h2>Rate checks · CLM vs Dyspach vs WMS</h2><p class="sub">CLM is the master for client prices. Only mismatches are listed; ${CLIENTS.length * BILLABLE.length - rows.length} other rates match. Sometimes Dyspach holds the newer, correct price, so a person decides.</p><div class="tw"><table><thead><tr><th>Client</th><th>Service</th><th class="r">CLM</th><th class="r">Dyspach</th><th class="r">WMS</th><th>Result</th><th>Actions</th></tr></thead><tbody>
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
    const nm = nr - l.unitCost, np = nm / nr;
    curM += l.unitMargin * l.avg3; newM += nm * l.avg3;
    return `<tr class="clickable" data-row="line|${c.id}|${l.code}"><td class="sup">${esc(l.s.name)}<div class="meta mono">${l.code} · per ${esc(l.s.unit)}</div></td><td class="r num">${money(l.rate)}</td><td class="r num">${money(l.unitCost)}</td><td>${mpill(l.marginPct)}</td><td class="r num">${num(l.avg3)}</td><td class="r"><label class="lock" for="nr-${l.code}" hidden>New rate</label><input id="nr-${l.code}" class="mini ${nr !== l.rate ? "changed" : ""}" type="number" step="0.05" min="0" value="${nr.toFixed(2)}" data-nr="${l.code}"></td><td>${mpill(np)}</td><td class="r num ${(nm - l.unitMargin) > 0 ? "delta-pos" : ""}">${(nm - l.unitMargin) ? money((nm - l.unitMargin) * l.avg3) : "—"}</td></tr>`;
  }).join("");
  const tickets = c.lines.find(l => l.code === "ACC-MGT");
  return `<div class="ph"><div><h1>Rate review</h1><p>CLM asks this app for each service: current rate, cost, margin and last 3 months' volume. You set new rates; CLM builds the schedule of rates for the amendment.</p></div></div>
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
  <div class="row" style="margin-top:12px"><button class="btn primary" data-act="sendclm">Send schedule of rates to CLM</button><span class="meta">Creates an amendment draft in CLM. Nothing changes in Dyspach, the WMS or Xero.</span></div></div>`;
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

function pModel(M) {
  let h = "";
  if (sub === "Overview") h += `<div class="card"><h2>How the cost is built</h2><p class="sub">Time-driven activity-based costing (TDABC). Every step can be checked on its own page.</p>
    <div class="flow"><div><b>1 · Cost pools</b><p>Xero P&L by account and Xero Payroll totals (direct, read-only) for the month.</p></div><div><b>2 · Cost per minute</b><p>Labour pool cost ÷ practical capacity minutes (paid minutes × utilisation).</p></div><div><b>3 · Standard minutes</b><p>Minutes per activity: estimates now, replaced by a 1–2 week time study.</p></div><div><b>4 · Client cost</b><p>Σ WMS activity count × minutes × cost per minute, plus overheads by driver.</p></div></div>
    <div class="formula" style="margin-top:12px">Client cost = Σ (activity count × standard minutes × cost per minute) + Σ (driver units × overhead rate)</div></div>
    <div class="kpis"><div class="kpi"><div class="l">Floor labour · cost per minute</div><div class="v">${money(M.pools.floor.cpm, 3)}</div><div class="s">${num(M.pools.floor.minutes)} practical minutes</div></div>
    <div class="kpi"><div class="l">CSR · cost per minute</div><div class="v">${money(M.pools.csr.cpm, 3)}</div><div class="s">${num(M.pools.csr.minutes)} practical minutes</div></div>
    <div class="kpi"><div class="l">Admin share per labour minute</div><div class="v">${money(M.ovhRate.admin, 3)}</div><div class="s">added to every labour minute</div></div>
    <div class="kpi amber"><div class="l">Minutes still estimated</div><div class="v">${SERVICES.filter(s => s.basis === "Estimate").length} of ${SERVICES.filter(s => s.pool).length}</div><div class="s">time study not booked</div></div></div>`;
  if (show("Cost pools")) {
    const lab = Object.entries(POOLS).map(([k, p]) => ({ row: "lab|" + k, name: p.name, src: k === "floor" ? "Xero Payroll: warehouse staff" : "Xero Payroll: CSR, account executive", amount: M.pools[k].total, driver: "Labour minutes", rate: money(M.pools[k].cpm, 3) + " / min" }));
    const all = [...lab, ...OVH.map(o => ({ row: "ovh|" + o.id, name: o.name, src: o.src, amount: o.amount, driver: o.driver, rate: money(M.ovhRate[o.id], 3) + " / " + o.unit }))];
    h += `<div class="card"><h2>Cost pools · ${MONTH}</h2><p class="sub">Click a line for how it is calculated. Every Xero expense account maps to one pool. Postage and carrier bills are excluded (that margin is checked in Dyspach).</p><div class="tw"><table><thead><tr><th>Pool</th><th>Source</th><th class="r">Amount</th><th>Driver</th><th class="r">Rate</th></tr></thead><tbody>
    ${all.map(a => `<tr class="clickable" data-row="${a.row}"><td class="sup">${esc(a.name)}</td><td class="meta">${esc(a.src)}</td><td class="r num">${m0(a.amount)}</td><td>${esc(a.driver)}</td><td class="r num">${a.rate}</td></tr>`).join("")}
    <tr class="tot"><td colspan="2">Total costs in the model</td><td class="r num">${m0(all.reduce((x, a) => x + a.amount, 0))}</td><td colspan="2"></td></tr></tbody></table></div></div>`;
  }
  if (show("Labour")) {
    h += `<div class="card"><h2>Labour cost per minute</h2><p class="sub">Labour cost = gross wages + super + payroll tax + workers comp. PAYG withholding is already inside gross, so it isn't added. Pool totals only: pay by person is visible to Asal and Mark only.</p><div class="tw"><table><thead><tr><th>Pool</th><th class="r">Staff</th><th class="r">Gross</th><th class="r">Super ${pct(ONCOST.superRate, 0)}</th><th class="r">Payroll tax ${pct(ONCOST.payrollTax, 2)}</th><th class="r">Workers comp ${pct(ONCOST.workersComp, 1)}</th><th class="r">Total</th><th class="r">Paid hours</th><th class="r">Utilisation</th><th class="r">Cost / min</th></tr></thead><tbody>
    ${Object.entries(POOLS).map(([k, p]) => { const c = M.pools[k]; return `<tr class="clickable" data-row="lab|${k}"><td class="sup">${esc(p.name)}<div class="meta">${esc(p.who)}</div></td><td class="r num">${p.staff}</td><td class="r num">${m0(c.gross)}</td><td class="r num">${m0(c.sup)}</td><td class="r num">${m0(c.ptax)}</td><td class="r num">${m0(c.wc)}</td><td class="r num"><strong>${m0(c.total)}</strong></td><td class="r num">${num(p.hours)}</td><td class="r"><input class="mini" style="width:64px" type="number" min="50" max="100" step="1" value="${Math.round(p.util * 100)}" data-util="${k}" aria-label="Utilisation % ${esc(p.name)}">%</td><td class="r num"><strong>${money(c.cpm, 3)}</strong></td></tr>`; }).join("")}
    </tbody></table></div><p class="small muted" style="margin:10px 0 0">Utilisation = share of paid time available for activities (breaks, meetings, idle and training removed). Change it to see every cost move.</p></div>`;
  }
  if (show("Standard minutes")) {
    h += `<div class="card"><h2>Standard minutes per activity</h2><p class="sub">Edit a value to see the cost per unit and every client margin update. Estimates are replaced by time-study results.</p><div class="tw"><table><thead><tr><th>Service</th><th>Per</th><th class="r">Minutes</th><th>Basis</th><th class="r">Cost / unit</th></tr></thead><tbody>
    ${SERVICES.filter(s => s.pool).map(s => `<tr class="clickable" data-row="svc|${s.code}"><td class="sup">${esc(s.name)}${s.warn ? `<div class="warnbox" style="margin-top:4px">${esc(s.warn)}</div>` : ""}</td><td>${esc(s.unit)}</td><td class="r"><input class="mini" type="number" min="0" step="0.05" value="${s.min}" data-min="${s.code}" aria-label="Minutes for ${esc(s.name)}"></td><td><span class="pill ${s.basis === "Estimate" ? "p-amber" : "p-blue"}">${s.basis}</span></td><td class="r num"><strong>${money(M.unit[s.code].total)}</strong></td></tr>`).join("")}
    </tbody></table></div><div class="row" style="margin-top:12px"><button class="btn" data-act="study">Plan a time study</button><span class="meta">Front tickets: count per client by type × minutes. Reply waiting time is not work time.</span></div></div>`;
  }
  if (show("Overhead drivers")) {
    h += `<div class="card"><h2>Overhead drivers</h2><p class="sub">Each overhead is spread by the activity that causes it. Driver totals are FA-wide (all 102 tenants), so pilot clients carry only their share.</p><div class="tw"><table><thead><tr><th>Overhead</th><th class="r">Amount</th><th>Driver</th><th class="r">FA total units</th><th class="r">Rate</th></tr></thead><tbody>
    ${OVH.map(o => `<tr class="clickable" data-row="ovh|${o.id}"><td class="sup">${esc(o.name)}</td><td class="r num">${m0(o.amount)}</td><td>${esc(o.driver)}</td><td class="r num">${num(o.id === "admin" ? M.labourMin : o.total)}</td><td class="r num">${money(M.ovhRate[o.id], 3)} / ${o.unit}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  }
  return h;
}

function pTasks() {
  const list = TASKS.filter(t => sub === "Done" ? t.st === "done" : t.st === "open");
  return `<div class="card"><h2>${sub === "Done" ? "Done" : "Open tasks"}</h2><p class="sub">Fixes that happen by hand in another system. The app records who did what. Click a line for details.</p><div class="tw"><table><thead><tr><th>Priority</th><th>Topic</th><th>Company</th><th>What to do</th><th class="r">Age</th><th>Owner</th><th>Actions</th></tr></thead><tbody>
  ${list.map(t => `<tr class="clickable" data-task="${t.id}"><td><span class="pill ${t.pr === "High" ? "p-red" : t.pr === "Medium" ? "p-amber" : "p-grey"}">${t.pr}</span></td><td>${esc(t.topic)}</td><td class="sup">${esc(t.co)}<div class="meta">Fix in ${esc(t.where)}</div></td><td>${esc(t.what)}<div class="meta">${esc(t.why)}</div></td><td class="r num">${t.age}d</td><td>${esc(t.owner)}</td><td class="actions">${t.st === "open" ? `<button class="lnk" data-done="${t.id}">resolve</button>` : `<button class="lnk" data-reopen="${t.id}">re-open</button>`}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">Nothing here.</td></tr>'}
  </tbody></table></div></div>`;
}

function pData() {
  const tiles = [
    ["wms", "WMS · volumes", "3 systems", "Thomax · 3PLWMS · Logiwa"],
    ["xero", "Accounting · Xero", "Read-only, everything", "Ledger · reports · payroll · files"],
    ["front", "Client service · Front", "Read-only", "Emails · tickets · files"],
    ["rates", "Contracts & rates", "CLM master", "CLM · Dyspach export"],
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
    <div class="card"><h2>Dyspach <span class="pill p-grey">Export file</span></h2><p class="sub">For the rate checks (CLM vs Dyspach) and as the rate source until CLM is live. API not confirmed, so a rate export upload is enough.</p><div class="row"><button class="btn" data-act="src" data-n="Dyspach">Upload rate export</button></div></div>`;
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
  return `<div class="card"><h2>Rules</h2><p class="sub">Editable numbers used across the app.</p><div class="dl" style="grid-template-columns:max-content auto;align-items:center">
    <dt><label for="rf">Margin floor</label></dt><dd><input id="rf" class="mini" type="number" value="${RULES.floor * 100}" data-rule="floor"> % · lines below show amber, below cost show red</dd>
    <dt><label for="rt">Leakage tolerance</label></dt><dd><input id="rt" class="mini" type="number" value="${RULES.tolerance}" data-rule="tolerance"> $ · smaller gaps are ignored</dd>
    <dt>Volume average</dt><dd>last ${RULES.avgMonths} months for rate reviews</dd>
    <dt>Weekly minimum</dt><dd>$${RULES.wkMin} postage + processing, after any levy period</dd>
    <dt>Xero vs WMS</dt><dd>Xero billed wins when they differ</dd></div></div>`;
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
  const tabs = `<div class="seg" style="margin-bottom:4px">${["Internal", "Clients", "Suggestions"].map(t => `<button data-cc="${t}" aria-pressed="${ccTab === t}">${t}${t === "Suggestions" && SUGG.length ? " (" + SUGG.length + ")" : ""}</button>`).join("")}</div>`;
  let body = "";
  if (ccTab === "Internal") body = `<div class="card"><h2>Internal</h2><p class="sub">Can receive any report, including costs and margins, and can be given a login. Only the owner can add or remove entries here.</p>
    <div class="tsec-h">Trusted domains</div><div class="chips" style="margin-bottom:12px">${INTERNAL.domains.map(d => `<span class="chip">@${esc(d)}<button data-rmdom="${esc(d)}" aria-label="Remove">×</button></span>`).join("")}<input id="ad-d" type="text" placeholder="add domain, e.g. DTS domain" style="width:200px"><button class="btn" data-act="adddom">Add</button></div>
    <div class="tsec-h">Approved people outside those domains</div><div class="tw"><table><thead><tr><th>Name</th><th>Email</th><th>Note</th><th>Can log in</th><th></th></tr></thead><tbody>
    ${INTERNAL.people.map((p, i) => `<tr><td class="sup">${esc(p.name)}</td><td class="mono">${esc(p.email)}</td><td class="meta">${esc(p.note || "")}</td><td>${p.login ? '<span class="pill p-green">yes</span>' : '<span class="pill p-grey">no</span>'}</td><td>${p.name === "Asal Artikbaeva" ? '<span class="lock">owner</span>' : `<button class="lnk" data-rmint="${i}" style="color:var(--red)">remove</button>`}</td></tr>`).join("")}
    </tbody></table></div><div class="row" style="margin-top:10px"><input id="ai-n" type="text" placeholder="Name" style="width:150px"><input id="ai-e" type="email" placeholder="email" style="width:min(240px,100%)"><button class="btn" data-act="addint">Add person</button></div></div>`;
  if (ccTab === "Clients") body = `<div class="card"><h2>Clients</h2><p class="sub">Client contacts can only receive Client-safe reports, and only about their own company.</p><div class="tw"><table><thead><tr><th>Client</th><th>Domains</th><th>Contacts</th><th>Status</th></tr></thead><tbody>
    ${CCON.map(c => `<tr><td class="sup">${esc(cl(c.client).name)}</td><td class="mono">${c.domains.map(esc).join(", ")}</td><td>${c.contacts.length ? c.contacts.map(k => `<div>${esc(k.name)} <span class="mono">${esc(k.email)}</span></div>`).join("") : '<span class="meta">none yet</span>'}</td><td><span class="pill p-green">${c.st}</span></td></tr>`).join("")}
    </tbody></table></div><div class="row" style="margin-top:10px"><select id="ac-c" aria-label="Client">${CLIENTS.map(c => `<option value="${c.id}">${esc(c.short)}</option>`).join("")}</select><input id="ac-n" type="text" placeholder="Name" style="width:150px"><input id="ac-e" type="email" placeholder="email" style="width:min(240px,100%)"><button class="btn" data-act="addcc">Add contact</button></div></div>`;
  if (ccTab === "Suggestions") body = `<div class="card"><h2>Suggestions from Xero and Front</h2><p class="sub">Found in Xero contacts and Front emails. Nothing is added until you confirm; nobody is ever added to Internal automatically.</p><div class="tw"><table><thead><tr><th>Email</th><th>Found in</th><th>Looks like</th><th>Actions</th></tr></thead><tbody>
    ${SUGG.map((s, i) => `<tr><td class="mono">${esc(s.email)}</td><td class="meta">${esc(s.src)}</td><td>${s.guess ? esc(cl(s.guess).short) + " (client)" : "Internal?"}</td><td class="actions">${s.guess ? `<button class="lnk" data-sg="client" data-i="${i}">add to ${esc(cl(s.guess).short)}</button>` : ""}<button class="lnk" data-sg="internal" data-i="${i}">add to Internal</button><button class="lnk" data-sg="ignore" data-i="${i}">ignore</button></td></tr>`).join("") || '<tr><td colspan="4" class="empty">No new suggestions.</td></tr>'}
    </tbody></table></div></div>`;
  return tabs + body + `<div class="callout">Reports can only be sent to addresses in these lists. Unknown address = blocked.</div>`;
}
function shareDrawer(id, replace) {
  const r = id === "kpi" ? { id: "kpi", name: sub + " KPIs", cls: "Internal", sched: "Off", on: false }
    : id === "page" ? { id: "page", name: PAGES[cur].label + (sub && sub !== "Overview" ? " · " + sub : ""), cls: "Internal", sched: "Off", on: false } : REPORTS.find(x => x.id === id);
  SHARE = { id, r, to: SHARE && SHARE.id === id ? SHARE.to : [] };
  const intl = [...INTERNAL.people.map(p => ({ e: p.email, n: p.name, g: "Internal" }))];
  const clientC = CCON.flatMap(c => c.contacts.map(k => ({ e: k.email, n: k.name + " · " + cl(c.client).short, g: "Clients", client: c.client })));
  const allowed = (o) => o.g === "Internal" ? true : (r.cls === "Client-safe" && r.client === o.client);
  const opt = (o) => `<option value="${esc(o.e)}" ${allowed(o) ? "" : "disabled"}>${esc(o.n)} — ${esc(o.e)}${allowed(o) ? "" : r.cls === "Internal" ? " (internal report: not allowed)" : " (other client: not allowed)"}</option>`;
  drawer(`<h3>Email / PDF · ${esc(r.name)}</h3>
  <dl class="dl"><dt>Report type</dt><dd><span class="pill ${r.cls === "Internal" ? "p-purple" : "p-green"}">${r.cls}</span> ${r.cls === "Internal" ? "contains costs and margins: internal recipients only" : "no costs or margins: " + esc(cl(r.client).short) + " contacts allowed"}</dd><dt>Sent from</dt><dd>FA Accounts mailbox via Front</dd></dl>
  <div class="tsec"><div class="tsec-h">Recipients · only from Contacts & recipients</div>
    <div class="chips" id="tochips">${SHARE.to.map(e => `<span class="chip">${esc(e)}<button data-rmto="${esc(e)}" aria-label="Remove">×</button></span>`).join("") || '<span class="meta">none yet</span>'}</div>
    <div class="row" style="margin-top:8px"><select id="sh-to" aria-label="Add recipient" style="max-width:100%"><option value="">Add recipient…</option><optgroup label="Internal">${intl.map(opt).join("")}</optgroup><optgroup label="Clients">${clientC.map(opt).join("")}</optgroup></select><button class="btn" data-act="addto">Add</button></div></div>
  <div class="tsec"><div class="tsec-h">Send once</div><div class="row"><button class="btn primary" data-act="sendnow">Send PDF now</button><button class="btn" data-act="pdfprev">Preview PDF</button></div></div>
  <div class="tsec"><div class="tsec-h">Schedule</div><div class="row"><label class="small"><input type="checkbox" id="sh-on" ${r.on ? "checked" : ""}> On</label><select id="sh-f" aria-label="Frequency"><option>Weekly · Monday 7:30</option><option>Monthly · 1st business day</option><option>Quarterly · 5th business day</option></select><select id="sh-m" aria-label="Mode"><option>Dry run (to Asal only)</option><option>Draft in Front for review</option><option>Send automatically</option></select><button class="btn" data-act="savesched">Save schedule</button></div>
  ${r.cls === "Client-safe" ? '<p class="meta" style="margin:8px 0 0">Client reports: the first send is always a draft in Front for you to check.</p>' : ""}</div>
  <div class="callout">Before every send: recipients re-checked against the lists, and the PDF is scanned for costs, margins and other clients' names. If anything is found, the send is blocked and a task is created.</div>`, replace);
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
function rowPanel(type, id) {
  const M = model();
  if (type === "svc") {
    const s = C(id), u = M.unit[id], p = s.pool ? M.pools[s.pool] : null;
    const ovl = Object.entries(s.ovh).map(([k, n]) => { const o = OVH.find(x => x.id === k); return `${n} × ${money(M.ovhRate[k], 3)} (${esc(o.name)}, per ${o.unit}) = ${money(n * M.ovhRate[k], 3)}`; });
    return drawer(`<h3>${esc(s.name)}</h3><dl class="dl"><dt>Code</dt><dd class="mono">${s.code}</dd><dt>Per</dt><dd>${esc(s.unit)}</dd><dt>Minutes</dt><dd>${s.min} · <span class="pill ${s.basis === "Estimate" ? "p-amber" : "p-blue"}">${s.basis}</span></dd><dt>Cost per unit</dt><dd class="num"><strong>${money(u.total, 3)}</strong></dd></dl>
    <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">${s.pool ? `Labour: ${s.min} min × ${money(p.cpm, 3)} per minute (${esc(POOLS[s.pool].name)}) = ${money(u.lab, 3)}<br>Admin share: ${s.min} min × ${money(M.ovhRate.admin, 3)} = ${money(u.adm, 3)}<br>` : ""}${ovl.join("<br>")}${ovl.length ? "<br>" : ""}<strong>Total = ${money(u.total, 3)}</strong></div></div>
    ${s.warn ? `<div class="warnbox">${esc(s.warn)}</div>` : ""}
    <div class="tsec"><div class="tsec-h">Where the numbers come from</div><div class="small">Minutes: ${s.basis === "Estimate" ? "estimate, to be replaced by the time study" : s.basis}. Cost per minute: Xero Payroll for ${MONTH} (see Labour). Overheads: Xero P&L accounts (see Cost pools).</div></div>
    ${s.unbilled ? "" : `<div class="tsec"><div class="tsec-h">Client rates vs this cost</div><table><tbody>${M.clients.map(c => { const l = c.lines.find(x => x.code === id); return `<tr><td>${esc(c.short)}</td><td class="r num">${money(l.rate)}</td><td>${mpill(l.marginPct)}</td></tr>`; }).join("")}</tbody></table></div>`}
    <div class="row"><button class="btn" data-goto="model|Standard minutes">Change minutes</button></div>`);
  }
  if (type === "lab") {
    const p = POOLS[id], c = M.pools[id];
    return drawer(`<h3>${esc(p.name)}</h3><p class="small muted">${esc(p.who)} · ${p.staff} staff</p>
    <div class="tsec"><div class="tsec-h">How cost per minute is calculated</div><div class="formula">Gross wages ${money(c.gross)} (PAYG is inside gross)<br>+ Super ${pct(ONCOST.superRate, 0)} = ${money(c.sup)}<br>+ Payroll tax ${pct(ONCOST.payrollTax, 2)} of gross + super = ${money(c.ptax)}<br>+ Workers comp ${pct(ONCOST.workersComp, 1)} = ${money(c.wc)}<br><strong>= Labour cost ${money(c.total)}</strong><br><br>${num(p.hours)} paid hours × 60 × ${pct(p.util, 0)} utilisation = ${num(c.minutes)} practical minutes<br><strong>Cost per minute = ${money(c.total)} ÷ ${num(c.minutes)} = ${money(c.cpm, 3)}</strong></div></div>
    <div class="tsec"><div class="tsec-h">Sources</div><div class="small">Xero Payroll pay runs for ${MONTH}: gross, super, hours. Payroll tax and workers comp rates from Settings → Rules. Utilisation = share of paid time spent on activities (breaks, idle, training removed).</div></div>
    <div class="tsec"><div class="tsec-h">Used by</div><div class="small">${SERVICES.filter(s => s.pool === id).map(s => esc(s.name)).join(" · ")}</div></div>`);
  }
  if (type === "ovh") {
    const o = OVH.find(x => x.id === id), tot = o.id === "admin" ? M.labourMin : o.total;
    return drawer(`<h3>${esc(o.name)}</h3><dl class="dl"><dt>Amount</dt><dd class="num">${money(o.amount)}</dd><dt>Source</dt><dd>${esc(o.src)}</dd><dt>Spread by</dt><dd>${esc(o.driver)}</dd></dl>
    <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">${money(o.amount)} ÷ ${num(tot)} ${esc(o.unit)}s (FA-wide, all tenants) = ${money(M.ovhRate[o.id], 3)} per ${esc(o.unit)}</div></div>
    <div class="tsec"><div class="tsec-h">Used by</div><div class="small">${o.id === "admin" ? "Every labour minute in every service" : SERVICES.filter(s => s.ovh[o.id]).map(s => esc(s.name)).join(" · ")}</div></div>`);
  }
  if (type === "line") {
    const [cid, code] = id.split("|"), c = M.clients.find(x => x.id === cid), l = c.lines.find(x => x.code === code);
    const dy = DYSPATCH_RATE[id], wm = WMS_RATE[id];
    return drawer(`<h3>${esc(c.short)} · ${esc(l.s.name)}</h3><dl class="dl"><dt>Rate (CLM)</dt><dd class="num">${money(l.rate)} per ${esc(l.s.unit)}</dd><dt>Cost per unit</dt><dd class="num">${money(l.unitCost)}</dd><dt>Margin</dt><dd>${mpill(l.marginPct)}</dd><dt>${MONTH} volume</dt><dd class="num">${num(l.vol)}</dd></dl>
    <div class="tsec"><div class="tsec-h">What the ${money(l.unitCost)} cost per unit is made of · click a part</div><table><tbody>
      ${(() => { const s = l.s, u = M.unit[code], parts = [];
        if (s.pool) { parts.push([`Labour · ${s.min} min × ${money(M.pools[s.pool].cpm, 3)} per minute`, u.lab, "lab|" + s.pool]); parts.push([`Admin share · ${s.min} min × ${money(M.ovhRate.admin, 3)}`, u.adm, "ovh|admin"]); }
        Object.entries(s.ovh).forEach(([k, n]) => { const o = OVH.find(x => x.id === k); parts.push([`${esc(o.name)} · ${n} × ${money(M.ovhRate[k], 3)} per ${o.unit}`, n * M.ovhRate[k], "ovh|" + k]); });
        return parts.map(x => `<tr class="clickable" data-row="${x[2]}"><td>${x[0]}</td><td class="r num">${money(x[1], 3)}</td></tr>`).join("") + `<tr class="clickable tot" data-row="svc|${code}"><td>Total · full calculation</td><td class="r num">${money(u.total, 3)}</td></tr>`; })()}
    </tbody></table></div>
    <div class="tsec"><div class="tsec-h">Last 3 months (WMS)</div><table><tbody>${MONTHS.map((m, i) => `<tr><td>${m} 2026</td><td class="r num">${num(Math.round(l.vol * c.trend[i]))}</td></tr>`).join("")}<tr class="tot"><td>Average</td><td class="r num">${num(l.avg3)}</td></tr></tbody></table></div>
    <div class="tsec"><div class="tsec-h">This month</div><div class="formula">Should bill = ${num(l.vol)} × ${money(l.rate)} = ${money(l.expected)}<br>Billed in Xero = ${money(l.billed)}<br>Cost = ${num(l.vol)} × ${money(l.unitCost)} = ${money(l.cost)}<br>Margin = ${money(l.billed - l.cost)}</div></div>
    <div class="tsec"><div class="tsec-h">Rate in each system</div><table><tbody><tr><td>CLM</td><td class="r num">${money(l.rate)}</td></tr><tr><td>Dyspach</td><td class="r num">${dy != null ? money(dy) : money(l.rate)}</td></tr><tr><td>WMS</td><td class="r num">${wm ? esc(wm) : money(l.rate)}</td></tr></tbody></table>${dy != null || wm ? '<span class="pill p-red">don\'t match</span>' : '<span class="pill p-green">match</span>'}</div>
    <div class="row"><button class="btn" data-review="${cid}">Rate review for ${esc(c.short)}</button><button class="btn" data-goto="model|Standard minutes">How the cost is built</button></div>`);
  }
  if (type === "wl") {
    const [rid, cid] = id.split("|"), r = REPORTS.find(x => x.id === rid), x = workload(r.per, cid)[0], per = r.per.toLowerCase();
    return drawer(`<h3>${esc(x.c.name)} · ${esc(r.per)}</h3><dl class="dl"><dt>Orders</dt><dd class="num">${num(x.orders)}</dd><dt>Units</dt><dd class="num">${num(x.units)}</dd><dt>Units per order</dt><dd class="num">${x.upo.toFixed(2)}</dd><dt>Previous ${per}</dt><dd class="num">${num(x.prev)} · <span class="${x.chg >= 0 ? "delta-pos" : "delta-neg"}">${x.chg >= 0 ? "▲" : "▼"} ${pct(Math.abs(x.chg))}</span></dd></dl>
    <div class="tsec"><div class="tsec-h">Orders by number of SKUs</div><table><tbody>${["1 SKU", "2 SKUs", "3 SKUs", "4+ SKUs"].map((lb, i) => `<tr><td>${lb}</td><td class="r num">${num(Math.round(x.mix[i] * x.orders))}</td><td class="r num">${pct(x.mix[i], 0)}</td></tr>`).join("")}</tbody></table></div>
    <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="small">Each order's lines are counted from the WMS (Thomax PCK1, later Logiwa); an order with 3 different SKUs counts as "3 SKUs". Previous ${per} uses the same rule for the period before.</div></div>
    <div class="row"><button class="btn" data-client="${x.c.id}">Client cost to serve</button></div>`);
  }
  if (type === "kpi") {
    const k = Object.values(KPIS).flat().find(x => x[0] === id), h = KPI_HOW[id] || ["Formula set at build time from the source data", "See Data sources"];
    return drawer(`<h3>${esc(id)}</h3><dl class="dl"><dt>Value</dt><dd><strong>${esc(k[1])}</strong></dd><dt>Change</dt><dd>${esc(k[2])}</dd>${k[3] ? `<dt>Note</dt><dd>${esc(k[3])}</dd>` : ""}</dl>
    <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">${esc(h[0])}</div></div><div class="tsec"><div class="tsec-h">Source</div><div class="small">${esc(h[1])}</div></div>
    <div class="tsec"><div class="tsec-h">History</div><div class="small muted">Monthly values with the trend appear here in the real app.</div></div>`);
  }
  if (type === "rc") {
    const [cid, code] = id.split("|"), c = cl(cid), dy = DYSPATCH_RATE[id], wm = WMS_RATE[id];
    return drawer(`<h3>Rate check · ${esc(c.short)} · ${esc(C(code).name)}</h3><table><tbody><tr><td>CLM (master)</td><td class="r num">${money(c.rates[code])}</td></tr><tr><td>Dyspach</td><td class="r num">${dy != null ? money(dy) : money(c.rates[code])}</td></tr><tr><td>WMS</td><td class="r num">${wm ? esc(wm) : money(c.rates[code])}</td></tr></tbody></table>
    <div class="callout" style="margin-top:8px">CLM is the master, but Dyspach sometimes holds the newer, correct price. You decide which is right; this app never changes Dyspach or the WMS.</div>
    <div class="actions"><button class="btn" data-act="clmupd" data-c="${esc(c.short)}">CLM is wrong · update CLM</button><button class="btn" data-act="extask" data-c="${esc(c.short)}">Other system is wrong · create task</button></div>`);
  }
  if (type === "api") {
    const a = APIIN.find(x => x.n === id);
    return drawer(`<h3>${esc(a.n)}</h3><dl class="dl"><dt>Category</dt><dd>${esc(a.cat)}</dd><dt>How</dt><dd>${esc(a.how)}</dd><dt>Access</dt><dd>${esc(a.acc)}</dd><dt>Status</dt><dd>${esc(a.st)}${a.end ? " · ends " + a.end : ""}</dd><dt>Last sync</dt><dd>${esc(a.sync)}</dd><dt>Data stored</dt><dd>${esc(a.data)}</dd></dl>
    <div class="tsec"><div class="tsec-h">Sync history</div><ul class="tl">${a.sync !== "—" ? `<li class="k-out"><div class="tl-h"><strong>${esc(a.sync)}</strong> sync OK</div><div class="tl-b">Demo entry</div></li>` : ""}<li><div class="tl-h"><strong>22/10/2026</strong> connection added to the app</div></li></ul></div>`);
  }
  if (type === "key") {
    const k = KEYS.find(x => x.last4 === id);
    return drawer(`<h3>Key for ${esc(k.app)}</h3><dl class="dl"><dt>Purpose</dt><dd>${esc(k.who)}</dd><dt>Key</dt><dd class="mono">fa_an_••••${k.last4}</dd><dt>Can read</dt><dd>${k.scopes.map(esc).join(" · ")}</dd><dt>Created</dt><dd>${k.created}</dd><dt>Expires</dt><dd>${k.exp}</dd><dt>Status</dt><dd>${k.st}</dd></dl>
    <div class="tsec"><div class="tsec-h">Usage log</div><div class="small muted">${k.used === "not yet" ? "Not used yet." : "Calls by day appear here."}</div></div>${k.st === "Active" ? `<div class="row"><button class="btn danger" data-revoke="${k.last4}">Revoke</button></div>` : ""}`);
  }
  if (type === "user") {
    const u = USERS.find(x => x.id === id);
    return drawer(`<h3>${esc(u.name)}</h3><dl class="dl"><dt>Email</dt><dd>${esc(u.email)}</dd><dt>Role</dt><dd>${esc(u.role)}</dd><dt>2FA</dt><dd>${u.tfa ? "on" : "not set up"}</dd><dt>Status</dt><dd>${u.st}</dd><dt>Last login</dt><dd>${esc(u.last)}</dd></dl>
    <div class="tsec"><div class="tsec-h">Activity</div><ul class="tl"><li class="k-in"><div class="tl-h"><strong>${esc(u.last)}</strong> signed in</div></li></ul></div>`);
  }
  if (type === "file") {
    const f = DS.files[+id];
    return drawer(`<h3>${esc(f.n)}</h3><dl class="dl"><dt>Source</dt><dd>3PLWMS export (manual upload)</dd><dt>Period</dt><dd>${f.p}</dd><dt>Rows</dt><dd class="num">${num(f.r)}</dd><dt>Added</dt><dd>${f.d}</dd></dl>
    <div class="tsec"><div class="tsec-h">Checks</div><div class="small">${f.ok ? "No duplicate orders, no date overlap with Thomax." : "3 days overlap with Thomax data. Overlapping rows were not imported twice; check which system is right for those days."}</div></div>`);
  }
}

/* ================= DRAWERS ================= */
let STACK = [];
function drawer(html, replace) {
  if (replace && STACK.length) STACK[STACK.length - 1] = html; else STACK.push(html);
  renderStack();
}
function renderStack() {
  const n = STACK.length;
  if (!n) { $("#layer").innerHTML = ""; return; }
  $("#layer").innerHTML = `<div class="scrim" data-closeall title="Close all"></div>` + STACK.map((h, i) => {
    const top = i === n - 1, depth = n - 1 - i;
    return `<aside class="drawer ${top ? "" : "under"}" role="dialog" aria-modal="${top}" style="transform:translateX(-${depth * 28}px)" ${top ? "" : 'aria-hidden="true"'}>
      ${top && n > 1 ? `<button class="lnk backlnk" data-close>← Back</button>` : ""}${h}
      <div class="row"><button class="btn" data-close>${n > 1 ? "Close this panel" : "Close"}</button>${n > 1 ? '<button class="btn" data-closeall>Close all</button>' : ""}</div></aside>`;
  }).join("");
}
function closeTop() { STACK.pop(); renderStack(); }
function closeAll() { STACK = []; renderStack(); }
function clientPanel(id) {
  const M = model(), c = M.clients.find(x => x.id === id);
  const lk = LEAK.filter(L => L.client === id);
  drawer(`<div class="row" style="justify-content:space-between"><h3>${esc(c.name)}</h3>${mpill(c.marginPct)}</div>
  <dl class="dl"><dt>Type · site</dt><dd>${esc(c.type)} · ${esc(c.site)}</dd><dt>Renewal (CLM)</dt><dd>${c.renew}</dd><dt>Billed ${MONTH}</dt><dd class="num">${money(c.revenue)}</dd><dt>Cost to serve</dt><dd class="num">${money(c.cost)}</dd><dt>Margin</dt><dd class="num">${money(c.margin)}</dd><dt>Cost per order</dt><dd class="num">${money(c.cost / c.vols["ORD-FEE"])}</dd></dl>
  <div class="tsec"><div class="tsec-h">By service · click a line for its breakdown</div><div class="tw"><table><thead><tr><th>Service</th><th class="r">Vol</th><th class="r">Rate</th><th class="r">Cost / unit</th><th class="r">Cost $</th><th>Margin</th></tr></thead><tbody>
  ${c.lines.map(l => `<tr class="clickable" data-row="line|${c.id}|${l.code}"><td>${esc(l.s.name)}</td><td class="r num">${num(l.vol)}</td><td class="r num">${l.s.unbilled ? "—" : money(l.rate)}</td><td class="r num">${money(l.unitCost)}</td><td class="r num">${m0(l.cost)}</td><td>${mpill(l.marginPct)}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="tsec"><div class="tsec-h">Leakage</div>${lk.length ? lk.map(L => `<div class="ctk"><div class="row" style="justify-content:space-between"><strong>${money(leakAmount(L, M))}</strong>${stPill(L.status)}</div><div class="small">${esc(L.cause)}</div></div>`).join("") : '<div class="empty">No leakage found this month.</div>'}</div>
  <div class="row"><button class="btn primary" data-review="${c.id}">Start rate review</button></div>`);
}
function leakPanel(id) {
  const M = model(), L = LEAK.find(x => x.id === id), c = M.clients.find(x => x.id === L.client), l = c.lines.find(x => x.code === L.code);
  const work = l ? `<div class="formula">Should bill = ${num(l.vol)} ${esc(l.s.unit)}s (WMS) × ${money(l.rate)} (CLM) = ${money(l.expected)}<br>Billed in Xero = ${money(l.billed)}<br>Gap = ${money(l.gap)}</div>`
    : `<div class="formula">Weekly total (postage + processing) for weeks ending 07/09, 14/09, 21/09: $210, $140, $140<br>Minimum $300 a week → top-ups $90 + $160 + $160 = $410.00<br>Top-up lines in Xero: none</div>`;
  drawer(`<div class="row" style="justify-content:space-between"><h3>${esc(c.short)} · ${l ? esc(l.s.name) : "Weekly minimum"}</h3>${stPill(L.status)}</div>
  <dl class="dl"><dt>Type</dt><dd>${esc(L.kind)}</dd><dt>Month</dt><dd>${esc(L.month)}</dd><dt>Cause</dt><dd>${esc(L.cause)}</dd>${L.inv ? `<dt>Recovered on</dt><dd><a class="ref" href="https://go.xero.com" target="_blank" rel="noopener">${L.inv}</a></dd>` : ""}</dl>
  <div class="tsec"><div class="tsec-h">Working</div>${work}</div>
  <div class="tsec"><div class="tsec-h">Sources</div><div class="small">Volume: Thomax export 03/10/2026 · Rate: CLM contract · Billed: Xero invoice lines</div></div>
  <div class="callout">The app does not change Xero. "Create task" asks David to fix it by hand; "Recovered" records the Xero invoice once it's raised.</div>
  ${L.status !== "Recovered" ? `<div class="actions">${leakActions(L)}</div>` : ""}`);
}
function taskPanel(id) {
  const t = TASKS.find(x => x.id === id), L = LEAK.find(l => l.task === id || ("From leakage " + l.id) === t.why);
  const created = new Date(2026, 9, 22 - t.age), dd = (d) => String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  const links = { Xero: '<a class="ref" href="https://go.xero.com" target="_blank" rel="noopener">Open in Xero</a>', WMS: '<span class="meta">WMS rate card (Thomax) — opened by hand</span>', "CLM / Dyspach": '<span class="meta">CLM contract · Dyspach rate card</span>', CLM: '<span class="meta">CLM contract</span>', Floor: '<span class="meta">Time study plan</span>' };
  drawer(`<div class="row" style="justify-content:space-between"><h3>${esc(t.topic)} · ${esc(t.co)}</h3><span class="pill ${t.pr === "High" ? "p-red" : t.pr === "Medium" ? "p-amber" : "p-grey"}">${t.pr}</span></div>
  <dl class="dl"><dt>What to do</dt><dd>${esc(t.what)}</dd><dt>Why</dt><dd>${esc(t.why)}</dd><dt>Fix in</dt><dd>${esc(t.where)} (by hand) · ${links[t.where] || ""}</dd><dt>Owner</dt><dd><select id="ow" aria-label="Owner">${["Asal", "David", "Paul", "Natalia", "Mark"].map(o => `<option ${o === t.owner ? "selected" : ""}>${o}</option>`).join("")}</select></dd><dt>Age</dt><dd>${t.age} days</dd></dl>
  ${L ? `<div class="tsec"><div class="tsec-h">Created from</div><div class="ctk clickable" data-leak="${L.id}" style="cursor:pointer"><strong>${esc(L.kind)} · ${esc(cl(L.client).short)}</strong> · ${money(leakAmount(L, model()))}<div class="small">${esc(L.cause)}</div></div></div>` : ""}
  <div class="tsec"><div class="tsec-h">Timeline</div><ul class="tl">
    <li class="k-in"><div class="tl-h"><strong>${dd(created)}</strong> task created${L ? " from leakage " + L.id : ""}</div><div class="tl-b">Assigned to ${esc(t.owner)}</div></li>
    ${t.age > 3 ? `<li class="k-note"><div class="tl-h"><strong>${dd(new Date(2026, 9, 22 - Math.floor(t.age / 2)))}</strong> comment · Asal</div><div class="tl-b">Followed up with ${esc(t.owner)}</div></li>` : ""}
    ${t.st === "done" ? `<li class="k-out"><div class="tl-h"><strong>14/10/2026</strong> resolved · ${esc(t.owner)}</div><div class="tl-b">${esc(t.why)}</div></li>` : ""}
  </ul></div>
  <div class="tsec"><div class="tsec-h">Comment</div><textarea id="tc" placeholder="Add a comment"></textarea><div class="row" style="margin-top:6px"><button class="btn" data-act="comment">Save comment</button>${t.st === "open" ? `<button class="btn primary" data-done="${t.id}">Resolve</button>` : ""}</div></div>`);
}

/* ================= RENDER & EVENTS ================= */
function render() {
  const M = model();
  $("#nav").innerHTML = navHTML(false); $("#nav2").innerHTML = navHTML(true);
  $("#crumb").innerHTML = esc(PAGES[cur].label) + (sub && sub !== "Overview" && PAGES[cur].subs.length ? ` <span>/ ${esc(sub)}</span>` : "");
  const f = { overview: pOverview, clients: pClients, leakage: pLeakage, rates: pRates, reports: pReports, kpi: pKpi, model: pModel, tasks: pTasks, data: pData, apis: pApis, settings: pSettings }[cur];
  $("#view").innerHTML = withSub(f(M));
  $("#sharebtn").hidden = !["overview", "clients", "leakage", "model"].includes(cur);
}
document.addEventListener("click", (e) => {
  if (e.target.closest("input, select, textarea, label, a")) return;
  const t = e.target.closest("button, tr.clickable, .kpi.clickable, .ctk.clickable, [data-close], [data-closeall]"); if (!t) return;
  const d = t.dataset;
  if (d.closeall !== undefined) { closeAll(); return; }
  if (d.close !== undefined) { closeTop(); return; }
  if (d.nav) { NEWKEY = ""; CONFIRM = null; INVITE_ERR = ""; return go(d.nav); }
  if (d.go) { NEWKEY = ""; return go(d.go); }
  if (d.sub) { sub = d.sub; render(); return; }
  if (d.ds) { dsTab = d.ds; render(); return; }
  if (d.ov) { ovSel = ovSel === d.ov ? null : d.ov; render(); return; }
  if (d.cc) { ccTab = d.cc; render(); return; }
  if (d.share) { e.stopPropagation(); SHARE = null; return shareDrawer(d.share); }
  if (d.rmto) { SHARE.to = SHARE.to.filter(x => x !== d.rmto); return shareDrawer(SHARE.id, true); }
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
  if (d.done) { e.stopPropagation(); TASKS.find(x => x.id === d.done).st = "done"; closeAll(); render(); toast("Task resolved."); return; }
  if (d.reopen) { e.stopPropagation(); TASKS.find(x => x.id === d.reopen).st = "open"; render(); return; }
  if (d.act) {
    e.stopPropagation();
    const M = model();
    switch (d.act) {
      case "applytarget": { const c = M.clients.find(x => x.id === rateClient); c.lines.filter(l => !l.s.unbilled).forEach(l => { const need = l.unitCost / (1 - target); if (l.rate < need) newRates[c.id + "|" + l.code] = Math.ceil(need * 20) / 20; }); render(); toast("Lines below target raised; others unchanged."); break; }
      case "resetrates": Object.keys(newRates).filter(k => k.startsWith(rateClient + "|")).forEach(k => delete newRates[k]); render(); break;
      case "sendclm": toast("Schedule of rates sent to CLM as an amendment draft (demo)."); break;
      case "sendtest": toast("Test report sent to Asal (demo)."); break;
      case "study": toast("Time study task added (demo)."); break;
      case "clmupd": toast(d.c + ": CLM rate updated in our own app only (demo)."); break;
      case "extask": toast(d.c + ": task created to fix the other system by hand (demo)."); break;
      case "addto": { const v = $("#sh-to").value; if (!v) break; if (!isInternal(v) && !(SHARE.r.cls === "Client-safe" && clientOf(v) === SHARE.r.client)) { toast("Blocked: not allowed for this report."); break; } if (!SHARE.to.includes(v)) SHARE.to.push(v); shareDrawer(SHARE.id, true); break; }
      case "sendnow": if (!SHARE.to.length) { toast("Add at least one recipient."); break; } toast(SHARE.r.cls === "Client-safe" ? "Checks passed. Draft created in Front for your review (demo)." : "Checks passed. PDF sent via Front (demo)."); closeAll(); break;
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
