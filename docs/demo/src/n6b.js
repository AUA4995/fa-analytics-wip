/* ===== Rate review v3: Calendar · In progress · Workbench ===== */
PAGES.rates.subs = ["Calendar", "In progress", "Workbench"];
const RR_TYPES = { cpi: ["Annual CPI increase", "#1f54ee"], car: ["Carrier rate pass-through", "#e2a33a"], ren: ["Contract renewal", "#1e7a3c"], adh: ["Ad-hoc / below-cost", "#b42318"] };
const RR_MONTHS = ["Oct 26", "Nov", "Dec", "Jan 27", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
function rrEvents(c) {
  const ev = [], rd = pdate(c.renew), mIdx = (d) => (d.getFullYear() - 2026) * 12 + d.getMonth() - 9;
  const ri = mIdx(rd); if (ri >= 0 && ri < 12) ev.push([ri, "ren"]);
  const ci = (ri + 12 - 0) % 12; if (ci !== ri) {} // CPI on contract anniversary = same month as renewal in years without renewal
  ev.push([ri >= 0 && ri < 12 ? (ri + 6) % 12 : rd.getMonth() >= 9 ? rd.getMonth() - 9 : rd.getMonth() + 3, "cpi"]);
  ev.push([9, "car"]);
  if (c.lines?.some?.(l => l.marginPctT != null && l.marginPctT < 0)) ev.push([1, "adh"]);
  return ev;
}
let RRSTAGES = ["Preparing", "Analysis", "Proposal", "Client negotiation", "Signed", "Rates in WMS & Dyspach", "Checked on first invoice"];
let RRLIST = [
  { client: "mwu", type: "adh", stage: 2, owner: "Paul", due: "14/11/2026", note: "Order fee, pallet receiving and returns below cost" },
  { client: "11mode", type: "ren", stage: 0, owner: "Asal", due: "15/12/2026", note: "Renewal; returns rate mismatch to settle first" },
  { client: "sony", type: "ren", stage: 1, owner: "Asal", due: "31/12/2026", note: "Renewal; per-artist pick codes to collapse" },
  { client: "colx", type: "adh", stage: 0, owner: "Asal", due: "30/11/2026", note: "Pallet receiving and picking below cost" }
];
function pRates(M) {
  if (sub === "Calendar") {
    return `<div class="ph"><div><h1>Rate review calendar</h1><p>When each client's rates are reviewed in the next 12 months. Click a cell for details.</p></div><span class="pill p-amber">From CLM · coming soon (demo dates)</span></div>
    <div class="row small" style="margin-bottom:8px">${Object.values(RR_TYPES).map(t => `<span><i class="mc" style="background:${t[1]};border-color:${t[1]}"></i> ${t[0]}</span>`).join("")}</div>
    <div class="card"><div class="tw"><table class="rrcal"><thead><tr><th>Client</th>${RR_MONTHS.map(m => `<th class="c">${m}</th>`).join("")}</tr></thead><tbody>
    ${M.clients.map(c => { const ev = rrEvents(c); return `<tr><td class="sup">${esc(c.short)}<div class="meta">renews ${c.renew}</div></td>${RR_MONTHS.map((m, k) => { const e = ev.filter(x => x[0] === k); return `<td class="c">${e.map(x => `<button class="rrdot" style="background:${RR_TYPES[x[1]][1]}" data-row="rrev|${c.id}|${x[1]}|${k}" title="${RR_TYPES[x[1]][0]}" aria-label="${RR_TYPES[x[1]][0]} ${m}"></button>`).join("")}</td>`; }).join("")}</tr>`; }).join("")}</tbody></table></div>
    <p class="meta">Carrier pass-through follows the AusPost July increase. CPI on the contract anniversary. Ad-hoc reviews are started by the app when a line goes below cost.</p></div>`;
  }
  if (sub === "In progress") {
    return `<div class="ph"><div><h1>Reviews in progress</h1><p>Every open review and its stage. Click a card for details.</p></div><span class="pill p-amber">From CLM · coming soon</span></div>
    <div class="kanban">${RRSTAGES.map((st, k) => `<div class="kcol"><div class="kh">${esc(st)} <span class="count">${RRLIST.filter(r => r.stage === k).length}</span></div>${RRLIST.filter(r => r.stage === k).map(r => `<button class="kcard" data-row="rrp|${r.client}"><strong>${esc(cl(r.client).short)}</strong><span class="pill" style="background:${RR_TYPES[r.type][1]}22;color:${RR_TYPES[r.type][1]}">${RR_TYPES[r.type][0]}</span><span class="meta">${esc(r.owner)} · due ${r.due}</span></button>`).join("")}</div>`).join("")}</div>`;
  }
  return pRatesWorkbench(M);
}
function rrHTML(type, id) {
  const M = model();
  if (type === "rrev") { const [cid, t, k] = id.split("|"), c = M.clients.find(x => x.id === cid);
    return `<h3>${esc(c.short)} · ${RR_TYPES[t][0]}</h3><dl class="dl"><dt>Month</dt><dd>${RR_MONTHS[+k]}</dd><dt>Contract renews</dt><dd>${c.renew}</dd><dt>Current margin (TDABC)</dt><dd>${pct(c.marginT)}</dd></dl>
    <div class="callout">${t === "cpi" ? "Index rates by CPI on the contract anniversary (CLM holds the clause)." : t === "car" ? "Pass the carrier's July increase through to postage rates (Dyspach SELL cards)." : t === "ren" ? "Full rate review before renewal: cost, margin, volumes, new schedule of rates." : "Started because a service is priced below cost."}</div>
    <div class="row"><button class="btn primary" data-review="${cid}">Open in Workbench</button></div>`; }
  if (type === "rrp") { const r = RRLIST.find(x => x.client === id), c = M.clients.find(x => x.id === id);
    return `<h3>${esc(c.short)} · ${RR_TYPES[r.type][0]}</h3><dl class="dl"><dt>Stage</dt><dd><select data-rrstage="${id}" aria-label="Stage">${RRSTAGES.map((s, k) => `<option value="${k}" ${k === r.stage ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></dd><dt>Owner</dt><dd>${esc(r.owner)}</dd><dt>Due</dt><dd>${r.due}</dd><dt>Note</dt><dd>${esc(r.note)}</dd><dt>Margin now</dt><dd>${pct(c.marginT)} (TDABC)</dd></dl>
    <div class="tsec"><div class="tsec-h">Stages</div><ul class="tl">${RRSTAGES.map((s, k) => `<li class="${k < r.stage ? "k-out" : k === r.stage ? "k-note" : ""}"><div class="tl-h">${esc(s)}${k === r.stage ? " · now" : ""}</div></li>`).join("")}</ul></div>
    <div class="row"><button class="btn primary" data-review="${id}">Open in Workbench</button></div>`; }
  if (type === "rr") { const c = M.clients.find(x => x.id === rateClient), rows = c.lines.filter(l => !l.s.unbilled);
    const t = { newm: ["New margin / month", "Σ (new rate − TDABC cost) × 3-month average volume, billable services."], curm: ["Current margin / month", "Σ (current rate − TDABC cost) × 3-month average volume."], chg: ["Change / month", "New margin − current margin; × 12 for a year."], acc: ["Account management", "Front tickets × CSR minutes × CSR cost per minute. Not billed today: a candidate for a monthly account fee."] }[id];
    return `<h3>${t[0]} · ${esc(c.short)}</h3><div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">${esc(t[1])}</div></div><table><thead><tr><th>Service</th><th class="r">Rate</th><th class="r">Cost</th><th class="r">3-mo vol</th><th class="r">Margin / month</th></tr></thead><tbody>${rows.map(l => { const nr = newRates[c.id + "|" + l.code] ?? l.rate; return `<tr class="clickable" data-row="line|${c.id}|${l.code}"><td>${esc(l.s.name)}</td><td class="r num">${money(id === "curm" ? l.rate : nr)}</td><td class="r num">${money(l.unitT, 3)}</td><td class="r num">${num(l.avg3)}</td><td class="r num">${m0(((id === "curm" ? l.rate : nr) - l.unitT) * l.avg3)}</td></tr>`; }).join("")}</tbody></table>`; }
  return null;
}

/* ===== Reports v3 ===== */
REPORTS.length = 0;
REPORTS.push(
  { id: "r1", name: "Client workload · weekly", tpl: "workload", per: "Week", cls: "Internal", sched: "Mon 7:30", on: true, fc: false },
  { id: "r2", name: "Client trends · monthly", tpl: "monthly", per: "Month", cls: "Internal", sched: "1st business day", on: true, fc: false },
  { id: "r3", name: "Quarterly review", tpl: "quarterly", per: "Quarter", cls: "Internal", sched: "5th business day", on: false, fc: true },
  { id: "r7", name: "Year in review", tpl: "yearly", per: "Year", cls: "Internal", sched: "Off", on: false, fc: true },
  { id: "r5", name: "Client volumes", tpl: "volumes", per: "Month", cls: "Internal", sched: "Off", on: false, fc: false, clientSel: "" },
  { id: "r4", name: "Revenue protection · Mark", tpl: "mark", per: "Month", cls: "Internal", sched: "5th business day", on: true, fc: false }
);
Object.assign(TPL, { monthly: "Client trends (monthly)", quarterly: "Quarterly review with forecast", yearly: "Year in review with churn", volumes: "Client volumes (filter by client)" });
let WSEL = null;
const SKU_B = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "10+"];
const UNIT_B = ["1", "2", "3", "4–5", "6–10", "11–20", "21–50", "50+"];
function b2bShareOf(c) { return Math.min(0.9, c.b2bShare * Math.sqrt(20 / S.b2b)); }
function skuDist(c, kind) {
  if (kind === "b2b") { const w = SKU_B.map((_, k) => k < 10 ? Math.exp(-((k + 1 - 7) ** 2) / 14) : 1.6), t = w.reduce((a, b) => a + b, 0); return w.map(v => v / t); }
  const s1 = Math.max(0.2, Math.min(0.82, 1.25 - c.upo * 0.28)); const w = SKU_B.map((_, k) => k < 10 ? s1 * (1 - s1) ** k : (1 - s1) ** 10); const t = w.reduce((a, b) => a + b, 0); return w.map(v => v / t);
}
function unitDist(c, kind, single) {
  if (kind === "b2b") return [0, 0, 0, 0.01, 0.04, 0.15, 0.45, 0.35];
  if (single) return [0.62, 0.22, 0.09, 0.05, 0.02, 0, 0, 0];
  const u = c.upo, w = [Math.max(0.15, 0.95 - u * 0.33), 0.22, 0.14, 0.11, 0.06, 0.02, 0.01, 0.004], t = w.reduce((a, b) => a + b, 0); return w.map(v => v / t);
}
function wkData(c, i, f) {
  const O = Math.round(c.vols["ORD-FEE"] * f), bs = b2bShareOf(c), Ob = Math.round(O * bs), Oc = O - Ob;
  const dc = skuDist(c, "b2c"), db = skuDist(c, "b2b");
  let sku = SKU_B.map((_, k) => Oc * dc[k] + Ob * db[k]), units = UNIT_B.map((_, k) => Oc * unitDist(c, "b2c")[k] + Ob * unitDist(c, "b2b")[k]);
  if (WSEL === "single") { sku = SKU_B.map((_, k) => k === 0 ? Oc * dc[0] + Ob * db[0] : 0); units = UNIT_B.map((_, k) => sku[0] * unitDist(c, "b2c", true)[k]); }
  if (WSEL === "b2c") { sku = SKU_B.map((_, k) => Oc * dc[k]); units = UNIT_B.map((_, k) => Oc * unitDist(c, "b2c")[k]); }
  if (WSEL === "b2b") { sku = SKU_B.map((_, k) => Ob * db[k]); units = UNIT_B.map((_, k) => Ob * unitDist(c, "b2b")[k]); }
  sku = sku.map(Math.round); units = units.map(Math.round);
  const tot = sku.reduce((a, b) => a + b, 0), chg = (seeded(i, 4) - 0.4) * 0.3; { const dif = tot - units.reduce((a, b) => a + b, 0), mx = units.indexOf(Math.max(...units)); units[mx] += dif; }
  return { c, sku, units, tot, prev: Math.round(tot / (1 + chg)), chg, b2b: Ob, b2c: Oc, single: Math.round(Oc * dc[0] + Ob * db[0]) };
}
const nb = (n, p) => `<span class="nb"><strong>${num(n)}</strong><small>${p}</small></span>`;
function pWorkload(r) {
  const f = 0.23, all = CLIENTS.map((c, i) => wkData(c, i, f)), WS = WSEL; WSEL = null; const base = CLIENTS.map((c, i) => wkData(c, i, f)); WSEL = WS;
  const T = base.reduce((a, x) => a + x.tot, 0), Tb2b = base.reduce((a, x) => a + x.b2b, 0), Ts = base.reduce((a, x) => a + x.single, 0), U = CLIENTS.reduce((a, c) => a + c.vols["PCK-UNIT"] * f, 0);
  const rows = all.filter(x => x.tot > 0).sort((a, b) => b.tot - a.tot), FT = rows.reduce((a, x) => a + x.tot, 0), FTP = rows.reduce((a, x) => a + x.prev, 0);
  const colT = (arr) => arr.map((_, k) => rows.reduce((a, x) => a + arr[k](x), 0));
  const sumSku = SKU_B.map((_, k) => rows.reduce((a, x) => a + x.sku[k], 0)), sumU = UNIT_B.map((_, k) => rows.reduce((a, x) => a + x.units[k], 0));
  const visS = SKU_B.map((_, k) => sumSku[k] > 0), visU = UNIT_B.map((_, k) => sumU[k] > 0);
  const label = { single: "Single-SKU orders", b2c: "B2C orders", b2b: "B2B orders" }[WSEL] || "All orders";
  return `<div class="kpis tabtiles ovtiles">${[["all", "Total orders", num(T), `${T >= FTP ? "▲" : "▼"} ${pct(Math.abs(T - FTP) / FTP)} vs last week · ${(U / T).toFixed(2)} units / order`], ["single", "Single-SKU orders", num(Ts), pct(Ts / T, 0) + " of orders · easiest"], ["b2c", "B2C orders", num(T - Tb2b), pct((T - Tb2b) / T, 0) + ` · ≤ ${S.b2b} units`], ["b2b", "B2B orders", num(Tb2b), pct(Tb2b / T, 0) + ` · more than ${S.b2b} units`]].map(t => `<button class="kpi" data-wsel="${t[0]}" aria-pressed="${(WSEL || "all") === t[0]}"><div class="l">${t[1]}</div><div class="v">${t[2]}</div><div class="s">${t[3]}</div></button>`).join("")}</div>
  <p class="meta">Showing: <strong>${label}</strong> · B2B threshold ${fld("b2b")} (synced with Settings → Rules)</p>
  <div class="card"><h2>Orders by number of SKUs · ${label}</h2><p class="sub">Orders (big) and share of the client's orders (small). Click a client for its detail.</p><div class="tw"><table class="wk"><thead><tr><th>Client</th><th class="r">Orders</th>${SKU_B.map((b, k) => visS[k] ? `<th class="r">${b}</th>` : "").join("")}</tr></thead><tbody>
    ${rows.map(x => `<tr class="clickable" data-row="wl|${r.id}|${x.c.id}"><td class="sup">${esc(x.c.short)}</td><td class="r">${nb(x.tot, pct(x.tot / FT, 0) + " of total")}</td>${x.sku.map((v, k) => visS[k] ? `<td class="r">${nb(v, x.tot ? pct(v / x.tot, 0) : "—")}</td>` : "").join("")}</tr>`).join("")}
    <tr class="tot"><td>Total</td><td class="r">${nb(FT, "100%")}</td>${sumSku.map((v, k) => visS[k] ? `<td class="r">${nb(v, pct(v / FT, 0))}</td>` : "").join("")}</tr></tbody></table></div></div>
  <div class="card"><h2>Orders by number of units · ${label}</h2><div class="tw"><table class="wk"><thead><tr><th>Client</th><th class="r">Orders</th>${UNIT_B.map((b, k) => visU[k] ? `<th class="r">${b}</th>` : "").join("")}</tr></thead><tbody>
    ${rows.map(x => { const ut = x.units.reduce((a, b) => a + b, 0); return `<tr class="clickable" data-row="wl|${r.id}|${x.c.id}"><td class="sup">${esc(x.c.short)}</td><td class="r">${nb(ut, pct(ut / FT, 0) + " of total")}</td>${x.units.map((v, k) => visU[k] ? `<td class="r">${nb(v, ut ? pct(v / ut, 0) : "—")}</td>` : "").join("")}</tr>`; }).join("")}
    <tr class="tot"><td>Total</td><td class="r">${nb(sumU.reduce((a, b) => a + b, 0), "100%")}</td>${sumU.map((v, k) => visU[k] ? `<td class="r">${nb(v, pct(v / sumU.reduce((a, b) => a + b, 0), 0))}</td>` : "").join("")}</tr></tbody></table></div></div>
  <div class="card"><h2>Compared with previous week · ${label}</h2><div class="tw"><table><thead><tr><th>Client</th><th class="r">Previous</th><th class="r">This week</th><th class="r">Change</th><th style="min-width:160px"></th></tr></thead><tbody>
    ${rows.slice().sort((a, b) => b.chg - a.chg).map(x => { const w = Math.min(50, Math.abs(x.chg) * 160); return `<tr class="clickable" data-row="wl|${r.id}|${x.c.id}"><td class="sup">${esc(x.c.short)}</td><td class="r num">${num(x.prev)}</td><td class="r num">${num(x.tot)}</td><td class="r num ${x.chg >= 0 ? "delta-pos" : "delta-neg"}">${x.chg >= 0 ? "▲" : "▼"} ${pct(Math.abs(x.chg))}</td><td><div class="diverge"><span></span><i style="${x.chg >= 0 ? "left:50%" : "right:50%"};width:${w}%;background:${x.chg >= 0 ? "var(--green)" : "var(--red)"}"></i></div></td></tr>`; }).join("")}
    <tr class="tot"><td>Total</td><td class="r num">${num(FTP)}</td><td class="r num">${num(FT)}</td><td class="r num">${pct((FT - FTP) / FTP)}</td><td></td></tr></tbody></table></div></div>
  ${r.fc ? `<div class="card"><h2>Forecast · next week</h2><p class="sub">Seasonal method on WMS history; range shown.</p><div class="tw"><table><tbody>${rows.slice(0, 8).map(x => `<tr><td class="sup">${esc(x.c.short)}</td><td class="r num">${num(Math.round(x.tot * (1 + x.chg / 2)))}</td><td class="meta">${num(Math.round(x.tot * (1 + x.chg / 2) * 0.92))} – ${num(Math.round(x.tot * (1 + x.chg / 2) * 1.08))}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
}
const M24 = ["Oct 24", "Nov", "Dec", "Jan 25", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct 25", "Nov", "Dec", "Jan 26", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const ORD24 = [70100, 74800, 88200, 66900, 68300, 72600, 74100, 76300, 75200, 76900, 78400, 80100, ...[86400, 91200, 104800, 82100, 84900, 90300, 92600, 95100, 93800, 94700, 96200, 98000]];
function cliMonths(c, i) { const base = c.vols["ORD-FEE"]; return Array.from({ length: 24 }, (_, k) => Math.round(base * (k < 12 ? 0.78 : 1) * (0.86 + 0.14 * Math.sin((k + i) * 0.9) + (k === 2 || k === 14 ? 0.18 : 0)) * (k === 23 ? 1 / (0.86 + 0.14 * Math.sin((23 + i) * 0.9)) : 1))); }
function pMonthly(r) {
  const data = CLIENTS.map((c, i) => { const m = cliMonths(c, i); return { c, m, now: m[23], prev: m[22], ly: m[11] }; });
  const T = (k) => data.reduce((a, x) => a + x.m[k], 0), now = T(23), prev = T(22), ly = T(11);
  const wd = [0.17, 0.19, 0.18, 0.17, 0.16, 0.08, 0.05];
  return `<div class="kpis">${[["Orders this month", num(now), ""], ["vs last month", (now >= prev ? "▲ " : "▼ ") + pct(Math.abs(now - prev) / prev), now >= prev ? "green" : "red"], ["vs same month last year", "▲ " + pct((now - ly) / ly), "green"], ["New / lost clients", "1 / 0", ""], ["Returns rate", pct(CLIENTS.reduce((a, c) => a + c.vols.RTN, 0) / CLIENTS.reduce((a, c) => a + c.vols["ORD-FEE"], 0), 1), ""]].map(k => `<div class="kpi ${k[2]}"><div class="l">${k[0]}</div><div class="v">${k[1]}</div></div>`).join("")}</div>
  <div class="card"><h2>Clients · this month vs last month and last year</h2><div class="tw"><table><thead><tr><th>Client</th><th class="r">This month</th><th class="r">Last month</th><th class="r">Change</th><th class="r">Same month LY</th><th class="r">YoY</th><th>6 months</th><th>Trend</th></tr></thead><tbody>
  ${data.sort((a, b) => b.now - a.now).map(x => { const ch = (x.now - x.prev) / x.prev, yy = (x.now - x.ly) / x.ly; return `<tr class="clickable" data-client="${x.c.id}"><td class="sup">${esc(x.c.short)}</td><td class="r">${nb(x.now, pct(x.now / now, 0))}</td><td class="r num">${num(x.prev)}</td><td class="r num ${ch >= 0 ? "delta-pos" : "delta-neg"}">${ch >= 0 ? "▲" : "▼"} ${pct(Math.abs(ch))}</td><td class="r num">${num(x.ly)}</td><td class="r num ${yy >= 0 ? "delta-pos" : "delta-neg"}">${pct(yy)}</td><td>${spark(x.m.slice(18), ch >= 0 ? "var(--green)" : "var(--red)")}</td><td>${yy > 0.15 ? '<span class="pill p-green">growing</span>' : yy < -0.05 ? '<span class="pill p-red">declining</span>' : '<span class="pill p-grey">steady</span>'}</td></tr>`; }).join("")}</tbody></table></div></div>
  <div class="grid2"><div class="card"><h2>Mix shift</h2><table><thead><tr><th></th><th class="r">This month</th><th class="r">Last month</th></tr></thead><tbody><tr><td>B2B share of orders</td><td class="r num">4.2%</td><td class="r num">3.8%</td></tr><tr><td>Single-SKU share</td><td class="r num">52%</td><td class="r num">54%</td></tr><tr><td>Units per order</td><td class="r num">2.81</td><td class="r num">2.74</td></tr><tr><td>Orders through CMC</td><td class="r num">58%</td><td class="r num">51%</td></tr></tbody></table></div>
  <div class="card"><h2>Orders by weekday · average</h2>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, k) => `<div class="catbar"><span>${d}</span><span class="track"><i style="width:${wd[k] / 0.19 * 100}%"></i></span><span class="num small">${num(Math.round(now * wd[k] / 4.3))}</span></div>`).join("")}<p class="meta">Peak days this month: Tue 08/09, Mon 22/09 (promo, Kora).</p></div></div>
  ${r.fc ? `<div class="card"><h2>Forecast · next month</h2>${barChart(ORD24.slice(12), M24.slice(12), { fmt: v => Math.round(v / 1000) + "k", fc: fcast(ORD24.slice(12), 1), fcl: ["Oct 26"], aria: "Orders with next month forecast" })}</div>` : ""}`;
}
function pQuarterly(r) {
  const q = [0, 1, 2, 3, 4, 5, 6, 7].map(k => ORD24.slice(k * 3, k * 3 + 3).reduce((a, b) => a + b, 0)), ql = ["Q2 FY25", "Q3", "Q4", "Q1 FY26", "Q2", "Q3", "Q4", "Q1 FY27"];
  const now = q[7], prev = q[6], ly = q[3], fcq = Math.round(q[4] * now / ly);
  const cap = { smi: model().pools.floor_smi.practical, par: model().pools.floor_par.practical };
  return `<div class="kpis"><div class="kpi"><div class="l">Orders · Q1 FY27</div><div class="v">${num(now)}</div></div><div class="kpi green"><div class="l">vs previous quarter</div><div class="v">▲ ${pct((now - prev) / prev)}</div></div><div class="kpi green"><div class="l">vs same quarter last year</div><div class="v">▲ ${pct((now - ly) / ly)}</div></div>${r.fc ? `<div class="kpi"><div class="l">Forecast · Q2 FY27</div><div class="v">${num(fcq)}</div><div class="s">${num(Math.round(fcq * 0.94))} – ${num(Math.round(fcq * 1.06))} · peak season</div></div>` : ""}</div>
  <div class="card"><h2>Orders by quarter</h2>${(() => { const sv = FC; FC = r.fc; const h = barChart(q, ql, { fmt: v => Math.round(v / 1000) + "k", fc: [fcq], fcl: ["Q2 FY27"], aria: "Orders by quarter" }); FC = sv; return h; })()}</div>
  <div class="card"><h2>Clients · quarter vs quarter${r.fc ? " · with forecast" : ""}</h2><div class="tw"><table><thead><tr><th>Client</th><th class="r">Q1 FY27</th><th class="r">Q4 FY26</th><th class="r">QoQ</th><th class="r">Q1 FY26</th><th class="r">YoY</th>${r.fc ? '<th class="r">Forecast Q2</th><th>Range</th>' : ""}</tr></thead><tbody>
  ${CLIENTS.map((c, i) => { const m = cliMonths(c, i), a = m[21] + m[22] + m[23], b = m[18] + m[19] + m[20], l = m[9] + m[10] + m[11], f = Math.round(a * (m[12] + m[13] + m[14]) / l); return `<tr class="clickable" data-client="${c.id}"><td class="sup">${esc(c.short)}</td><td class="r">${nb(a, pct(a / now, 0))}</td><td class="r num">${num(b)}</td><td class="r num ${a >= b ? "delta-pos" : "delta-neg"}">${pct((a - b) / b)}</td><td class="r num">${num(l)}</td><td class="r num ${a >= l ? "delta-pos" : "delta-neg"}">${pct((a - l) / l)}</td>${r.fc ? `<td class="r num">${num(f)}</td><td class="meta">${num(Math.round(f * 0.92))} – ${num(Math.round(f * 1.08))}</td>` : ""}</tr>`; }).join("")}</tbody></table></div></div>
  ${r.fc ? `<div class="card"><h2>Capacity outlook · Q2 FY27</h2><p class="sub">Forecast labour minutes vs practical capacity per site (Base cost).</p>${[["Smithfield", 0.82 * fcq / now, cap.smi], ["Parramatta", 0.9 * fcq / now, cap.par]].map(x => `<div class="catbar"><span>${x[0]}</span><span class="track"><i style="width:${Math.min(100, x[1] * 100)}%;background:${x[1] > 0.95 ? "var(--red)" : x[1] > 0.85 ? "#e2a33a" : "var(--blue)"}"></i></span><span class="num small">${pct(x[1], 0)} of capacity</span></div>`).join("")}<p class="meta">Above 95% = plan extra casual shifts for the December peak.</p></div>` : ""}`;
}
const CHURN = { start: 31, end: 34, lost: [["Demo client · Peppermint (example)", "Mar 2026", 8400, 41200, "Moved to own warehouse"], ["Demo client · Urban Tea (example)", "Jun 2026", 3100, 15800, "Price (quoted below cost elsewhere)"], ["Demo client · Glow Lab (example)", "Aug 2026", 1900, 9700, "Business closed"]], won: [["Coastal Grl", "Aug 2025"], ["Elacia", "Jan 2026"], ["Demo client · Northside (example)", "Apr 2026"], ["Demo client · Kiwi Bites (example)", "Jul 2026"], ["Demo client · Lumen (example)", "Sep 2026"], ["Demo client · Peppr (example)", "Oct 2026"]] };
function pYearly(r) {
  const y1 = ORD24.slice(0, 12).reduce((a, b) => a + b, 0), y2 = ORD24.slice(12).reduce((a, b) => a + b, 0), lostRev = CHURN.lost.reduce((a, l) => a + l[3], 0), rev = FIN.rev12.reduce((a, b) => a + b, 0);
  const churn = CHURN.lost.length / CHURN.start;
  const sv = FC; FC = r.fc; const chart = lineChart([{ v: ORD24, c: "var(--blue)", area: true }], { labels: M24, fmt: v => Math.round(v / 1000) + "k", fc: fcast(ORD24.slice(12), 12, 1.08), fcl: ["Oct 26","Nov","Dec","Jan 27","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep"], aria: "Orders 24 months" }); FC = sv;
  const heat = CLIENTS.map((c, i) => { const m = cliMonths(c, i).slice(12), mx = Math.max(...m); return `<tr class="clickable" data-client="${c.id}"><td class="sup">${esc(c.short)}</td>${m.map(v => `<td class="hm" style="background:color-mix(in srgb, var(--blue) ${Math.round(v / mx * 85)}%, white)" title="${num(v)}"></td>`).join("")}</tr>`; }).join("");
  return `<div class="kpis"><div class="kpi"><div class="l">Orders · last 12 months</div><div class="v">${num(y2)}</div><div class="s">▲ ${pct((y2 - y1) / y1)} vs year before</div></div><div class="kpi"><div class="l">Clients</div><div class="v">${CHURN.start} → ${CHURN.end}</div><div class="s">${CHURN.won.length} won · ${CHURN.lost.length} lost</div></div><div class="kpi ${churn > 0.1 ? "red" : "amber"}"><div class="l">Client churn rate</div><div class="v">${pct(churn)}</div><div class="s">lost ÷ clients at start of year</div></div><div class="kpi amber"><div class="l">Revenue churn</div><div class="v">${pct(lostRev / rev)}</div><div class="s">${m0(lostRev)} a year lost with them</div></div></div>
  <div class="card"><h2>Orders · 24 months${r.fc ? " · with next-year forecast" : ""}</h2>${chart}</div>
  <div class="card"><h2>Churn details · clients lost this year</h2><div class="tw"><table><thead><tr><th>Client</th><th>Last order</th><th class="r">Orders / month before leaving</th><th class="r">Revenue lost / year</th><th>Reason</th></tr></thead><tbody>${CHURN.lost.map(l => `<tr><td class="sup">${esc(l[0])}</td><td>${l[1]}</td><td class="r num">${num(l[2])}</td><td class="r num">${m0(l[3])}</td><td class="meta">${esc(l[4])}</td></tr>`).join("")}</tbody></table></div><p class="meta">Reasons come from Front threads and CLM notes. Churn rate = clients lost ÷ clients at the start of the year; revenue churn = their last-12-month revenue ÷ total revenue.</p></div>
  <div class="grid2"><div class="card"><h2>New clients this year</h2><table><tbody>${CHURN.won.map(w => `<tr><td class="sup">${esc(w[0])}</td><td class="meta">${w[1]}</td></tr>`).join("")}</tbody></table></div>
  <div class="card"><h2>Seasonality · orders by month (last 12)</h2><div class="tw"><table class="heat"><thead><tr><th></th>${M24.slice(12).map(m => `<th>${m.slice(0, 3)}</th>`).join("")}</tr></thead><tbody>${heat}</tbody></table></div></div></div>`;
}
function pVolumes(r) {
  const sel = r.clientSel, cs = CLIENTS.filter(c => !sel || c.id === sel);
  const sum = (k) => cs.reduce((a, c) => a + c.vols[k], 0);
  return `<div class="row"><label class="small" for="vsel">Client</label><select id="vsel" data-vsel="${r.id}"><option value="">All clients</option>${CLIENTS.map(c => `<option value="${c.id}" ${sel === c.id ? "selected" : ""}>${esc(c.short)}</option>`).join("")}</select><span class="meta">${sel ? "One client selected: this report can be sent to that client (Client-safe, volumes only)." : "All clients: internal only."}</span></div>
  <div class="kpis">${[["Orders", sum("ORD-FEE")], ["Units picked", sum("PCK-UNIT")], ["Cartons received", sum("RCV-CTN")], ["Pallet-weeks stored", sum("STO-PLT")], ["Returns", sum("RTN")]].map(k => `<div class="kpi"><div class="l">${k[0]}</div><div class="v">${num(k[1])}</div></div>`).join("")}</div>
  <div class="card"><h2>Volumes by client · ${MONTH}</h2><div class="tw"><table><thead><tr><th>Client</th><th class="r">Orders</th><th class="r">Units</th><th class="r">Cartons in</th><th class="r">Pallets in</th><th class="r">Pallet-weeks</th><th class="r">Returns</th></tr></thead><tbody>${cs.map(c => `<tr class="clickable" data-client="${c.id}"><td class="sup">${esc(c.short)}</td>${["ORD-FEE", "PCK-UNIT", "RCV-CTN", "RCV-PLT", "STO-PLT", "RTN"].map(k => `<td class="r num">${num(c.vols[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
  ${r.fc ? `<div class="card"><h2>Forecast · next month</h2><div class="tw"><table><tbody>${cs.map(c => `<tr><td class="sup">${esc(c.short)}</td><td class="r num">${num(Math.round(c.vols["ORD-FEE"] * 1.04))} orders</td><td class="meta">range ${num(Math.round(c.vols["ORD-FEE"] * 0.95))} – ${num(Math.round(c.vols["ORD-FEE"] * 1.12))}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
}
function pReports(M) {
  if (sub === "+ New report" || newRep) {
    return `<div class="card"><h2>New report</h2><p class="sub">Each report you save appears as its own item in the Reports menu.</p><div class="dl" style="grid-template-columns:max-content minmax(0,1fr);align-items:center">
      <dt><label for="nr-n">Name</label></dt><dd><input id="nr-n" type="text" placeholder="e.g. Client workload · fortnightly" style="width:min(340px,100%)"></dd>
      <dt><label for="nr-t">Template</label></dt><dd><select id="nr-t">${Object.entries(TPL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></dd>
      <dt><label for="nr-p">Period</label></dt><dd><select id="nr-p"><option>Week</option><option selected>Month</option><option>Quarter</option><option>Year</option></select></dd>
      <dt><label for="nr-c">Type</label></dt><dd><select id="nr-c"><option>Internal</option><option>Client-safe</option></select> <select id="nr-cl" aria-label="Client"><option value="">All clients</option>${CLIENTS.map(c => `<option value="${c.id}">${esc(c.short)}</option>`).join("")}</select></dd></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="saverep">Save report</button></div></div>`;
  }
  const r = REPORTS.find(x => x.name === sub) || REPORTS[0];
  const head = `<div class="ph"><div><h1>${esc(r.name)}</h1><p>${esc(TPL[r.tpl])} · <span class="pill ${r.cls === "Internal" ? "p-purple" : "p-green"}">${r.cls}</span> · schedule: ${r.on ? esc(r.sched) : "off"}</p></div>
    <div class="row"><label class="fcst" for="rfc-${r.id}"><input type="checkbox" id="rfc-${r.id}" data-rfc="${r.id}" ${r.fc ? "checked" : ""}> Include forecast</label><button class="btn primary" data-share="${r.id}">Email / PDF</button><button class="btn danger" data-delrep="${r.id}">Delete</button></div></div>`;
  const svFC = FC; FC = !!r.fc; let body; try { body = ({ workload: pWorkload, monthly: pMonthly, quarterly: pQuarterly, yearly: pYearly, volumes: pVolumes, mark: () => pReport(M).replace("<h1>Monthly report for Mark</h1>", "<h2>Email preview</h2>") }[r.tpl] || pWorkload)(r); } finally { FC = svFC; }
  return head + body + (r.tpl !== "mark" ? `<div class="callout purple"><span class="ai">AI</span> Claude writes a short summary at the top of the PDF from the figures shown${r.fc ? ", including the forecast" : ""}.</div>` : "");
}
