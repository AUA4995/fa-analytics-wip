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
    <button class="kpi" data-goto="leakage|Rate checks"><div class="l">Rate mismatches</div><div class="v">${Object.keys(DYSPATCH_RATE).length + Object.keys(WMS_RATE).length}</div><div class="s">CLM vs Dyspach vs WMS</div></button></div>
  <div class="grid2"><div class="card"><h2>By type</h2>${Object.entries(types).map(([k, v]) => `<div class="catbar"><span>${esc(k)}</span><span class="track"><i style="width:${v / mx * 100}%"></i></span><span class="num small">${m0(v)}</span></div>`).join("")}<h2 style="margin-top:14px">By status</h2><div class="chips">${Object.entries(stats).map(([k, v]) => `${stPill(k)} <span class="small">${v}</span>`).join(" ")}</div></div>
  <div class="card"><h2>Top 5 open</h2><div class="tw"><table><tbody>${LEAK.filter(L => L.status !== "Recovered").sort((a, b) => leakAmount(b, M) - leakAmount(a, M)).slice(0, 5).map(L => `<tr class="clickable" data-leak="${L.id}"><td class="sup">${esc(cl(L.client).short)}<div class="meta">${esc(L.cause)}</div></td><td class="r num">${money(leakAmount(L, M))}</td><td>${stPill(L.status)}</td></tr>`).join("")}</tbody></table></div></div></div>
  <div class="callout">This app never changes Xero, Dyspach or the WMS. A person decides, and a task is created to fix the other system by hand.</div>`;
}

/* ===== Notifications ===== */
let NOTIFS = [
  { id: "n1", kind: "staff", src: "Thomax", when: "23/10/2026 02:00", text: "New staff member in Thomax: J. Tran (code JTR04, Smithfield)", data: { name: "J. Tran", site: "smi", codes: { thomax: "JTR04", p3l: "", logiwa: "" } } },
  { id: "n2", kind: "client", src: "Dyspach export", when: "22/10/2026 16:20", text: "New client in Dyspach: Peppr Foods (Customer ID 10458)", data: { name: "Peppr Foods", dyspatch: "10458" } },
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
  if (n.kind === "client") return `<h3>Add client</h3><p class="small muted">Pre-filled from ${esc(n.src)}.</p><div class="formgrid"><label for="nc-n">Name</label><input id="nc-n" type="text" value="${esc(d.name)}"><label for="nc-s">Site</label><select id="nc-s"><option value="smi">Smithfield</option><option value="par">Parramatta</option></select><label for="nc-t">Type</label><select id="nc-t"><option>B2C</option><option>B2B</option><option>Mixed</option></select><label for="nc-st">Status</label><select id="nc-st"><option>Active</option><option>One-off services</option></select><label>Dyspach Customer ID</label><input type="text" value="${esc(d.dyspatch)}" disabled></div><div class="row"><button class="btn primary" data-savenotif="${id}">Save</button></div>`;
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
  const all = [...CLIENTS.map(c => ({ name: c.name, site: SITES[c.site], type: c.type, st: "Active", cmc: c.cmc, ids: `Xero ✓ · Dyspach ✓ · Thomax ✓ · Logiwa —`, id: c.id })), ...CLIENTS_EXTRA];
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
