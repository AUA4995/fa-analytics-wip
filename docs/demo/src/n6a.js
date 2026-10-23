/* ===== v3: shared helpers ===== */
const TODAY = new Date(2026, 9, 23);
let OVS = {};
const ovOn = (k, id) => OVS[k] === id;
const showBlk = (k, id) => !OVS[k] || OVS[k] === id;
function ovTiles(k, tiles) {
  return `<div class="kpis tabtiles ovtiles">${tiles.map(t => `<button class="kpi ${t.cls || ""}" data-ovs="${k}|${t.id}" aria-pressed="${ovOn(k, t.id)}"><div class="l">${t.l}</div><div class="v">${t.v}</div><div class="s">${t.s}</div>${t.spark ? spark(t.spark, t.sparkC) : ""}</button>`).join("")}</div>`;
}
function spark(arr, c = "var(--blue)") {
  const W = 120, H = 28, mn = Math.min(...arr), mx = Math.max(...arr), r = mx - mn || 1;
  const pts = arr.map((v, i) => `${(i / (arr.length - 1) * W).toFixed(1)},${(H - 3 - (v - mn) / r * (H - 6)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.6"/><circle cx="${W}" cy="${pts.split(" ").pop().split(",")[1]}" r="2.4" fill="${c}"/></svg>`;
}
const pdate = (s) => { if (!s) return null; if (s.includes("-")) { const [y, m, d] = s.split("-"); return new Date(+y, m - 1, +d); } const [d, m, y] = s.split("/"); const mm = +m; return new Date(y ? +y : (mm >= 7 ? 2026 : 2027), mm - 1, +d); };
const fd = (dt) => String(dt.getDate()).padStart(2, "0") + "/" + String(dt.getMonth() + 1).padStart(2, "0") + "/" + dt.getFullYear();
const iso = (dt) => dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
const addD = (dt, n) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
const monday = (dt) => addD(dt, -((dt.getDay() + 6) % 7));

/* ===== Leakage Overview v3 ===== */
Object.assign(LEAK[0], { found: "29/09/2026", owner: "Paul" });
Object.assign(LEAK[1], { found: "29/09/2026", owner: "David", recOn: "14/10/2026", recBy: "David" });
Object.assign(LEAK[2], { found: "30/09/2026", owner: "David" });
Object.assign(LEAK[3], { found: "02/10/2026", owner: "Natalia" });
Object.assign(LEAK[4], { found: "02/10/2026", owner: "Paul" });
Object.assign(LEAK[5], { found: "09/10/2026", owner: "Asal" });
const daysBetween = (a, b) => Math.round((pdate(b) - pdate(a)) / 864e5);
function pLeakOverview(M) {
  const amt = (L) => leakAmount(L, M), tot = LEAK.reduce((a, L) => a + amt(L), 0);
  const rec = LEAK.filter(L => L.status === "Recovered"), recTot = rec.reduce((a, L) => a + (L.recovered || 0), 0);
  const open = LEAK.filter(L => L.status !== "Recovered" && L.status !== "Explained"), days = rec.length ? rec.reduce((a, L) => a + daysBetween(L.found, L.recOn), 0) / rec.length : 0;
  const mism = Object.keys(DYSPATCH_RATE).length + Object.keys(WMS_RATE).length;
  let h = `<div class="ph"><div><h1>Leakage</h1><p>Revenue not collected · ${esc(PLABEL)} · click a card for its detail, again for all</p></div></div>` + ovTiles("leak", [
    { id: "found", l: "Found", v: m0(tot), s: `${LEAK.length} items · a month while unfixed` },
    { id: "rec", l: "Recovered", v: m0(recTot), s: `${rec.length} items · ≈ 100% to profit`, cls: "green" },
    { id: "open", l: "Open", v: open.length, s: m0(open.reduce((a, L) => a + amt(L), 0)) + " still leaking", cls: "red" },
    { id: "mism", l: "Rate mismatches", v: mism, s: "CLM vs Dyspatch vs WMS" },
    { id: "rate", l: "Recovery rate", v: pct(recTot / tot, 0), s: `avg ${days.toFixed(0)} days to recover` }]);
  const row = (L, extra) => `<tr class="clickable" data-leak="${L.id}"><td class="sup">${esc(cl(L.client).short)}</td><td>${L.code === "WK-MIN" ? "Weekly minimum" : esc(C(L.code).name)}<div class="meta">${esc(L.cause)}</div></td>${extra}</tr>`;
  if (showBlk("leak", "found") && OVS.leak) h += `<div class="card"><h2>All leakage found</h2><div class="tw"><table><thead><tr><th>Client</th><th>What</th><th>Type</th><th>Found</th><th class="r">$ / month</th><th>Status</th></tr></thead><tbody>${LEAK.map(L => row(L, `<td class="meta">${esc(L.kind)}</td><td class="num">${L.found}</td><td class="r num">${money(amt(L))}</td><td>${stPill(L.status)}</td>`)).join("")}<tr class="tot"><td colspan="4">Total</td><td class="r num">${money(tot)}</td><td></td></tr></tbody></table></div></div>`;
  if (showBlk("leak", "rec") && OVS.leak) h += `<div class="card"><h2>Recovered</h2><p class="sub">Billed by hand in Xero after a finding. The work was already done and paid for, so recovered money goes straight to profit.</p><div class="tw"><table><thead><tr><th>Client</th><th>What</th><th class="r">Recovered</th><th>Xero invoice</th><th>Recovered on</th><th>By</th><th class="r">Days to recover</th></tr></thead><tbody>${rec.map(L => row(L, `<td class="r num"><strong>${money(L.recovered)}</strong></td><td><a class="ref" href="https://go.xero.com" target="_blank" rel="noopener">${L.inv}</a></td><td class="num">${L.recOn || "—"}</td><td>${esc(L.recBy || "—")}</td><td class="r num">${L.recOn ? daysBetween(L.found, L.recOn) : "—"}</td>`)).join("") || '<tr><td colspan="7" class="empty">Nothing recovered yet.</td></tr>'}<tr class="tot"><td colspan="2">Total recovered · ${pct(recTot / tot, 0)} of found</td><td class="r num">${money(recTot)}</td><td colspan="4"></td></tr></tbody></table></div></div>`;
  if (showBlk("leak", "open") && OVS.leak) h += `<div class="card alert"><h2>Open</h2><div class="tw"><table><thead><tr><th>Client</th><th>What</th><th class="r">$ / month</th><th class="r">Age</th><th>Owner</th><th>Next step</th></tr></thead><tbody>${open.sort((a, b) => amt(b) - amt(a)).map(L => row(L, `<td class="r num">${money(amt(L))}</td><td class="r num">${daysBetween(L.found, fd(TODAY))}d</td><td>${esc(L.owner)}</td><td class="actions">${leakActions(L)}</td>`)).join("")}</tbody></table></div></div>`;
  if (showBlk("leak", "mism") && OVS.leak) { const rows = Object.keys({ ...DYSPATCH_RATE, ...WMS_RATE }).map(k => { const [c, code] = k.split("|"); return `<tr class="clickable" data-row="rc|${k}"><td class="sup">${esc(cl(c).short)}</td><td>${esc(C(code).name)}</td><td class="r num">${money(cl(c).rates[code])}</td><td class="r num">${DYSPATCH_RATE[k] != null ? money(DYSPATCH_RATE[k]) : money(cl(c).rates[code])}</td><td class="r num">${WMS_RATE[k] ? esc(WMS_RATE[k]) : money(cl(c).rates[code])}</td><td>Asal</td></tr>`; }).join("");
    h += `<div class="card"><h2>Rate mismatches</h2><div class="tw"><table><thead><tr><th>Client</th><th>Service</th><th class="r">CLM</th><th class="r">Dyspatch</th><th class="r">WMS</th><th>Decides</th></tr></thead><tbody>${rows}</tbody></table></div></div>`; }
  if (showBlk("leak", "rate") && OVS.leak) h += `<div class="card"><h2>Recovery rate</h2><dl class="dl"><dt>Found</dt><dd>${money(tot)} a month</dd><dt>Recovered</dt><dd>${money(recTot)}</dd><dt>Recovery rate</dt><dd><strong>${pct(recTot / tot, 1)}</strong></dd><dt>Average days to recover</dt><dd>${days.toFixed(0)} days (found → billed in Xero)</dd></dl><p class="meta">Main efficiency number for Mark's monthly report. Target to agree with Mark.</p></div>`;
  if (!OVS.leak) {
    const months = [["Sep 26", LEAK.filter(L => pdate(L.found).getMonth() === 8).reduce((a, L) => a + amt(L), 0), 0], ["Oct 26", LEAK.filter(L => pdate(L.found).getMonth() === 9).reduce((a, L) => a + amt(L), 0), recTot]];
    const mx = Math.max(...months.flatMap(m => [m[1], m[2]]));
    const types = {}; LEAK.forEach(L => { types[L.kind] = (types[L.kind] || 0) + amt(L); }); const tmx = Math.max(...Object.values(types));
    h += `<div class="grid2"><div class="card"><h2>Found vs recovered by month</h2><p class="sub">Leakage log started 29/09/2026.</p>${months.map(m => `<div class="catbar"><span>${m[0]}</span><span class="track"><i style="width:${m[1] / mx * 100}%;background:var(--red)"></i></span><span class="num small">${m0(m[1])} found</span></div><div class="catbar"><span></span><span class="track"><i style="width:${m[2] / mx * 100}%;background:var(--green)"></i></span><span class="num small">${m0(m[2])} recovered</span></div>`).join("")}</div>
    <div class="card"><h2>By type</h2>${Object.entries(types).map(([k, v]) => `<div class="catbar"><span>${esc(k)}</span><span class="track"><i style="width:${v / tmx * 100}%"></i></span><span class="num small">${m0(v)}</span></div>`).join("")}</div></div>
    <div class="card"><h2>Top 5 open</h2><div class="tw"><table><tbody>${open.sort((a, b) => amt(b) - amt(a)).slice(0, 5).map(L => row(L, `<td class="r num">${money(amt(L))}</td><td>${stPill(L.status)}</td>`)).join("")}</tbody></table></div></div>`;
  }
  return h + `<div class="callout">This app never changes Xero, Dyspatch or the WMS. A person decides, and a task is created to fix the other system by hand.</div>`;
}

/* ===== Improvements v3: ideas first, review deadlines, editable projects, roadmap, plans ===== */
PAGES.improve.subs = ["Overview", "Ideas", "Initiatives"];
Object.assign(IMPS.find(i => i.id === "i3"), { reviewBy: "2026-10-28", reviewer: "Mark", horizon: "Short term" });
Object.assign(IMPS.find(i => i.id === "i4"), { reviewBy: "2026-11-12", reviewer: "Paul", horizon: "Short term" });
Object.assign(IMPS.find(i => i.id === "i1"), { priority: 1, horizon: "Short term" });
Object.assign(IMPS.find(i => i.id === "i2"), { priority: 2, horizon: "Short term" });
Object.assign(IMPS.find(i => i.id === "i5"), { priority: 3, horizon: "Short term" });
IMPS.push(
  { id: "i6", name: "Flow wrap machine · business case", desc: "Flow wrap for flat items could cut packing minutes and materials. Needs a quote and volumes.", cat: "Equipment & automation", subcat: "New machine", detail: "", changes: ["Equipment", "Process & time", "Materials"], status: "Idea", type: "Hard saving", owner: "Asal", start: "", blocks: [], est: 7800, reviewBy: "2027-02-15", reviewer: "Mark", horizon: "Long term" },
  { id: "i7", name: "Racking extension · Smithfield", desc: "Two more racking bays so floor pallets go up and aisles clear.", cat: "Space", subcat: "Racking", detail: "", changes: ["Space", "Equipment"], status: "Approved", type: "Soft (capacity freed)", owner: "Asal", start: "2027-01-11", blocks: [{ k: "min", label: "Double-handling minutes per week", before: 900, after: 150, unit: "min", vol: 4.33, rate: 0.80 }], priority: 4, horizon: "Long term",
    project: { people: ["s1", "s2", "s10"], steps: [["Quotes for racking", "Asal", "11/01", "29/01", "todo"], ["Approval", "Mark", "01/02", "05/02", "todo"], ["Install", "Neil", "01/03", "26/03", "todo"], ["Move floor pallets", "Max", "29/03", "09/04", "todo"], ["Measure after", "Asal", "12/04", "30/04", "todo"]] } },
  { id: "i8", name: "Second CMC line · Parramatta", desc: "Parramatta B2C volume may justify its own CMC. Revisit after Logiwa go-live.", cat: "Equipment & automation", subcat: "CMC CartonWrap", detail: "", changes: ["Equipment", "Process & time"], status: "Idea", type: "Hard saving", owner: "Asal", start: "", blocks: [], est: 9500, reviewBy: "2027-05-03", reviewer: "Mark", horizon: "Long term" }
);
let RMZOOM = "Month", RMFOCUS = null;
function impSpan(i) {
  if (!isInit(i)) { const d = pdate(i.reviewBy); return d ? [d, d] : null; }
  const st = (i.project?.steps || []).filter(s => s[2]); if (!st.length) return null;
  return [pdate(st[0][2]), pdate(st[st.length - 1][3])];
}
const impProg = (i) => { const st = i.project?.steps || []; return st.length ? st.filter(s => s[4] === "done").length / st.length : 0; };
function roadmap() {
  const views = { Week: [monday(TODAY), addD(monday(TODAY), 7)], Month: [addD(TODAY, -7), addD(TODAY, 35)], Quarter: [addD(TODAY, -21), addD(TODAY, 100)], Year: [addD(TODAY, -60), addD(TODAY, 300)] };
  let rows, [a, b] = views[RMZOOM];
  const items = IMPS.filter(i => !["Rejected"].includes(i.status) && (icat === "All" || i.cat === icat));
  if (RMFOCUS) { const i = IMPS.find(x => x.id === RMFOCUS), sp = impSpan(i);
    rows = isInit(i) ? i.project.steps.map((s, k) => ({ id: i.id, label: s[0], meta: s[1], a: pdate(s[2]), b: pdate(s[3]), kind: "step", st: s[4] })) : [{ id: i.id, label: "Review deadline", meta: i.reviewer || "", a: pdate(i.reviewBy), b: pdate(i.reviewBy), kind: "idea" }];
    if (sp) { a = addD(sp[0], -5); b = addD(sp[1], 7); } }
  else rows = items.map(i => { const sp = impSpan(i); return sp ? { id: i.id, label: i.name, meta: isInit(i) ? `${i.status} · P${i.priority || "—"}` : `Idea · review by ${fd(sp[0])} · ${i.reviewer || ""}`, a: sp[0], b: sp[1], kind: isInit(i) ? "init" : "idea", prog: impProg(i) } : null; }).filter(Boolean).sort((x, y) => x.a - y.a);
  const W = 760, L = 220, R = 14, T = 26, RH = 26, H = T + rows.length * RH + 10, span = b - a, x = (d) => L + Math.max(0, Math.min(1, (d - a) / span)) * (W - L - R);
  let ticks = ""; const step = RMZOOM === "Week" ? 1 : RMZOOM === "Month" ? 7 : RMZOOM === "Quarter" ? 14 : 30;
  for (let d = new Date(a); d <= b; d = addD(d, step)) ticks += `<line x1="${x(d)}" x2="${x(d)}" y1="${T - 6}" y2="${H}" stroke="var(--border)"/><text x="${x(d) + 3}" y="${T - 10}">${RMZOOM === "Week" ? ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()] + " " + d.getDate() : d.getDate() + "/" + (d.getMonth() + 1)}</text>`;
  const bars = rows.map((r, k) => { const y = T + k * RH, inRange = r.b >= a && r.a <= b;
    const shape = r.kind === "idea" ? `<polygon points="${x(r.a)},${y + 5} ${x(r.a) + 8},${y + 13} ${x(r.a)},${y + 21} ${x(r.a) - 8},${y + 13}" fill="#e2a33a"/>`
      : r.kind === "step" ? `<rect x="${x(r.a)}" y="${y + 6}" width="${Math.max(4, x(r.b) - x(r.a))}" height="14" rx="4" fill="${({ done: "var(--green)", progress: "#e2a33a", late: "var(--red)", todo: "var(--blue-light)" })[r.st]}"/>`
      : `<rect x="${x(r.a)}" y="${y + 6}" width="${Math.max(4, x(r.b) - x(r.a))}" height="14" rx="4" fill="var(--blue-light)"/><rect x="${x(r.a)}" y="${y + 6}" width="${Math.max(0, (x(r.b) - x(r.a)) * r.prog)}" height="14" rx="4" fill="var(--blue)"/>`;
    return `<g class="rmrow" data-rm="${r.id}"><rect x="0" y="${y}" width="${W}" height="${RH}" fill="transparent"/><text x="6" y="${y + 13}" style="fill:var(--ink);font-weight:500">${esc(r.label.length > 30 ? r.label.slice(0, 29) + "…" : r.label)}</text><text x="6" y="${y + 23}" style="font-size:9.5px">${esc(r.meta)}</text>${inRange ? shape : ""}</g>`; }).join("");
  const today = TODAY >= a && TODAY <= b ? `<line x1="${x(TODAY)}" x2="${x(TODAY)}" y1="${T - 6}" y2="${H}" stroke="var(--red)" stroke-width="1.5"/><text x="${x(TODAY) + 3}" y="${H - 2}" style="fill:var(--red);font-weight:600">Today</text>` : "";
  return `<div class="row" style="justify-content:space-between;margin-bottom:8px"><div class="seg">${["Week", "Month", "Quarter", "Year"].map(z => `<button data-rmz="${z}" aria-pressed="${RMZOOM === z}">${z}</button>`).join("")}</div>${RMFOCUS ? `<button class="btn" data-rmback>← All items</button>` : '<span class="meta">Click a row to zoom into it</span>'}</div>
  <div class="tw"><svg class="roadmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Improvements timeline">${ticks}${today}${bars}</svg></div>
  <div class="row small muted" style="margin-top:6px"><span><i class="mc" style="background:#e2a33a;border-color:#e2a33a"></i> idea review deadline</span><span><i class="mc" style="background:var(--blue);border-color:var(--blue)"></i> initiative · done part</span><span><i class="mc" style="background:var(--blue-light);border-color:var(--blue-light)"></i> still to do</span></div>`;
}
function thisWeek() {
  const a = monday(TODAY), b = addD(a, 6), out = [];
  IMPS.forEach(i => { if (!isInit(i) && i.status === "Idea" && i.reviewBy) { const d = pdate(i.reviewBy); if (d >= a && d <= b) out.push({ d, t: `Review idea: ${i.name}`, who: i.reviewer, id: i.id, k: "idea" }); }
    (i.project?.steps || []).forEach(s => { const d = pdate(s[3]); if (d && d >= a && d <= b && s[4] !== "done") out.push({ d, t: `${i.name}: ${s[0]}`, who: s[1], id: i.id, k: "step" }); }); });
  return out.sort((x, y) => x.d - y.d);
}
function miniCal(y, m) {
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), off = (first.getDay() + 6) % 7, marks = {};
  IMPS.forEach(i => { if (i.status === "Idea" && i.reviewBy) { const d = pdate(i.reviewBy); if (d.getFullYear() === y && d.getMonth() === m) (marks[d.getDate()] = marks[d.getDate()] || []).push(["idea", i]); }
    (i.project?.steps || []).forEach(s => { const d = pdate(s[3]); if (d && d.getFullYear() === y && d.getMonth() === m && s[4] !== "done") (marks[d.getDate()] = marks[d.getDate()] || []).push(["step", i, s]); }); });
  let cells = "<span></span>".repeat(off);
  for (let d = 1; d <= days; d++) { const mk = marks[d], isT = y === TODAY.getFullYear() && m === TODAY.getMonth() && d === TODAY.getDate();
    cells += mk ? `<button class="cd has ${mk.some(x => x[0] === "idea") ? "idea" : ""} ${isT ? "today" : ""}" data-imp="${mk[0][1].id}" title="${esc(mk.map(x => x[0] === "idea" ? "Review: " + x[1].name : x[1].name + ": " + x[2][0]).join(" · "))}">${d}</button>` : `<span class="cd ${isT ? "today" : ""}">${d}</span>`; }
  return `<div class="mcal"><div class="mct">${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m]} ${y}</div><div class="mcg">${["M", "T", "W", "T", "F", "S", "S"].map(x => `<span class="dh">${x}</span>`).join("")}${cells}</div></div>`;
}
function longPlan() {
  const qs = [["Oct–Dec 2026", 2026, 9], ["Jan–Mar 2027", 2027, 0], ["Apr–Jun 2027", 2027, 3], ["Jul–Sep 2027", 2027, 6]];
  const inQ = (i, q) => { const sp = impSpan(i); if (!sp) return false; const qa = new Date(q[1], q[2], 1), qb = new Date(q[1], q[2] + 3, 0); return sp[0] <= qb && sp[1] >= qa; };
  return `<div class="qgrid">${qs.map(q => `<div class="qcol"><div class="qh">${q[0]}</div>${IMPS.filter(i => !["Rejected", "Parked"].includes(i.status) && inQ(i, q)).map(i => `<button class="qitem ${isInit(i) ? "init" : "idea"}" data-imp="${i.id}">${esc(i.name)}<span>${isInit(i) ? i.status : "Idea · review " + fd(pdate(i.reviewBy))}</span></button>`).join("") || '<span class="meta">—</span>'}</div>`).join("")}</div>`;
}
function pImprove(M) {
  const inits = IMPS.filter(isInit), ideas = IMPS.filter(i => !isInit(i));
  if (sub === "Overview") {
    const ver = inits.filter(i => ["Done", "Verified"].includes(i.status)), run = ver.reduce((a, i) => a + impSave(i), 0), prog = inits.filter(i => !["Done", "Verified"].includes(i.status));
    const waiting = ideas.filter(i => i.status === "Idea");
    let h = `<div class="ph"><div><h1>Improvements & savings</h1><p>Cost no longer spent (not leakage) · ${esc(PLABEL)} · click a card for its detail, again for all</p></div><button class="btn primary" data-act="newidea">+ New idea</button></div>` + ovTiles("imp", [
      { id: "del", l: "Savings delivered", v: m0(run * PF), s: `${PER === "Month" ? "a month" : esc(PLABEL)} · ${m0(run * 12)} a year run-rate` },
      { id: "prog", l: "Initiatives in progress", v: prog.length, s: `${inits.filter(i => (i.project?.steps || []).some(s => s[4] === "late")).length || "none"} late` },
      { id: "ideas", l: "Ideas waiting for review", v: waiting.length, s: `est. ${m0(waiting.reduce((a, i) => a + impSave(i), 0))} a month` },
      { id: "ver", l: "Verified", v: `${inits.filter(i => i.status === "Verified").length} of ${inits.length}`, s: "confirmed by 1–3 months of data" }]);
    const tbl = (list, cols) => `<div class="tw"><table><thead><tr><th>Item</th>${cols.map(c => `<th${c[2] ? ' class="r"' : ""}>${c[0]}</th>`).join("")}</tr></thead><tbody>${list.map(i => `<tr class="clickable" data-imp="${i.id}"><td class="sup">${esc(i.name)}<div class="meta">${esc(i.cat)} · ${esc(i.subcat)}</div></td>${cols.map(c => `<td${c[2] ? ' class="r num"' : ""}>${c[1](i)}</td>`).join("")}</tr>`).join("") || '<tr><td class="empty">Nothing here.</td></tr>'}</tbody></table></div>`;
    if (OVS.imp === "del") h += `<div class="card"><h2>Savings delivered</h2>${tbl(ver, [["Status", i => istPill(i.status)], ["Type", i => esc(i.type)], ["$ / month", i => m0(impSave(i)), 1], ["$ / year", i => m0(impSave(i) * 12), 1]])}</div>`;
    if (OVS.imp === "prog") h += `<div class="card"><h2>In progress</h2>${tbl(prog.sort((a, b) => (a.priority || 9) - (b.priority || 9)), [["Priority", i => "P" + (i.priority || "—")], ["Current step", i => { const s = (i.project?.steps || []).find(s => s[4] !== "done"); return s ? esc(s[0]) + ` <span class="meta">· ${esc(s[1])} · due ${s[3]}</span>` : "—"; }], ["Progress", i => ubar(impProg(i))], ["Saving / month", i => m0(impSave(i)), 1]])}</div>`;
    if (OVS.imp === "ideas") h += `<div class="card"><h2>Ideas waiting for review</h2>${tbl(waiting.sort((a, b) => pdate(a.reviewBy) - pdate(b.reviewBy)), [["Review by", i => { const d = pdate(i.reviewBy), late = d < TODAY; return `<span class="${late ? "delta-neg" : ""}">${fd(d)}</span>`; }], ["Reviewer", i => esc(i.reviewer || "—")], ["Horizon", i => esc(i.horizon || "—")], ["Est. / month", i => m0(impSave(i)), 1]])}</div>`;
    if (OVS.imp === "ver") h += `<div class="card"><h2>Verified</h2>${tbl(inits.filter(i => i.status === "Verified"), [["Saving / month", i => m0(impSave(i)), 1]])}<p class="meta">Mark a Done initiative as verified once 1–3 months of data confirm the saving.</p></div>`;
    if (!OVS.imp) {
      const tw = thisWeek();
      h += `<div class="card hl"><h2>This week</h2>${tw.length ? `<div class="tw"><table><tbody>${tw.map(x => `<tr class="clickable" data-imp="${x.id}"><td class="num nowrap">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][x.d.getDay()]} ${fd(x.d)}</td><td class="sup">${esc(x.t)}</td><td>${x.k === "idea" ? '<span class="pill p-amber">review</span>' : '<span class="pill p-blue">step due</span>'}</td><td>${esc(x.who || "")}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">Nothing due this week.</div>'}</div>
      <div class="card"><h2>Timeline · ideas and initiatives</h2><div class="chips" style="margin-bottom:8px">${["All", ...Object.keys(ICATS)].map(c => `<button class="btn ${icat === c ? "on" : ""}" data-icat="${esc(c)}">${esc(c)}</button>`).join("")}</div>${roadmap()}</div>
      <div class="grid2"><div class="card"><h2>Short-term plan · next 3 months</h2><p class="sub">Days with a review deadline (amber) or a step due (blue). Click a day.</p><div class="mcals">${miniCal(2026, 9)}${miniCal(2026, 10)}${miniCal(2026, 11)}</div></div>
      <div class="card"><h2>Long-term plan · 12 months</h2><p class="sub">Ideas and initiatives by quarter.</p>${longPlan()}</div></div>`;
    }
    return h;
  }
  const list = (sub === "Ideas" ? ideas : inits).filter(i => icat === "All" || i.cat === icat).sort((a, b) => sub === "Ideas" ? (pdate(a.reviewBy) || 0) - (pdate(b.reviewBy) || 0) : (a.priority || 9) - (b.priority || 9));
  return `<div class="ph"><div><h1>${sub}</h1><p>${sub === "Ideas" ? "First stage: proposed, not started. Each idea has a review deadline and a reviewer. Approve an idea to turn it into an initiative with a project." : "Approved and being done, in priority order. Open one to edit its project timeline."}</p></div><button class="btn primary" data-act="newidea">+ New idea</button></div>
  <div class="chips">${["All", ...Object.keys(ICATS)].map(c => `<button class="btn ${icat === c ? "on" : ""}" data-icat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
  <div class="card"><div class="tw"><table><thead><tr><th>${sub === "Ideas" ? "Idea" : "Initiative"}</th><th>Category</th><th>Status</th>${sub === "Ideas" ? "<th>Review by</th><th>Reviewer</th>" : "<th>Priority</th><th>Progress</th>"}<th class="r">${sub === "Ideas" ? "Est." : "Saving"} / month</th></tr></thead><tbody>
    ${list.map(i => `<tr class="clickable" data-imp="${i.id}"><td class="sup">${esc(i.name)}<div class="meta">${esc(i.desc)}</div></td><td>${esc(i.cat)}<div class="meta">${esc(i.subcat)}${i.detail ? " · " + esc(i.detail) : ""}</div></td><td>${istPill(i.status)}</td>${sub === "Ideas" ? `<td class="num ${pdate(i.reviewBy) < TODAY && i.status === "Idea" ? "delta-neg" : ""}">${i.reviewBy ? fd(pdate(i.reviewBy)) : "—"}</td><td>${esc(i.reviewer || "—")}</td>` : `<td>P${i.priority || "—"}</td><td>${ubar(impProg(i))}</td>`}<td class="r num">${m0(impSave(i))}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Nothing here yet.</td></tr>'}
  </tbody></table></div></div>`;
}
const OWNERS = ["Asal", "Mark", "Marcus", "Paul", "Neil", "Max", "Natalia", "David", "Khalid", "Tarek"];
function impHTML(id) {
  const i = IMPS.find(x => x.id === id), init = isInit(i), s = impSave(i), P = i.project;
  const blocks = i.blocks.map(b => `<tr><td>${esc(b.label)}</td><td class="r num">${b.unit === "$" ? money(b.before) : b.before + " " + b.unit}</td><td class="r num">${b.unit === "$" ? money(b.after) : b.after + " " + b.unit}</td><td class="r num">${num(b.vol)}</td><td class="r num"><strong>${m0((b.before - b.after) * b.vol * (b.k === "min" ? b.rate : 1))}</strong></td></tr>`).join("");
  const pplOpts = STAFF.filter(x => !(P?.people || []).includes(x.id));
  const dIn = (k, j, v) => `<input type="date" class="dsm" value="${v ? iso(pdate(v)) : ""}" data-stepd="${i.id}|${k}|${j}" aria-label="Date">`;
  return `<div class="row" style="justify-content:space-between"><h3>${esc(i.name)}</h3>${istPill(i.status)}</div><p class="small">${esc(i.desc)}</p>
  <dl class="dl"><dt>Category</dt><dd>${esc(i.cat)} → ${esc(i.subcat)}${i.detail ? " → " + esc(i.detail) : ""}</dd><dt>What changes</dt><dd>${i.changes.map(esc).join(" · ")}</dd><dt>Type</dt><dd>${esc(i.type)}</dd><dt>Horizon</dt><dd><select data-impf="${i.id}|horizon" aria-label="Horizon">${["Short term", "Long term"].map(o => `<option ${o === i.horizon ? "selected" : ""}>${o}</option>`).join("")}</select></dd>
  ${init ? `<dt>Priority</dt><dd><select data-impf="${i.id}|priority" aria-label="Priority">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(o => `<option ${o === i.priority ? "selected" : ""}>${o}</option>`).join("")}</select> <span class="meta">1 = do first</span></dd>` : `<dt>Review by</dt><dd><input type="date" value="${i.reviewBy || ""}" data-impf="${i.id}|reviewBy" aria-label="Review by"></dd><dt>Reviewer</dt><dd><select data-impf="${i.id}|reviewer" aria-label="Reviewer">${OWNERS.map(o => `<option ${o === i.reviewer ? "selected" : ""}>${o}</option>`).join("")}</select></dd>`}</dl>
  <div class="tsec"><div class="tsec-h">${init ? "Measured saving" : "Estimated saving"} · ${m0(s)} a month · ${m0(s * 12)} a year</div>${blocks ? `<table><thead><tr><th>Building block</th><th class="r">Before</th><th class="r">After</th><th class="r">Volume / month</th><th class="r">Saving</th></tr></thead><tbody>${blocks}</tbody></table>` : `<div class="small">Estimate: ${m0(i.est || 0)} a month. Claude proposes a calculation from the category and what changes.</div>`}</div>
  ${P ? `<div class="tsec"><div class="tsec-h">Project timeline · edit dates, owners, order</div><div class="steps">${P.steps.map((p, k) => `<div class="stp"><input type="text" value="${esc(p[0])}" data-stepn="${i.id}|${k}" aria-label="Step name">${dIn(k, 2, p[2])}${dIn(k, 3, p[3])}<select data-stepo="${i.id}|${k}" aria-label="Owner">${OWNERS.map(o => `<option ${o === p[1] ? "selected" : ""}>${o}</option>`).join("")}</select><select data-step="${i.id}|${k}" aria-label="Status">${[["todo", "Not started"], ["progress", "In progress"], ["done", "Done"], ["late", "Late"]].map(o => `<option value="${o[0]}" ${o[0] === p[4] ? "selected" : ""}>${o[1]}</option>`).join("")}</select><span class="stpb"><button class="lnk" data-stepmv="${i.id}|${k}|-1" title="Move up" aria-label="Move up">↑</button><button class="lnk" data-stepmv="${i.id}|${k}|1" title="Move down" aria-label="Move down">↓</button><button class="lnk" data-steprm="${i.id}|${k}" title="Remove" aria-label="Remove" style="color:var(--red)">×</button></span></div>`).join("")}</div>
    <div class="row" style="margin-top:8px"><button class="btn" data-stepadd="${i.id}">+ Add step</button><button class="btn" data-rmfocus="${i.id}">Show on timeline</button><span class="meta">Each step is a task for its owner, with reminders before the due date and when late.</span></div></div>
  <div class="tsec"><div class="tsec-h">People involved · suggested by Claude, edit freely</div><div class="chips">${P.people.map(pid => { const x = stf(pid); return `<span class="chip">${esc(x.name)} · ${esc(x.pos)}${x.login ? "" : ' <span class="meta">(no login)</span>'}<button data-rmppl="${i.id}|${pid}" aria-label="Remove">×</button></span>`; }).join("")}</div>
    <div class="row" style="margin-top:8px"><select id="addppl" aria-label="Add person">${pplOpts.map(x => `<option value="${x.id}">${esc(x.name)} · ${esc(x.pos)}</option>`).join("")}</select><button class="btn" data-addppl="${i.id}">Add</button></div></div>` : ""}
  <div class="row">${!init ? `<button class="btn primary" data-impact="approve|${i.id}">Approve → initiative</button><button class="btn" data-impact="park|${i.id}">Park</button><button class="btn danger" data-impact="reject|${i.id}">Reject</button>` : i.status === "Done" ? `<button class="btn primary" data-impact="verify|${i.id}">Mark verified</button>` : ""}<button class="lnk logsbtn" data-xlogs="imp|${i.id}|${esc(i.name)}">Logs</button></div>`;
}
