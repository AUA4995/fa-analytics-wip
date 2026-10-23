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
