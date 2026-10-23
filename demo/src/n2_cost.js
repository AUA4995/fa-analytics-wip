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
