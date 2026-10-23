/* ===== Finance v3 ===== */
const fk = (v) => (v < 0 ? "−" : "") + "$" + Math.round(Math.abs(v) / 1000).toLocaleString("en-AU") + "k";
const F2 = (() => {
  const revLY = FIN.rev12.map((v, k) => Math.round(v * (0.86 + 0.02 * Math.sin(k)))), ebLY = FIN.ebitda12.map((v, k) => Math.round(v * (0.74 + 0.03 * Math.cos(k))));
  const rev = [...revLY, ...FIN.rev12], eb = [...ebLY, ...FIN.ebitda12];
  const gm = rev.map((v, k) => 21.2 + k * 0.07 + 0.5 * Math.sin(k * 1.3));
  const cash = rev.map((v, k) => Math.round(290000 + k * 4300 + 14000 * Math.sin(k * 0.8)));
  cash[23] = 390100;
  const dscr = rev.map((v, k) => +(1.34 + k * 0.012 + 0.03 * Math.sin(k)).toFixed(2)); dscr[23] = 1.62;
  const debt = [["CMC equipment finance", 486000, 7.9, 11200, "03/2030", "Secured on CMC CartonWrap"], ["Business loan", 620000, 8.4, 9800, "06/2031", "Secured on Parramatta property"], ["Forklift lease", 58000, 9.1, 1900, "11/2027", "Equipment"], ["Overdraft (limit $150k)", 0, 9.6, 0, "Rolling", "Unused"]];
  const debtTot = debt.reduce((a, d) => a + d[1], 0), eb12 = FIN.ebitda12.reduce((a, b) => a + b, 0), service = debt.reduce((a, d) => a + d[3], 0) * 12;
  return { rev, eb, gm, cash, dscr, debt, debtTot, eb12, service, curRatio: 1.31,
    dd: [41, 40, 40, 39, 38, 38, 37, 36, 36, 35, 34, 34], cd: [31, 30, 31, 30, 29, 30, 29, 29, 28, 29, 29, 29],
    ar: [["Current", 402000], ["1–30 days", 118000], ["31–60 days", 41000], ["61–90 days", 12000], ["90+ days", 6000]],
    ap: [["Current", 233000], ["1–30 days", 61000], ["31–60 days", 9000], ["61–90 days", 2000], ["90+ days", 0]],
    overdue: [["11mode", "1–30 days", 22100, "Reminder sent 15/10"], ["mwu", "31–60 days", 18400, "Disputed returns charge"], ["colx", "61–90 days", 9100, "Payment plan agreed"], ["coastal", "90+ days", 4200, "Weekly minimum top-ups"], ["elacia", "1–30 days", 7600, ""]],
    cf: [["Opening cash", 386000, "t"], ["EBITDA", 54000], ["Working capital", -9000], ["Capex", -6000], ["Tax (BAS, PAYG)", -12000], ["Loan principal", -16500], ["Interest", -6400], ["Closing cash", 390100, "t"]]
  };
})();
const FACC = {
  Revenue: [["4000 · Storage", 0.31], ["4010 · Pick & pack", 0.38], ["4020 · Receiving", 0.09], ["4030 · Postage recharged", 0.17], ["4090 · Other services", 0.05]],
  "Cost of services": [["5000 · Wages · floor", 0.41], ["5010 · Super & on-costs", 0.09], ["5020 · Labour hire (casuals)", 0.12], ["5100 · Packaging materials", 0.11], ["5200 · Postage (carriers)", 0.21], ["5300 · Equipment lease & running", 0.06]],
  Overheads: [["6000 · Rent · Smithfield", 0.38], ["6010 · Admin & management wages", 0.33], ["6100 · Software & subscriptions", 0.09], ["6200 · Insurance", 0.07], ["6300 · Utilities", 0.06], ["6900 · Other overheads", 0.07]],
  "Depreciation & interest": [["7000 · Depreciation", 0.68], ["7100 · Interest", 0.32]]
};
let FINEXP = {}, FINPCT = false;
function plMonth(rev, eb) { const cos = -rev * 0.773, gp = rev + cos, oh = -(gp - eb), di = -Math.round(rev * 0.033); return { Revenue: rev, "Cost of services": cos, "Gross profit": gp, Overheads: oh, EBITDA: eb, "Depreciation & interest": di, "Net profit before tax": eb + di }; }
function comboChart(rev, ebp, labels) {
  const fcOn = FC, fr = fcOn ? fcast(rev.slice(12), 6, 1.07) : [], fe = fcOn ? ebp.slice(12, 18).map(v => v + 0.6) : [];
  const R = [...rev, ...fr], E = [...ebp, ...fe], L = [...labels, ...(fcOn ? FC_LABELS : [])], n = R.length;
  const W = 760, H = 260, l = 52, r = 44, t = 18, b = 30, mx = Math.max(...R) * 1.1, emx = 14, bw = (W - l - r) / n;
  const y = (v) => t + (1 - v / mx) * (H - t - b), ye = (v) => t + (1 - v / emx) * (H - t - b), xc = (i) => l + i * bw + bw / 2;
  let g = ""; for (let k = 0; k <= 4; k++) { const v = mx / 4 * k; g += `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end">${fk(v)}</text><text x="${W - r + 6}" y="${ye(emx / 4 * k) + 4}">${(emx / 4 * k).toFixed(0)}%</text>`; }
  const bars = R.map((v, i) => { const f = i >= rev.length; return `<rect x="${xc(i) - bw * 0.32}" y="${y(v)}" width="${bw * 0.64}" height="${y(0) - y(v)}" rx="2" fill="${f ? "none" : i === rev.length - 1 ? "var(--blue)" : "var(--blue-light)"}" ${f ? 'stroke="var(--blue)" stroke-dasharray="3 2"' : ""}><title>${L[i]}: ${fk(v)}</title></rect>`; }).join("");
  const line = (arr, off, dash) => `<path d="${arr.map((v, i) => `${i ? "L" : "M"}${xc(i + off).toFixed(1)},${ye(v).toFixed(1)}`).join("")}" fill="none" stroke="var(--header)" stroke-width="2" ${dash ? 'stroke-dasharray="5 4"' : ""}/>`;
  const dots = ebp.map((v, i) => `<circle cx="${xc(i)}" cy="${ye(v)}" r="2.6" fill="var(--header)"><title>${L[i]}: EBITDA ${v.toFixed(1)}%</title></circle>`).join("");
  const lab = L.map((m, i) => i % 3 === 0 || i === n - 1 ? `<text x="${xc(i)}" y="${H - 9}" text-anchor="middle" ${i >= rev.length ? 'style="font-style:italic"' : ""}>${m}</text>` : "").join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue and EBITDA margin, 24 months">${g}${bars}${line(ebp, 0)}${fcOn ? line([ebp[ebp.length - 1], ...fe], ebp.length - 1, 1) : ""}${dots}${lab}</svg></div>
  <div class="row small muted"><span><i class="mc" style="background:var(--blue-light);border-color:var(--blue-light)"></i> Revenue (left)</span><span><i class="mc" style="background:var(--header);border-color:var(--header)"></i> EBITDA % of revenue (right)</span>${fcOn ? "<span>dashed = forecast</span>" : ""}</div>`;
}
function waterfall(items, aria, W = 760) {
  const H = W < 600 ? 280 : 250, l = 56, r = 10, t = 18, b = 44, n = items.length, bw = (W - l - r) / n;
  let run = 0; const bars = items.map(it => { let a, z; if (it[2] === "t") { a = 0; z = it[1]; run = it[1]; } else { a = run; z = run + it[1]; run = z; } return { lab: it[0], v: it[1], a, z, tot: it[2] === "t" }; });
  const mx = Math.max(...bars.map(x => Math.max(x.a, x.z))) * 1.08, mn = Math.min(0, ...bars.map(x => Math.min(x.a, x.z)));
  const y = (v) => t + (1 - (v - mn) / (mx - mn)) * (H - t - b);
  let g = ""; for (let k = 0; k <= 4; k++) { const v = mn + (mx - mn) / 4 * k; g += `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end">${fk(v)}</text>`; }
  const rects = bars.map((x, i) => { const top = y(Math.max(x.a, x.z)), h = Math.max(1.5, Math.abs(y(x.a) - y(x.z))), c = x.tot ? "var(--header)" : x.v >= 0 ? "var(--green)" : "var(--red)", cx = l + i * bw + bw / 2;
    return `<rect x="${cx - bw * 0.3}" y="${top}" width="${bw * 0.6}" height="${h}" rx="2" fill="${c}"/>${i < n - 1 ? `<line x1="${cx + bw * 0.3}" x2="${cx + bw * 0.7}" y1="${y(x.z)}" y2="${y(x.z)}" stroke="var(--muted)" stroke-dasharray="2 2"/>` : ""}<text x="${cx}" y="${top - 5}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${x.tot ? fk(x.v) : (x.v >= 0 ? "+" : "") + fk(x.v)}</text><text x="${cx}" y="${H - 26}" text-anchor="middle">${esc(x.lab.split(" ")[0])}</text><text x="${cx}" y="${H - 13}" text-anchor="middle">${esc(x.lab.split(" ").slice(1).join(" "))}</text>`; }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${g}${rects}</svg></div>`;
}
function gauge(label, v, min, max, bands, fmtv, note, rowId) {
  const W = 220, H = 130, cx = 110, cy = 112, R = 86, ang = (x) => Math.PI * (1 - (Math.max(min, Math.min(max, x)) - min) / (max - min));
  const pt = (x, rr) => [cx + rr * Math.cos(ang(x)), cy - rr * Math.sin(ang(x))];
  const arcs = bands.map(([a, z, c]) => { const [x1, y1] = pt(a, R), [x2, y2] = pt(z, R); return `<path d="M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2}" fill="none" stroke="${c}" stroke-width="16"/>`; }).join("");
  const [nx, ny] = pt(v, R - 26), st = bands.find(([a, z]) => v >= a && v <= z)?.[2] || "var(--muted)";
  return `<button class="gauge" data-row="fin|${esc(rowId)}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} ${fmtv}">${arcs}<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="6" fill="var(--ink)"/></svg><div class="gv">${fmtv}</div><div class="gl">${esc(label)}</div><div class="meta">${esc(note)}</div></button>`;
}
const G_OK = "#1e7a3c", G_AM = "#e2a33a", G_BAD = "#b42318";
function bankGauges() {
  const de = F2.debtTot / F2.eb12;
  return `<div class="gauges">${gauge("DSCR", 1.62, 0, 3, [[0, 1.25, G_BAD], [1.25, 1.5, G_AM], [1.5, 3, G_OK]], "1.62×", "lender minimum usually 1.25×", "DSCR")}${gauge("Debt / EBITDA", de, 0, 5, [[0, 2.5, G_OK], [2.5, 3.5, G_AM], [3.5, 5, G_BAD]], de.toFixed(1) + "×", "under 2.5× is comfortable", "Debt / EBITDA")}${gauge("Current ratio", F2.curRatio, 0, 3, [[0, 1, G_BAD], [1, 1.2, G_AM], [1.2, 3, G_OK]], F2.curRatio.toFixed(2), "above 1.2 is healthy", "Current ratio")}</div>`;
}
function plTable() {
  const idx = [18, 19, 20, 21, 22, 23], ms = idx.map(k => plMonth(F2.rev[k], F2.eb[k])), s12 = {}, sLY = {};
  for (let k = 12; k < 24; k++) { const p = plMonth(F2.rev[k], F2.eb[k]); for (const key in p) s12[key] = (s12[key] || 0) + p[key]; }
  for (let k = 0; k < 12; k++) { const p = plMonth(F2.rev[k], F2.eb[k]); for (const key in p) sLY[key] = (sLY[key] || 0) + p[key]; }
  const cell = (v, rev) => FINPCT ? `<td class="r num">${(v / rev * 100).toFixed(1)}%</td>` : `<td class="r num">${fk(v)}</td>`;
  const rows = Object.keys(ms[0]).map(key => { const tot = ["Gross profit", "EBITDA", "Net profit before tax"].includes(key), acc = FACC[key], open = FINEXP[key], yoy = (s12[key] - sLY[key]) / Math.abs(sLY[key]);
    let h = `<tr class="${tot ? "tot" : "clickable"}" ${acc ? `data-finx="${esc(key)}"` : ""}><td class="sup">${acc ? `<span class="caret">${open ? "▾" : "▸"}</span> ` : ""}${esc(key)}</td>${ms.map((m, i) => cell(m[key], ms[i].Revenue)).join("")}${cell(s12[key], s12.Revenue)}${cell(sLY[key], sLY.Revenue)}<td class="r num ${(key === "Revenue" || tot) ? (yoy >= 0 ? "delta-pos" : "delta-neg") : ""}">${yoy >= 0 ? "+" : ""}${(yoy * 100).toFixed(1)}%</td></tr>`;
    if (acc && open) h += acc.map(([a, sh]) => `<tr class="clickable sub" data-row="fin|${esc(a)}"><td class="sup">${esc(a)}</td>${ms.map((m, i) => cell(m[key] * sh, ms[i].Revenue)).join("")}${cell(s12[key] * sh, s12.Revenue)}${cell(sLY[key] * sh, sLY.Revenue)}<td class="r num meta">${(yoy * 100).toFixed(1)}%</td></tr>`).join("");
    return h; }).join("");
  return `<div class="tw"><table class="pl"><thead><tr><th></th>${idx.map(k => `<th class="r">${M24[k].replace(" 26", "")}</th>`).join("")}<th class="r">Last 12 mo</th><th class="r">Year before</th><th class="r">YoY</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function pFinance() {
  const r = F2.rev, e = F2.eb, ebp = r.map((v, k) => e[k] / v * 100), L24 = M24;
  if (sub === "P&L") return `<div class="ph"><div><h1>Profit & loss</h1><p>From Xero P&L, read-only. Click a line to see its Xero accounts.</p></div><label class="fcst"><input type="checkbox" data-finpct ${FINPCT ? "checked" : ""}> Show as % of revenue</label></div>
    <div class="card"><h2>By month · last 6 months, 12-month totals and YoY</h2>${plTable()}</div>
    <div class="card"><h2>Financial years · $ million</h2><div class="tw"><table><thead><tr><th></th><th class="r">FY24</th><th class="r">FY25</th><th class="r">FY26</th><th class="r">FY27 YTD (Q1)</th></tr></thead><tbody>${FIN.pl.map(l => `<tr class="clickable ${["Gross profit", "EBITDA", "Net profit before tax"].includes(l[0]) ? "tot" : ""}" data-row="fin|${esc(l[0])}"><td class="sup">${esc(l[0])}</td>${l.slice(1).map(v => `<td class="r num">${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  if (sub === "Cash & debt") return `<div class="ph"><div><h1>Cash & debt</h1><p>Where the month's cash went, what we owe, and how comfortably we cover repayments.</p></div></div>
    <div class="card"><h2>Cash flow · ${MONTH}</h2><p class="sub">Opening cash → closing cash. Green adds cash, red uses it.</p>${waterfall(F2.cf, "Cash flow waterfall")}</div>
    <div class="grid2"><div class="card"><h2>DSCR · 24 months</h2><p class="sub">Dashed line = lender minimum 1.25×.</p>${lineChart([{ v: F2.dscr, c: "var(--blue)" }], { labels: L24, fmt: v => v.toFixed(2) + "×", min: 1, max: 2, lines: [{ v: 1.25, c: "var(--red)", t: "Minimum 1.25×" }], aria: "DSCR trend" })}</div>
    <div class="card"><h2>Bank health</h2>${bankGauges()}</div></div>
    <div class="card"><h2>Debt schedule</h2><div class="tw"><table><thead><tr><th>Facility</th><th class="r">Balance</th><th class="r">Rate</th><th class="r">Repayment / month</th><th>Ends</th><th>Security</th></tr></thead><tbody>${F2.debt.map(d => `<tr class="clickable" data-row="fin|${esc(d[0])}"><td class="sup">${esc(d[0])}</td><td class="r num">${m0(d[1])}</td><td class="r num">${d[2]}%</td><td class="r num">${d[3] ? m0(d[3]) : "—"}</td><td class="num">${d[4]}</td><td class="meta">${esc(d[5])}</td></tr>`).join("")}<tr class="tot"><td>Total</td><td class="r num">${m0(F2.debtTot)}</td><td></td><td class="r num">${m0(F2.service / 12)}</td><td colspan="2" class="meta">${m0(F2.service)} a year</td></tr></tbody></table></div></div>`;
  if (sub === "Working capital") { const art = F2.ar.reduce((a, x) => a + x[1], 0), apt = F2.ap.reduce((a, x) => a + x[1], 0), cols = ["var(--blue)", "#64a0f0", "#e2a33a", "#d97706", "var(--red)"];
    const aged = (rows, tot, kind) => `<div class="stack big">${rows.map((x, k) => x[1] ? `<i style="width:${x[1] / tot * 100}%;background:${cols[k]}" title="${x[0]}: ${m0(x[1])}"></i>` : "").join("")}</div><table><tbody>${rows.map((x, k) => `<tr class="clickable" data-row="fin|${kind} ${esc(x[0])}"><td><i class="mc" style="background:${cols[k]};border-color:${cols[k]}"></i> ${x[0]}</td><td class="r num">${m0(x[1])}</td><td class="r num meta">${pct(x[1] / tot, 0)}</td></tr>`).join("")}<tr class="tot"><td>Total</td><td class="r num">${m0(tot)}</td><td></td></tr></tbody></table>`;
    return `<div class="ph"><div><h1>Working capital</h1><p>How fast clients pay us and we pay suppliers. From Xero aged receivables and payables.</p></div></div>
    <div class="card"><h2>Debtor and creditor days · 12 months</h2>${lineChart([{ v: F2.dd, c: "var(--blue)" }, { v: F2.cd, c: "var(--header)" }], { labels: MON12, fmt: v => Math.round(v) + "d", min: 20, max: 45, lines: [{ v: 35, c: "#e2a33a", t: "Debtor days target 35" }], aria: "Debtor and creditor days" })}<div class="row small muted"><span><i class="mc" style="background:var(--blue);border-color:var(--blue)"></i> Debtor days</span><span><i class="mc" style="background:var(--header);border-color:var(--header)"></i> Creditor days</span></div></div>
    <div class="grid2"><div class="card"><h2>Aged receivables · what clients owe</h2>${aged(F2.ar, art, "AR")}</div><div class="card"><h2>Aged payables · what we owe</h2>${aged(F2.ap, apt, "AP")}</div></div>
    <div class="card"><h2>Overdue clients</h2><div class="tw"><table><thead><tr><th>Client</th><th>Age</th><th class="r">Overdue</th><th>Note</th></tr></thead><tbody>${F2.overdue.map(o => `<tr class="clickable" data-client="${o[0]}"><td class="sup">${esc(cl(o[0]).short)}</td><td>${o[1]}</td><td class="r num">${m0(o[2])}</td><td class="meta">${esc(o[3])}</td></tr>`).join("")}</tbody></table></div><p class="meta">Chasing stays in the Accounts Hub; this page only reads.</p></div>`; }
  if (sub === "Clients" || sub === "Bank pack") return pFinanceOld();
  const ly = (a) => a[11], gmNow = F2.gm[23], ebNow = ebp[23];
  let h = `<div class="ph"><div><h1>Finance</h1><p>Company-level figures for management and the bank · ${esc(PLABEL)} · click a card for its detail, again for all</p></div><button class="btn" data-goto="finance|Bank pack">Bank pack →</button></div>` + ovTiles("fin", [
    { id: "rev", l: "Revenue · last month", v: fk(r[23]), s: `${r[23] >= ly(r) ? "▲" : "▼"} ${pct(Math.abs(r[23] - ly(r)) / ly(r))} vs same month last year`, spark: r.slice(12) },
    { id: "gm", l: "Gross margin", v: gmNow.toFixed(1) + "%", s: `${gmNow >= F2.gm[11] ? "▲" : "▼"} ${Math.abs(gmNow - F2.gm[11]).toFixed(1)} pts vs last year`, spark: F2.gm.slice(12) },
    { id: "eb", l: "EBITDA margin", v: ebNow.toFixed(1) + "%", s: `${fk(e[23])} · ${ebNow >= ebp[11] ? "▲" : "▼"} ${Math.abs(ebNow - ebp[11]).toFixed(1)} pts vs LY`, spark: ebp.slice(12) },
    { id: "cash", l: "Cash at bank", v: fk(F2.cash[23]), s: `${F2.cash[23] >= F2.cash[11] ? "▲" : "▼"} ${fk(Math.abs(F2.cash[23] - F2.cash[11]))} vs last year`, spark: F2.cash.slice(12) },
    { id: "dscr", l: "DSCR", v: "1.62×", s: `▲ from ${F2.dscr[11].toFixed(2)}× · minimum 1.25×`, spark: F2.dscr.slice(12), cls: "green" }]);
  if (OVS.fin === "rev") h += `<div class="card"><h2>Revenue · 24 months</h2>${barChart(r, L24, { fmt: fk, fc: fcast(r.slice(12), 6, 1.07), aria: "Revenue 24 months" })}</div><div class="card"><h2>Revenue by Xero account · last month</h2><table><tbody>${FACC.Revenue.map(([a, s]) => `<tr class="clickable" data-row="fin|${esc(a)}"><td class="sup">${esc(a)}</td><td class="r num">${fk(r[23] * s)}</td><td class="r num meta">${pct(s, 0)}</td></tr>`).join("")}</tbody></table></div>`;
  if (OVS.fin === "gm") h += `<div class="card"><h2>Gross margin % · 24 months</h2>${lineChart([{ v: F2.gm, c: "var(--blue)", area: true }], { labels: L24, fmt: v => v.toFixed(0) + "%", min: 18, max: 26, aria: "Gross margin trend" })}</div><div class="card"><h2>Cost of services · last month</h2><table><tbody>${FACC["Cost of services"].map(([a, s]) => `<tr class="clickable" data-row="fin|${esc(a)}"><td class="sup">${esc(a)}</td><td class="r num">${fk(r[23] * 0.773 * s)}</td></tr>`).join("")}</tbody></table></div>`;
  if (OVS.fin === "eb") h += `<div class="card"><h2>EBITDA · 24 months</h2>${lineChart([{ v: e, c: "var(--blue)", area: true }], { labels: L24, fmt: fk, fc: fcast(e.slice(12), 6, 1.08), aria: "EBITDA trend" })}</div>`;
  if (OVS.fin === "cash") h += `<div class="card"><h2>Cash flow · ${MONTH}</h2>${waterfall(F2.cf, "Cash flow waterfall")}</div><div class="card"><h2>Cash at bank · 24 months</h2>${lineChart([{ v: F2.cash, c: "var(--blue)", area: true }], { labels: L24, fmt: fk, aria: "Cash trend" })}</div>`;
  if (OVS.fin === "dscr") h += `<div class="card"><h2>DSCR · 24 months</h2>${lineChart([{ v: F2.dscr, c: "var(--blue)" }], { labels: L24, fmt: v => v.toFixed(2) + "×", min: 1, max: 2, lines: [{ v: 1.25, c: "var(--red)", t: "Minimum 1.25×" }], aria: "DSCR trend" })}<div class="formula">DSCR = (EBITDA ${fk(F2.eb12)} − tax ≈ $40k − capex ≈ $64k) ÷ repayments + interest ${fk(F2.service)} = 1.62×</div></div>`;
  if (!OVS.fin) h += `<div class="card"><h2>Revenue and EBITDA margin · 24 months</h2><p class="sub">Turn on Forecast (top bar) to add the next 6 months.</p>${comboChart(r, ebp, L24)}</div>
    <div class="grid2"><div class="card"><h2>Profit & loss · ${MONTH}</h2>${waterfall((() => { const p = plMonth(r[23], e[23]); return [["Revenue", p.Revenue, "t"], ["Cost of services", p["Cost of services"]], ["Overheads", p.Overheads], ["EBITDA", p.EBITDA, "t"], ["Depn & interest", p["Depreciation & interest"]], ["Net profit", p["Net profit before tax"], "t"]]; })(), "P&L waterfall", 470)}</div>
    <div class="card"><h2>Bank health</h2>${bankGauges()}<p class="meta">Click a gauge for how it is calculated.</p></div></div>`;
  return h;
}
const _finHTML = finHTML;
function finAccHTML(id) {
  const grp = Object.entries(FACC).find(([g, l]) => l.some(x => x[0] === id)); if (!grp) return null;
  const sh = grp[1].find(x => x[0] === id)[1], base = grp[0] === "Revenue" ? 1 : grp[0] === "Cost of services" ? 0.773 : grp[0] === "Overheads" ? 0.15 : 0.033;
  const vals = F2.rev.slice(12).map(v => v * base * sh);
  return `<h3>${esc(id)}</h3><dl class="dl"><dt>P&L line</dt><dd>${esc(grp[0])}</dd><dt>Last month</dt><dd class="num">${fk(vals[11])}</dd><dt>Share of line</dt><dd>${pct(sh, 0)}</dd></dl><div class="tsec"><div class="tsec-h">12 months</div>${barChart(vals, MON12, { fmt: fk, aria: id })}</div><div class="tsec"><div class="tsec-h">Source</div><div class="small">Xero account ${esc(id.split(" · ")[0])}, read-only. Demo figures.</div></div>`;
}

/* ===== KPI v3 ===== */
let KSITE = "Both";
const KP = [
  ["Operations", "Orders per day", "", 3240, 3000, "up", 1], ["Operations", "Dispatched before cut-off", "%", 96.8, 98, "up", 1], ["Operations", "Dock-to-stock", "h", 26, 24, "down", 1], ["Operations", "Returns processed in 48 h", "%", 91, 95, "up", 1],
  ["People", "Picks per hour", "", 142, 135, "up", 0], ["People", "Orders per labour hour", "", 11.4, 11, "up", 0], ["People", "Labour cost per order", "$", 2.06, 2.1, "down", 0], ["People", "Overtime share", "%", 7.2, 5, "down", 0],
  ["Finance", "Services margin", "%", 0, 15, "up", 1], ["Finance", "Cost per order", "$", 4.71, 4.8, "down", 1], ["Finance", "Revenue per order", "$", 5.34, 5.3, "up", 1], ["Finance", "Debtor days", "d", 34, 35, "down", 1], ["Finance", "Credit notes", "%", 1.4, 1.0, "down", 1],
  ["Warehouse", "Pallet positions used · Smithfield", "%", 84, 90, "down", 0, "smi"], ["Warehouse", "Pallet positions used · Parramatta", "%", 77, 90, "down", 0, "par"], ["Warehouse", "Revenue per pallet position", "$", 31.2, 30, "up", 0], ["Warehouse", "Slow stock (90+ days)", "pallets", 1140, 1000, "down", 1],
  ["Quality & clients", "Mis-pick rate", "%", 0.31, 0.3, "down", 1], ["Quality & clients", "Damage claims", "%", 0.08, 0.1, "down", 1], ["Quality & clients", "Stock accuracy", "%", 99.2, 99.5, "up", 0], ["Quality & clients", "Tickets per 100 orders", "", 1.9, 2, "down", 1], ["Quality & clients", "Top 5 clients' share", "%", 58, 50, "down", 0]
].map((k, i) => ({ g: k[0], name: k[1], u: k[2], val: k[3], tgt: k[4], dir: k[5], byClient: !!k[6], site: k[7], i }));
function kVal(k) {
  if (k.name === "Services margin") { const M = model(), rv = M.clients.reduce((a, c) => a + c.revenue, 0), co = M.clients.reduce((a, c) => a + c.cost, 0); return +((rv - co) / rv * 100).toFixed(1); }
  if (k.site || KSITE === "Both") return k.val;
  const d = 0.04 + seeded(k.i, 9) * 0.06, s = KSITE === "Smithfield" ? 1 + d * (k.dir === "up" ? 1 : -1) * 0.6 : 1 - d * (k.dir === "up" ? 1 : -1);
  return k.name === "Orders per day" ? Math.round(k.val * (KSITE === "Smithfield" ? 0.68 : 0.32)) : +(k.val * s).toFixed(k.val < 10 ? 2 : 1);
}
function kTgt(k) { return k.name === "Orders per day" && KSITE !== "Both" ? Math.round(k.tgt * (KSITE === "Smithfield" ? 0.68 : 0.32)) : k.tgt; }
function kStatus(k, v = kVal(k)) { const t = kTgt(k); if (k.dir === "up") return v >= t ? "g" : v >= t * 0.97 ? "a" : "r"; return v <= t ? "g" : v <= t * 1.1 ? "a" : "r"; }
function kHist(k) { const v = kVal(k); return Array.from({ length: 12 }, (_, j) => j === 11 ? v : +(v * (1 + (11 - j) * (k.dir === "up" ? -0.004 : 0.004) * (seeded(k.i, 3) > 0.35 ? 1 : -1) + (seeded(k.i, j) - 0.5) * 0.05)).toFixed(v < 10 ? 2 : 1)); }
const kf = (k, v) => k.u === "$" ? "$" + v.toFixed(2) : k.u === "%" ? v + "%" : k.u === "h" ? v + " h" : k.u === "d" ? v + " days" : k.u === "pallets" ? num(v) + " pallets" : (v >= 1000 ? num(v) : String(v));
const kShow = (k) => !k.site || KSITE === "Both" || (k.site === "smi") === (KSITE === "Smithfield");
const SCOL = { g: "var(--green)", a: "#e2a33a", r: "var(--red)" }, SLAB = { g: "On target", a: "Close", r: "Off target" };
function kTile(k) {
  const v = kVal(k), h = kHist(k), st = kStatus(k, v), d = v - h[10], good = (d >= 0) === (k.dir === "up");
  return `<button class="ktile st-${st}" data-row="kpi|${esc(k.name)}"><div class="l">${esc(k.name)}</div><div class="v">${kf(k, v)}</div><div class="s">target ${k.dir === "up" ? "≥" : "≤"} ${kf(k, kTgt(k))} · <span class="${d === 0 ? "" : good ? "delta-pos" : "delta-neg"}">${d >= 0 ? "▲" : "▼"} ${Math.abs(d) < 10 ? Math.abs(d).toFixed(Math.abs(d) < 1 ? 2 : 1) : num(Math.round(Math.abs(d)))}</span> vs last month</div>${spark(h, SCOL[st])}</button>`;
}
function siteSeg() { return `<div class="seg" role="group" aria-label="Site">${["Both", "Smithfield", "Parramatta"].map(s => `<button data-ksite="${s}" aria-pressed="${KSITE === s}">${s === "Both" ? "Both sites" : s}</button>`).join("")}</div>`; }
function pKpiOverview() {
  const list = KP.filter(kShow), cnt = { g: 0, a: 0, r: 0 }; list.forEach(k => cnt[kStatus(k)]++);
  let h = `<div class="ph"><div><h1>KPI overview</h1><p>${MONTH} vs target · click a card for those KPIs, again for all</p></div><div class="row">${siteSeg()}<button class="btn primary" data-share="kpi">Email / PDF</button></div></div>` + ovTiles("kpi", [
    { id: "g", l: "On target", v: cnt.g, s: `of ${list.length} KPIs`, cls: "green" }, { id: "a", l: "Close to target", v: cnt.a, s: "within 3–10%" }, { id: "r", l: "Off target", v: cnt.r, s: "need attention", cls: "red" }, { id: "all", l: "Score", v: pct(cnt.g / list.length, 0), s: "share of KPIs on target" }]);
  if (OVS.kpi && OVS.kpi !== "all") return h + `<div class="card"><h2>${SLAB[OVS.kpi]}</h2><div class="ktiles">${list.filter(k => kStatus(k) === OVS.kpi).map(kTile).join("") || '<p class="meta">None.</p>'}</div></div>`;
  if (OVS.kpi === "all") return h + Object.keys(KPIS).map(g => `<div class="card"><h2>${esc(g)}</h2><div class="ktiles">${list.filter(k => k.g === g).map(kTile).join("")}</div></div>`).join("");
  const red = list.filter(k => kStatus(k) === "r");
  return h + `<div class="grid2"><div class="card"><h2>Scorecard by group</h2><div class="tw"><table><thead><tr><th>Group</th><th class="c">On target</th><th class="c">Close</th><th class="c">Off</th><th style="min-width:140px"></th></tr></thead><tbody>${Object.keys(KPIS).map(g => { const ks = list.filter(k => k.g === g), c = { g: 0, a: 0, r: 0 }; ks.forEach(k => c[kStatus(k)]++);
    return `<tr class="clickable" data-goto="kpi|${esc(g)}"><td class="sup">${esc(g)}</td>${["g", "a", "r"].map(s => `<td class="c"><span class="sc sc-${s}">${c[s]}</span></td>`).join("")}<td><div class="stack">${["g", "a", "r"].map(s => c[s] ? `<i style="width:${c[s] / ks.length * 100}%;background:${SCOL[s]}"></i>` : "").join("")}</div></td></tr>`; }).join("")}</tbody></table></div></div>
    <div class="card alert"><h2>What's red</h2><div class="tw"><table><tbody>${red.map(k => `<tr class="clickable" data-row="kpi|${esc(k.name)}"><td style="width:10px"><span class="dot red"></span></td><td class="sup">${esc(k.name)}<div class="meta">${esc(k.g)}</div></td><td class="r num">${kf(k, kVal(k))}</td><td class="meta nowrap">target ${kf(k, kTgt(k))}</td></tr>`).join("") || '<tr><td class="empty">Nothing red.</td></tr>'}</tbody></table></div></div></div>`;
}
function pKpi() {
  const g = KPIS[sub] ? sub : "Operations", list = KP.filter(k => k.g === g && kShow(k));
  return `<div class="ph"><div><h1>${esc(g)} KPIs</h1><p>${MONTH} vs target and last month · click a tile for its 12-month trend and split by site and client</p></div><div class="row">${siteSeg()}<button class="btn primary" data-share="kpi">Email / PDF</button></div></div>
  <div class="ktiles">${list.map(kTile).join("")}</div>
  <div class="callout">Demo figures. In the real app each KPI links to its source (WMS, Xero, Front) and its target is editable in Settings → Rules.</div>`;
}
function kpiHTML3(name) {
  const k = KP.find(x => x.name === name); if (!k) return null;
  const v = kVal(k), h = kHist(k), st = kStatus(k, v), how = KPI_HOW[name] || ["Formula set at build time from the source data", "See Data sources"];
  const sv = KSITE, sites = k.site ? null : ["Smithfield", "Parramatta"].map(s => { KSITE = s; const x = [s, kVal(k), kTgt(k), kStatus(k)]; KSITE = sv; return x; });
  const mn = Math.min(...h, kTgt(k)), mx = Math.max(...h, kTgt(k)), pad = (mx - mn) * 0.25 || 1;
  return `<div class="row" style="justify-content:space-between"><h3>${esc(name)}</h3><span class="pill" style="background:${SCOL[st]}22;color:${SCOL[st]}">${SLAB[st]}</span></div>
  <dl class="dl"><dt>Value</dt><dd><strong>${kf(k, v)}</strong> ${KSITE === "Both" || k.site ? "" : "· " + KSITE}</dd><dt>Target</dt><dd>${k.dir === "up" ? "at least" : "at most"} ${kf(k, kTgt(k))} <span class="meta">(Settings → Rules)</span></dd></dl>
  <div class="tsec"><div class="tsec-h">12 months vs target</div>${lineChart([{ v: h, c: SCOL[st] }], { labels: MON12, fmt: (x) => kf(k, +x.toFixed(x < 10 ? 2 : 0)), min: mn - pad, max: mx + pad, lines: [{ v: kTgt(k), c: "var(--header)", t: "Target" }], aria: name + " trend" })}</div>
  ${sites ? `<div class="tsec"><div class="tsec-h">By site</div><table><tbody>${sites.map(s => `<tr><td><span class="dot ${({ g: "green", a: "amber", r: "red" })[s[3]]}"></span> ${s[0]}</td><td class="r num">${kf(k, s[1])}</td><td class="meta">target ${kf(k, s[2])}</td></tr>`).join("")}</tbody></table></div>` : ""}
  ${k.byClient && k.name !== "Orders per day" ? `<div class="tsec"><div class="tsec-h">By client</div><table><tbody>${CLIENTS.map((c, j) => { const cv = +(v * (0.85 + seeded(j, k.i) * 0.3)).toFixed(v < 10 ? 2 : 1), cs = kStatus(k, cv); return `<tr class="clickable" data-client="${c.id}"><td><span class="dot ${({ g: "green", a: "amber", r: "red" })[cs]}"></span> ${esc(c.short)}</td><td class="r num">${kf(k, cv)}</td></tr>`; }).join("")}</tbody></table></div>` : k.name === "Orders per day" ? `<div class="tsec"><div class="tsec-h">By client</div><table><tbody>${CLIENTS.map(c => `<tr class="clickable" data-client="${c.id}"><td>${esc(c.short)}</td><td class="r num">${num(Math.round(v * c.vols["ORD-FEE"] / CLIENTS.reduce((t, x) => t + x.vols["ORD-FEE"], 0)))}</td></tr>`).join("")}</tbody></table></div>` : ""}
  <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="formula">${esc(how[0])}</div><div class="small" style="margin-top:6px">Source: ${esc(how[1])}</div></div>`;
}
Object.assign(KPI_HOW, { "Overtime share": ["Overtime hours ÷ all paid hours", "Xero Payroll"], "Orders per labour hour": ["Orders ÷ floor labour hours", "WMS + Xero Payroll / timesheets"], "Returns processed in 48 h": ["Returns put away within 48 h of arrival ÷ returns", "WMS returns (RTN)"], "Cost per order": ["Cost to serve (TDABC) ÷ orders", "Cost model"], "Revenue per order": ["Processing revenue ÷ orders", "Xero invoice lines"], "Credit notes": ["Credit notes ÷ revenue", "Xero"], "Revenue per pallet position": ["Storage revenue ÷ pallet positions", "Xero + WMS locations"], "Slow stock (90+ days)": ["Pallets with no movement for 90+ days", "WMS stock on hand"], "Stock accuracy": ["Locations counted right ÷ locations counted", "WMS cycle counts"], "Damage claims": ["Orders with a damage claim ÷ orders", "Front + Xero credit notes"], "Top 5 clients' share": ["Revenue of 5 largest clients ÷ total revenue", "Xero"], "Pallet positions used · Smithfield": ["Occupied pallet positions ÷ all positions, Smithfield", "WMS locations"], "Pallet positions used · Parramatta": ["Occupied pallet positions ÷ all positions, Parramatta", "WMS locations"] });

/* ===== v3 chunk 3 wiring ===== */
const _rowHTML3 = rowHTML;
rowHTML = function (type, id) {
  if (type === "kpi") { const x = kpiHTML3(id); if (x) return x; }
  if (type === "fin") { const x = finAccHTML(id); if (x) return x; }
  return _rowHTML3(type, id);
};
const _ec3 = extraClick3;
extraClick3 = function (e, t, d) {
  if (d.ksite) { KSITE = d.ksite; render(); return true; }
  if (d.finx) { FINEXP[d.finx] = !FINEXP[d.finx]; render(); return true; }
  return _ec3(e, t, d);
};
const _ch3 = extraChange3;
extraChange3 = function (el, d) {
  if (d.finpct !== undefined) { FINPCT = el.checked; render(); return true; }
  return _ch3(el, d);
};
