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
  <div class="tsec"><div class="tsec-h">Rate in each system</div><table><tbody><tr><td>CLM</td><td class="r num">${money(l.rate)}</td></tr><tr><td>Dyspach</td><td class="r num">${dy != null ? money(dy) : money(l.rate)}</td></tr><tr><td>WMS</td><td class="r num">${wm ? esc(wm) : money(l.rate)}</td></tr></tbody></table>${dy != null || wm ? '<span class="pill p-red">don\'t match</span>' : '<span class="pill p-green">match</span>'}</div>
  <div class="tsec"><div class="tsec-h">Staff on ${esc(c.short)} for this work</div><table><tbody>${ppl.map(s => `<tr><td>${esc(s.name)} <span class="meta">· ${esc(s.pos)}</span></td><td class="r"><input class="mini" type="number" min="0" max="100" step="5" value="${s.alloc[cid]}" data-alloc="${s.id}|${cid}" aria-label="${esc(s.name)} %"> %</td></tr>`).join("") || '<tr><td class="empty">Nobody allocated.</td></tr>'}</tbody></table><div class="row" style="margin-top:8px"><button class="btn" data-goto="settings|Staff & allocation">Add staff member</button></div></div>
  <div class="tsec"><div class="tsec-h">Sources</div><div class="small">Volume: Thomax ${esc(PLABEL)} · rate: CLM · billed: Xero invoice lines · cost: Base cost (${SITES[c.site]} pool).</div></div>
  <div class="row"><button class="btn" data-review="${cid}">Rate review for ${esc(c.short)}</button></div>`;
}
function taskHTML(id) {
  const t = TASKS.find(x => x.id === id);
  const links = { Xero: "Open Xero", "Xero Payroll": "Open Xero Payroll", WMS: "Open Thomax", "CLM / Dyspach": "Open CLM", CLM: "Open CLM", Dyspach: "Open Dyspach", Floor: "", Settings: "Open Settings" };
  const L = LEAK.find(l => l.task === id || ("From leakage " + l.id) === t.why);
  const tl = (LOGS_EXTRA["task|" + id] || []).slice().reverse();
  return `<div class="row" style="justify-content:space-between"><h3>${esc(t.topic)} · ${esc(t.co)}</h3><span class="pill ${t.pr === "High" ? "p-red" : t.pr === "Medium" ? "p-amber" : "p-grey"}">${t.pr}</span></div>
  <dl class="dl"><dt>What to do</dt><dd>${esc(t.what)}</dd><dt>Why</dt><dd>${esc(t.why)}</dd><dt>Fix in</dt><dd>${esc(t.where)} (by hand) ${links[t.where] ? `· <a class="ref" href="https://go.xero.com" target="_blank" rel="noopener">${links[t.where]} ↗</a>` : ""}</dd><dt>Owner</dt><dd>${esc(t.owner)}</dd><dt>Status</dt><dd>${t.st === "snoozed" ? `Snoozed until ${esc(t.wake)}` : t.st}</dd>${t.verify ? `<dt>Closing rule</dt><dd>${t.verify === "dyspatch" ? "Confirmed by hand (Dyspach has no API yet)" : "Checked by API before it can be resolved"}</dd>` : ""}</dl>
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
    if (n.kind === "client") { const nm = $("#nc-n").value; CLIENTS_EXTRA.push({ name: nm, site: SITES[$("#nc-s").value], type: $("#nc-t").value, st: $("#nc-st").value, cmc: null, ids: "Dyspach ✓ · Xero — · Thomax —" });
      addTask({ pr: "High", topic: "Set up", co: nm, where: "Xero", what: `Create ${nm} as a contact in Xero`, why: "Client is in Dyspach but not in Xero", owner: "David", verify: "xero-contact" });
      addTask({ pr: "Medium", topic: "Set up", co: nm, where: "WMS", what: `Set up ${nm} as a tenant in the WMS`, why: "Client is in Dyspach but has no WMS tenant", owner: "Paul", verify: "wms" }); toast(`${nm} added. Two follow-up tasks created.`); }
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
