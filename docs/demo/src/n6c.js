/* ===== v3: weekly workload client panel ===== */
function wlHTML3(id) {
  const [rid, cid] = id.split("|"), r = REPORTS.find(x => x.id === rid) || REPORTS[0], i = CLIENTS.findIndex(c => c.id === cid), x = wkData(CLIENTS[i], i, 0.23);
  const ut = x.units.reduce((a, b) => a + b, 0);
  return `<h3>${esc(x.c.name)} · this week</h3><dl class="dl"><dt>Orders</dt><dd class="num">${num(x.tot)}</dd><dt>Previous week</dt><dd class="num">${num(x.prev)} · <span class="${x.chg >= 0 ? "delta-pos" : "delta-neg"}">${x.chg >= 0 ? "▲" : "▼"} ${pct(Math.abs(x.chg))}</span></dd><dt>B2B orders</dt><dd class="num">${num(x.b2b)} (more than ${S.b2b} units)</dd><dt>Single-SKU orders</dt><dd class="num">${num(x.single)}</dd></dl>
  <div class="tsec"><div class="tsec-h">Orders by number of SKUs</div><table><tbody>${SKU_B.map((b, k) => x.sku[k] ? `<tr><td>${b} SKU${b === "1" ? "" : "s"}</td><td class="r">${nb(x.sku[k], pct(x.sku[k] / x.tot, 0))}</td></tr>` : "").join("")}</tbody></table></div>
  <div class="tsec"><div class="tsec-h">Orders by number of units</div><table><tbody>${UNIT_B.map((b, k) => x.units[k] ? `<tr><td>${b} units</td><td class="r">${nb(x.units[k], pct(x.units[k] / ut, 0))}</td></tr>` : "").join("")}</tbody></table></div>
  <div class="tsec"><div class="tsec-h">How it is calculated</div><div class="small">Each order's lines come from the WMS (Thomax PCK1, later Logiwa). An order with 3 different SKUs counts in "3". Units = total quantity on the order. B2B = more than ${S.b2b} units (Settings → Rules).</div></div>
  <div class="row"><button class="btn" data-client="${x.c.id}">Client cost to serve</button></div>`;
}
const _rowHTML2 = rowHTML;
rowHTML = function (type, id) {
  if (type === "wl") return wlHTML3(id);
  const rr = rrHTML(type, id); if (rr) return rr;
  return _rowHTML2(type, id);
};

/* ===== v3 handlers (called first from the main click / change handlers) ===== */
function stepsOf(id) { return IMPS.find(x => x.id === id).project.steps; }
function extraClick3(e, t, d) {
  if (d.ovs) { const [k, id] = d.ovs.split("|"); OVS[k] = OVS[k] === id ? null : id; render(); return true; }
  if (d.rmz) { RMZOOM = d.rmz; render(); return true; }
  if (d.rmback !== undefined) { RMFOCUS = null; render(); return true; }
  if (d.rm) { RMFOCUS = RMFOCUS === d.rm ? null : d.rm; if (RMZOOM === "Week") RMZOOM = "Month"; render(); return true; }
  if (d.rmfocus) { RMFOCUS = d.rmfocus; OVS.imp = null; closeAll(); cur = "improve"; sub = "Overview"; render(); setTimeout(() => document.querySelector(".roadmap")?.scrollIntoView?.({ block: "center" }), 0); return true; }
  if (d.stepmv) { const [id, k, dir] = d.stepmv.split("|"), st = stepsOf(id), a = +k, b = a + (+dir); if (b < 0 || b >= st.length) return true; [st[a], st[b]] = [st[b], st[a]]; logX("imp|" + id, `Moved step "${st[b][0]}" ${+dir < 0 ? "up" : "down"}`); renderStack(); render(); return true; }
  if (d.steprm) { const [id, k] = d.steprm.split("|"), st = stepsOf(id), rm = st.splice(+k, 1)[0]; logX("imp|" + id, `Removed step "${rm[0]}"`); renderStack(); render(); return true; }
  if (d.stepadd) { const st = stepsOf(d.stepadd), last = st.length ? pdate(st[st.length - 1][3]) : TODAY; st.push(["New step", "Asal", fd(addD(last, 1)), fd(addD(last, 14)), "todo"]); logX("imp|" + d.stepadd, "Added a step"); renderStack(); render(); return true; }
  if (d.wsel) { WSEL = d.wsel === "all" ? null : (WSEL === d.wsel ? null : d.wsel); render(); return true; }
  return false;
}
function extraChange3(el, d) {
  const v = el.value;
  if (d.impf) { const [id, f] = d.impf.split("|"), i = IMPS.find(x => x.id === id); i[f] = f === "priority" ? +v : v; logX("imp|" + id, `${f === "reviewBy" ? "Review by" : f[0].toUpperCase() + f.slice(1)} → ${f === "reviewBy" ? fd(pdate(v)) : v}`); renderStack(); render(); return true; }
  if (d.stepn) { const [id, k] = d.stepn.split("|"); stepsOf(id)[+k][0] = v; logX("imp|" + id, `Step renamed to "${v}"`); renderStack(); render(); return true; }
  if (d.stepd) { const [id, k, j] = d.stepd.split("|"); if (!v) return true; const st = stepsOf(id)[+k]; st[+j] = fd(pdate(v)); if (+j === 2 && pdate(st[3]) < pdate(st[2])) st[3] = st[2]; logX("imp|" + id, `"${st[0]}" ${+j === 2 ? "start" : "due"} → ${st[+j]}`); renderStack(); render(); return true; }
  if (d.stepo) { const [id, k] = d.stepo.split("|"), st = stepsOf(id)[+k]; st[1] = v; logX("imp|" + id, `"${st[0]}" owner → ${v}`); renderStack(); render(); return true; }
  if (d.rfc) { const r = REPORTS.find(x => x.id === d.rfc); r.fc = el.checked; toast(el.checked ? "Forecast included in this report, its PDF and its schedule." : "Forecast removed from this report."); render(); return true; }
  if (d.vsel) { const r = REPORTS.find(x => x.id === d.vsel); r.clientSel = v; r.client = v || undefined; r.cls = v ? "Client-safe" : "Internal"; render(); return true; }
  if (d.rrstage) { const r = RRLIST.find(x => x.client === d.rrstage); r.stage = +v; toast(`${cl(r.client).short}: stage → ${RRSTAGES[r.stage]}`); renderStack(); render(); return true; }
  return false;
}
