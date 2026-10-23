/* ===== Improvements & savings (made-up examples) ===== */
const ICATS = { "Workflow": ["Receiving", "Storage", "Picking", "Packing", "Returns", "Dispatch", "CSR", "Admin", "Accounts", "General"], "Suppliers": ["Packaging", "Labour hire", "Equipment & service", "Software", "Freight", "Other"], "Space": ["Racking", "Slotting", "Floor pallets", "Other"], "Labour": ["Rosters", "Overtime", "Training", "Other"], "Equipment & automation": ["CMC CartonWrap", "Sure Sort", "Bubble wrap machine", "Scanners", "New machine"] };
const IDETAIL = { "Packing": ["Manual", "Automated (CMC)", "Flow wrap (future)"], "Picking": ["Units", "Cartons", "Pallets"], "Receiving": ["Cartons", "Pallets", "Containers"] };
const ICHANGES = ["Process & time", "Supplier & price", "Materials", "Equipment", "Space", "People & rosters"];
const ISTAT = { idea: ["Idea", "Parked", "Rejected"], init: ["Approved", "In progress", "Done", "Verified"] };
const istPill = (s) => `<span class="pill ${{ Verified: "p-green", Done: "p-blue", "In progress": "p-amber", Approved: "p-purple", Idea: "p-grey", Parked: "p-grey", Rejected: "p-red" }[s] || "p-grey"}">${s}</span>`;
let IMPS = [
  { id: "i1", name: "CMC prepping optimisation", desc: "Bubble wrap per bottle + cardboard tray + paper strap replaced by a bubble bag with the packing slip stuck on, so the CMC scans it directly.", cat: "Workflow", subcat: "Packing", detail: "Automated (CMC)", changes: ["Process & time", "Materials", "Supplier & price"], status: "Done", type: "Hard saving", owner: "Asal", start: "01/08/2026",
    blocks: [{ k: "min", label: "Pre-pack minutes per CMC order", before: 2.4, after: 0.9, unit: "min", vol: 56700, rate: 0.98 }, { k: "mat", label: "Materials per CMC order", before: 0.71, after: 0.38, unit: "$", vol: 56700 }],
    project: { people: ["s1", "s2", "s3", "s8"], steps: [["Measure before", "Asal", "01/08", "08/08", "done"], ["Order bubble bags (China)", "Asal", "08/08", "15/09", "done"], ["Trial on 2 clients", "Max", "16/09", "22/09", "done"], ["Train pre-packers", "Neil", "22/09", "26/09", "done"], ["Roll out to all CMC clients", "Max", "29/09", "03/10", "done"], ["Measure after & recalculate", "Asal", "20/10", "31/10", "progress"], ["Report to Mark", "Asal", "03/11", "07/11", "todo"]] } },
  { id: "i2", name: "Cheaper mailers for manual packing", desc: "Same mailer size from a new packaging supplier at a lower unit price.", cat: "Suppliers", subcat: "Packaging", detail: "", changes: ["Supplier & price"], status: "In progress", type: "Hard saving", owner: "Asal", start: "06/10/2026",
    blocks: [{ k: "price", label: "Mailer unit price", before: 0.42, after: 0.33, unit: "$", vol: 41000 }],
    project: { people: ["s1", "s6", "s7"], steps: [["Quotes from 3 suppliers", "Asal", "06/10", "13/10", "done"], ["Sample test with packers", "Neil", "14/10", "20/10", "done"], ["First order", "Asal", "21/10", "28/10", "progress"], ["Switch over", "Neil", "29/10", "05/11", "todo"], ["Check price on bills", "Asal", "01/12", "05/12", "todo"]] } },
  { id: "i3", name: "Move floor pallets into racking · Smithfield", desc: "About 180 pallets sit on the floor; extra racking bays would free aisle space and cut double handling.", cat: "Space", subcat: "Floor pallets", detail: "", changes: ["Space", "Equipment", "Process & time"], status: "Idea", type: "Soft (capacity freed)", owner: "Asal", start: "",
    blocks: [{ k: "min", label: "Extra moves per floor pallet per week", before: 1.2, after: 0.2, unit: "min", vol: 780, rate: 0.98 }], est: 2900 },
  { id: "i4", name: "Roster to forecast volume", desc: "Match casual shifts to the daily order forecast to cut idle time on quiet days.", cat: "Labour", subcat: "Rosters", detail: "", changes: ["People & rosters"], status: "Idea", type: "Hard saving", owner: "Asal", start: "", blocks: [], est: 6400 },
  { id: "i5", name: "Software subscriptions review", desc: "Two overlapping label/printing subscriptions; cancel one.", cat: "Suppliers", subcat: "Software", detail: "", changes: ["Supplier & price"], status: "Approved", type: "Hard saving", owner: "Asal", start: "20/10/2026", blocks: [{ k: "price", label: "Monthly subscription", before: 389, after: 0, unit: "$", vol: 1 }],
    project: { people: ["s1"], steps: [["Check usage with Tarek", "Asal", "20/10", "27/10", "progress"], ["Cancel and confirm on Xero bill", "Asal", "28/10", "30/11", "todo"]] } }
];
const impSave = (i) => i.blocks.length ? i.blocks.reduce((a, b) => a + (b.before - b.after) * b.vol * (b.k === "min" ? b.rate : 1), 0) : (i.est || 0);
const isInit = (i) => ISTAT.init.includes(i.status);
let icat = "All", NEWIDEA = null;
function pImprove(M) {
  const inits = IMPS.filter(isInit), ideas = IMPS.filter(i => !isInit(i));
  if (sub === "Overview") {
    const ver = inits.filter(i => ["Done", "Verified"].includes(i.status)), run = ver.reduce((a, i) => a + impSave(i), 0), prog = inits.filter(i => !["Done", "Verified"].includes(i.status));
    const late = inits.filter(i => (i.project?.steps || []).some(s => s[4] === "late")).length;
    const byCat = Object.keys(ICATS).map(c => [c, inits.filter(i => i.cat === c).reduce((a, i) => a + impSave(i), 0), ideas.filter(i => i.cat === c && i.status === "Idea").reduce((a, i) => a + impSave(i), 0)]);
    const mx = Math.max(...byCat.map(b => b[1] + b[2]), 1);
    return `<div class="ph"><div><h1>Improvements & savings</h1><p>Cost no longer spent (not leakage) · ${esc(PLABEL)}</p></div><button class="btn primary" data-act="newidea">+ New idea</button></div>
    <div class="kpis"><button class="kpi" data-goto="improve|Initiatives"><div class="l">Savings delivered</div><div class="v">${m0(run * PF)}</div><div class="s">${PER === "Month" ? "a month" : esc(PLABEL)} · ${m0(run * 12)} a year run-rate</div></button>
      <button class="kpi" data-goto="improve|Initiatives"><div class="l">Initiatives in progress</div><div class="v">${prog.length}</div><div class="s">${late ? late + " late" : "all on track"}</div></button>
      <button class="kpi" data-goto="improve|Ideas"><div class="l">Ideas waiting</div><div class="v">${ideas.filter(i => i.status === "Idea").length}</div><div class="s">estimated ${m0(ideas.filter(i => i.status === "Idea").reduce((a, i) => a + impSave(i), 0))} a month</div></button>
      <button class="kpi" data-goto="improve|Initiatives"><div class="l">Verified</div><div class="v">${inits.filter(i => i.status === "Verified").length} of ${inits.length}</div><div class="s">confirmed by 1–3 months of data</div></button></div>
    <div class="grid2"><div class="card"><h2>By category</h2><p class="sub">Solid = initiatives (measured), light = ideas (estimated), $ a month.</p>${byCat.map(b => `<div class="catbar"><span>${esc(b[0])}</span><span class="track"><i style="width:${b[1] / mx * 100}%"></i><i class="est" style="width:${b[2] / mx * 100}%"></i></span><span class="num small">${m0(b[1])}${b[2] ? " + " + m0(b[2]) : ""}</span></div>`).join("")}</div>
    <div class="card"><h2>Projects</h2><p class="sub">Initiatives with their current step.</p><div class="tw"><table><tbody>${inits.map(i => { const st = (i.project?.steps || []).find(s => s[4] !== "done"); return `<tr class="clickable" data-imp="${i.id}"><td class="sup">${esc(i.name)}<div class="meta">${st ? "Now: " + esc(st[0]) + " · " + esc(st[1]) + " · due " + st[3] : "All steps done"}</div></td><td>${istPill(i.status)}</td></tr>`; }).join("")}</tbody></table></div></div></div>`;
  }
  const list = (sub === "Ideas" ? ideas : inits).filter(i => icat === "All" || i.cat === icat);
  return `<div class="ph"><div><h1>${sub}</h1><p>${sub === "Ideas" ? "Proposed, not started. Savings are estimates. Approve an idea to turn it into an initiative with a project." : "Approved and being done. Savings are measured before and after."}</p></div><button class="btn primary" data-act="newidea">+ New idea</button></div>
  <div class="chips">${["All", ...Object.keys(ICATS)].map(c => `<button class="btn ${icat === c ? "on" : ""}" data-icat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
  <div class="card"><div class="tw"><table><thead><tr><th>${sub === "Ideas" ? "Idea" : "Initiative"}</th><th>Category</th><th>Status</th><th>Type</th><th class="r">${sub === "Ideas" ? "Est." : "Saving"} / month</th><th>Owner</th></tr></thead><tbody>
    ${list.map(i => `<tr class="clickable" data-imp="${i.id}"><td class="sup">${esc(i.name)}<div class="meta">${esc(i.desc)}</div></td><td>${esc(i.cat)}<div class="meta">${esc(i.subcat)}${i.detail ? " · " + esc(i.detail) : ""}</div></td><td>${istPill(i.status)}</td><td class="meta">${esc(i.type)}</td><td class="r num">${m0(impSave(i))}</td><td>${esc(i.owner)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Nothing here yet.</td></tr>'}
  </tbody></table></div></div>`;
}
function impHTML(id) {
  const i = IMPS.find(x => x.id === id), init = isInit(i), s = impSave(i);
  const blocks = i.blocks.map(b => `<tr><td>${esc(b.label)}</td><td class="r num">${b.unit === "$" ? money(b.before) : b.before + " " + b.unit}</td><td class="r num">${b.unit === "$" ? money(b.after) : b.after + " " + b.unit}</td><td class="r num">${num(b.vol)}</td><td class="r num"><strong>${m0((b.before - b.after) * b.vol * (b.k === "min" ? b.rate : 1))}</strong></td></tr>`).join("");
  const P = i.project, st = (k) => ({ done: "p-green", progress: "p-amber", todo: "p-grey", late: "p-red" }[k]);
  const pplOpts = STAFF.filter(x => !(P?.people || []).includes(x.id));
  return `<div class="row" style="justify-content:space-between"><h3>${esc(i.name)}</h3>${istPill(i.status)}</div>
  <p class="small">${esc(i.desc)}</p>
  <dl class="dl"><dt>Category</dt><dd>${esc(i.cat)} → ${esc(i.subcat)}${i.detail ? " → " + esc(i.detail) : ""}</dd><dt>What changes</dt><dd>${i.changes.map(esc).join(" · ")}</dd><dt>Type</dt><dd>${esc(i.type)}</dd><dt>Owner</dt><dd>${esc(i.owner)}</dd></dl>
  <div class="tsec"><div class="tsec-h">${init ? "Measured saving" : "Estimated saving"} · ${m0(s)} a month · ${m0(s * 12)} a year</div>${blocks ? `<table><thead><tr><th>Building block</th><th class="r">Before</th><th class="r">After</th><th class="r">Volume / month</th><th class="r">Saving</th></tr></thead><tbody>${blocks}</tbody></table>` : `<div class="small">Estimate entered by hand: ${m0(i.est || 0)} a month. Claude can propose a calculation once the category and changes are set.</div>`}</div>
  ${P ? `<div class="tsec"><div class="tsec-h">Project timeline</div><div class="gantt">${P.steps.map((p, k) => `<div class="gr"><span class="gn">${esc(p[0])}<span class="meta"> · ${esc(p[1])}</span></span><span class="gt"><i class="${st(p[4])}" style="margin-left:${k / P.steps.length * 100}%;width:${100 / P.steps.length}%"></i></span><span class="meta nowrap">${p[2]}–${p[3]}</span><select data-step="${i.id}|${k}" aria-label="Status of ${esc(p[0])}">${[["todo", "Not started"], ["progress", "In progress"], ["done", "Done"], ["late", "Late"]].map(o => `<option value="${o[0]}" ${o[0] === p[4] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></div>`).join("")}</div>
    <p class="meta">Each step is a task for its owner, with a reminder before the due date and when late.</p></div>
  <div class="tsec"><div class="tsec-h">People involved · suggested by Claude, edit freely</div><div class="chips">${P.people.map(pid => { const x = stf(pid); return `<span class="chip">${esc(x.name)} · ${esc(x.pos)}${x.login ? "" : ' <span class="meta">(no login)</span>'}<button data-rmppl="${i.id}|${pid}" aria-label="Remove">×</button></span>`; }).join("")}</div>
    <div class="row" style="margin-top:8px"><select id="addppl" aria-label="Add person">${pplOpts.map(x => `<option value="${x.id}">${esc(x.name)} · ${esc(x.pos)}</option>`).join("")}</select><button class="btn" data-addppl="${i.id}">Add</button></div></div>` : ""}
  <div class="row">${!init ? `<button class="btn primary" data-impact="approve|${i.id}">Approve → initiative</button><button class="btn" data-impact="park|${i.id}">Park</button><button class="btn danger" data-impact="reject|${i.id}">Reject</button>` : i.status === "Done" ? `<button class="btn primary" data-impact="verify|${i.id}">Mark verified</button>` : ""}<button class="lnk logsbtn" data-xlogs="imp|${i.id}|${esc(i.name)}">Logs</button></div>`;
}
const STEP_TPL = { "Workflow": ["Measure before", "Order / new supply", "Trial", "Training", "Roll out", "Embed & check", "Measure after & recalculate", "Report"], "Suppliers": ["Quotes", "Samples / test", "First order", "Switch over", "Check price on bills", "Report"], "Space": ["Measure before", "Plan layout", "Order racking", "Install", "Move pallets", "Measure after", "Report"], "Labour": ["Measure before", "New roster", "Trial 2 weeks", "Roll out", "Measure after", "Report"], "Equipment & automation": ["Business case", "Approval", "Order", "Install & test", "Training", "Measure after", "Report"] };
function suggestPeople(i) {
  const ops = ["s1"]; const site = i.subcat === "Packing" || i.cat === "Space" ? ["s2", "s3"] : ["s2"];
  const floor = STAFF.filter(x => x.pool === "floor" && !x.login && (i.detail?.includes("CMC") ? x.pos.includes("CMC") : i.subcat === "Packing" ? x.pos.toLowerCase().includes("pack") : false)).map(x => x.id);
  return [...ops, ...site, ...floor];
}
function newIdeaHTML() {
  const n = NEWIDEA, subs = ICATS[n.cat] || [], det = IDETAIL[n.subcat] || [];
  const blocks = [];
  if (n.changes.includes("Process & time")) blocks.push(`Minutes before → after × volume × cost per minute <span class="meta">(WMS volumes + Base cost${n.subcat ? " · " + esc(n.subcat) : ""})</span>`);
  if (n.changes.includes("Supplier & price")) blocks.push(`Unit price before → after × quantity <span class="meta">(that supplier's bills in Xero)</span>`);
  if (n.changes.includes("Materials")) blocks.push(`Materials per order before → after × orders <span class="meta">(Xero packaging bills + WMS orders)</span>`);
  if (n.changes.includes("Space")) blocks.push(`Positions before → after × cost per position <span class="meta">(Base cost · space)</span>`);
  if (n.changes.includes("Equipment")) blocks.push(`Investment and payback <span class="meta">(quote + monthly saving)</span>`);
  if (n.changes.includes("People & rosters")) blocks.push(`Paid hours before → after × labour cost per hour <span class="meta">(Xero Payroll)</span>`);
  return `<h3>New idea</h3>
  <div class="formgrid">
    <label for="ni-n">Name</label><input id="ni-n" type="text" value="${esc(n.name)}" placeholder="e.g. CMC prepping optimisation">
    <label for="ni-d">Short description</label><textarea id="ni-d" placeholder="What changes, in your words">${esc(n.desc)}</textarea>
    <label for="ni-c">Category</label><select id="ni-c" data-ni="cat"><option value="">Choose…</option>${Object.keys(ICATS).map(c => `<option ${c === n.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
    ${n.cat ? `<label for="ni-s">Sub-category</label><select id="ni-s" data-ni="subcat"><option value="">Choose…</option>${subs.map(c => `<option ${c === n.subcat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` : ""}
    ${det.length ? `<label for="ni-t">Detail</label><select id="ni-t" data-ni="detail"><option value="">Choose…</option>${det.map(c => `<option ${c === n.detail ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>` : ""}
    <span class="lbl">What changes</span><div class="chips">${ICHANGES.map(c => `<label class="chip"><input type="checkbox" data-nich="${esc(c)}" ${n.changes.includes(c) ? "checked" : ""}> ${esc(c)}</label>`).join("")}</div>
  </div>
  ${n.cat && n.changes.length ? `<div class="tsec"><div class="tsec-h"><span class="ai">AI</span> Claude proposes · ${n.asked ? "edit or confirm" : "press “Ask Claude”"}</div>
    ${n.asked ? `<div class="small"><strong>Calculation</strong><ul>${blocks.map(b => `<li>${b}</li>`).join("")}</ul><strong>Mapping</strong><ul><li>Service: ${esc(n.subcat || n.cat)}${n.detail ? " · " + esc(n.detail) : ""}</li><li>Clients: all on that service (edit later)</li><li>Site: both (edit later)</li>${n.changes.includes("Supplier & price") ? "<li>Xero supplier and account: choose when saving the first bill</li>" : ""}</ul>
      <div class="row"><label class="small" for="ni-e">Estimated saving $ / month</label><input id="ni-e" class="mini" type="number" value="${n.est || 1200}"></div></div>` : `<button class="btn" data-act="askclaude">Ask Claude</button>`}</div>` : '<p class="meta">Pick a category and what changes; Claude then proposes the calculation and mapping.</p>'}
  <div class="row"><button class="btn primary" data-act="saveidea" ${n.asked ? "" : "disabled"}>Save idea</button></div>`;
}
