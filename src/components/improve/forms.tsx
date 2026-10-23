"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import {
  addBlockAction,
  addCategoryAction,
  addCommentAction,
  addStepAction,
  createIdeaAction,
  deleteStepAction,
  moveStepAction,
  saveCalcAction,
  setStageAction,
  updateImprovementAction,
  updateStepAction,
  type ImpState,
} from "@/app/improve/actions";
import { BLOCK_SPEC, CHANGES, DETAILS, SAVING_TYPES, calcSaving, type BlockKind, type CalcBlock } from "@/lib/improve/calc";
import "@/components/model/model.css";

const Msg = ({ s }: { s: ImpState | null }) => (s?.message ? <span className={s.ok ? "msg-ok" : "msg-err"}>{s.message}</span> : null);
const aud = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }));

function useRun() {
  const router = useRouter();
  const [s, set] = useState<ImpState | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ImpState>) =>
    start(async () => {
      set(await fn());
      router.refresh();
    });
  return { s, pending, run };
}

export function NewIdeaForm({ cats, users, suppliers }: { cats: Array<{ key: string; name: string; subs: string[] }>; users: string[]; suppliers: Array<[string, string]> }) {
  const router = useRouter();
  const [cat, setCat] = useState(cats[0]?.key ?? "");
  const [sub, setSub] = useState("");
  const [changes, setChanges] = useState<string[]>([]);
  const [s, action, pending] = useActionState(async (p: ImpState | null, fd: FormData) => {
    const r = await createIdeaAction(p, fd);
    if (r.ok && r.id) router.push(`/improve?section=ideas&panel=imp:${r.id}`);
    return r;
  }, null);
  const subs = cats.find((c) => c.key === cat)?.subs ?? [];
  return (
    <form action={action} className="newidea">
      <div className="step">
        <b>1</b>
        <label>
          Name
          <input name="name" placeholder="e.g. CMC prepping optimisation" style={{ width: 320 }} />
        </label>
        <label className="grow">
          Short description
          <input name="description" placeholder="What changes and why" />
        </label>
      </div>
      <div className="step">
        <b>2</b>
        <label>
          Category
          <select name="category" value={cat} onChange={(e) => (setCat(e.target.value), setSub(""))}>
            {cats.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <b>3</b>
        <label>
          Sub-category
          <select name="sub" value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">—</option>
            {subs.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        {DETAILS[sub] && (
          <>
            <b>4</b>
            <label>
              Detail
              <select name="detail">
                {DETAILS[sub].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <div className="step">
        <b>5</b>
        <span className="small">What changes</span>
        <div className="seg">
          {CHANGES.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={changes.includes(k)} onClick={() => setChanges(changes.includes(k) ? changes.filter((x) => x !== k) : [...changes, k])}>
              {l}
            </button>
          ))}
        </div>
        {changes.map((c) => (
          <input key={c} type="hidden" name="changes" value={c} />
        ))}
      </div>
      {changes.includes("supplier") && (
        <div className="step">
          <b />
          <label>
            Supplier (Xero)
            <select name="supplierContactId">
              <option value="">—</option>
              {suppliers.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Item on the bills (word or code)
            <input name="itemText" placeholder="e.g. bubble" />
          </label>
        </div>
      )}
      <div className="step">
        <b>6</b>
        <label>
          Site
          <select name="site">
            <option value="">Both</option>
            <option value="smi">Smithfield</option>
            <option value="par">Parramatta</option>
          </select>
        </label>
        <label>
          Reviewer
          <select name="reviewer">
            <option value="">—</option>
            {users.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          Review by
          <input name="reviewDue" type="date" />
        </label>
        <label>
          Horizon
          <select name="horizon">
            <option value="SHORT">Short term</option>
            <option value="LONG">Long term</option>
          </select>
        </label>
        <label>
          Saving type
          <select name="savingType">
            {SAVING_TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <button type="submit" className="btn primary" disabled={pending}>
          {pending ? "Preparing…" : "Save idea & propose the calculation"}
        </button>
        <Msg s={s} />
      </div>
      <p className="meta">The calculation is proposed from your choices and prefilled with figures the app already has (orders, labour cost per minute, supplier prices from Xero bills). You check and complete it in the idea&apos;s panel.</p>
    </form>
  );
}

export function FieldEdit({ id, field, value, type = "text", options, placeholder, width }: { id: string; field: Parameters<typeof updateImprovementAction>[1]; value: string; type?: "text" | "date" | "number" | "select"; options?: Array<[string, string]>; placeholder?: string; width?: number }) {
  const [v, setV] = useState(value);
  const { s, pending, run } = useRun();
  const save = (x: string) => x !== value && run(() => updateImprovementAction(id, field, x));
  return (
    <span className="fedit">
      {type === "select" ? (
        <select value={v} disabled={pending} onChange={(e) => (setV(e.target.value), save(e.target.value))}>
          {options!.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      ) : (
        <input type={type} value={v} placeholder={placeholder} style={{ width }} disabled={pending} onChange={(e) => setV(e.target.value)} onBlur={() => save(v)} onKeyDown={(e) => e.key === "Enter" && save(v)} />
      )}
      {s && !s.ok && <Msg s={s} />}
    </span>
  );
}

export function StageButtons({ id, stage, canVerify }: { id: string; stage: string; canVerify: boolean }) {
  const { s, pending, run } = useRun();
  const b = (to: string, l: string, primary = false) => (
    <button type="button" className={"btn" + (primary ? " primary" : "")} disabled={pending} onClick={() => run(() => setStageAction(id, to))}>
      {l}
    </button>
  );
  return (
    <div className="row">
      {stage === "IDEA" && (
        <>
          {b("APPROVED", "Approve → initiative", true)}
          {b("PARKED", "Park")}
          {b("REJECTED", "Reject")}
        </>
      )}
      {(stage === "PARKED" || stage === "REJECTED") && b("IDEA", "Back to ideas")}
      {stage === "APPROVED" && b("IN_PROGRESS", "Start", true)}
      {stage === "IN_PROGRESS" && b("DONE", "Mark done", true)}
      {stage === "DONE" && (
        <button type="button" className="btn primary" disabled={pending || !canVerify} title={canVerify ? "" : "Needs the measured saving and 1–3 months of data"} onClick={() => run(() => setStageAction(id, "VERIFIED"))}>
          Verify saving
        </button>
      )}
      <Msg s={s} />
    </div>
  );
}

export function CalcEditor({ id, blocks: initial, basis }: { id: string; blocks: CalcBlock[]; basis?: string }) {
  const [blocks, setBlocks] = useState<CalcBlock[]>(initial);
  const r = useMemo(() => calcSaving(blocks), [blocks]);
  const { s, pending, run } = useRun();
  const set = (i: number, k: string, v: string) => setBlocks(blocks.map((b, j) => (j === i ? { ...b, inputs: { ...b.inputs, [k]: v === "" ? null : Number(v) } } : b)));
  return (
    <div>
      {!blocks.length && <p className="meta">No blocks yet — add one below.</p>}
      {blocks.map((b, i) => (
        <div key={i} className="cblock">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong className="small">{BLOCK_SPEC[b.kind].title}</strong>
            <button type="button" className="lnk" onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}>
              remove
            </button>
          </div>
          <div className="addform">
            {BLOCK_SPEC[b.kind].fields.map(([k, l]) => (
              <label key={k}>
                {l}
                <input type="number" step="any" value={b.inputs[k] ?? ""} onChange={(e) => set(i, k, e.target.value)} style={{ width: 110 }} className={b.inputs[k] == null ? "missing" : ""} />
              </label>
            ))}
          </div>
          {b.kind !== "investment" && <div className="formula small">{calcSaving([b]).lines[0]?.working}</div>}
        </div>
      ))}
      <div className="formula">
        Saving: <strong>{aud(r.monthly)}</strong> / month · <strong>{aud(r.monthly != null ? r.monthly * 12 : null)}</strong> / year
        {r.investment > 0 && (
          <>
            {" "}
            · investment {aud(r.investment)} · payback {r.paybackMonths != null ? `${r.paybackMonths.toFixed(1)} months` : "—"}
          </>
        )}
        {r.missing.length > 0 && <div className="msg-err small">Missing: {r.missing.join("; ")}</div>}
        {basis && <div className="meta small">Prefilled figures: {basis}. Edit anything.</div>}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn primary" disabled={pending} onClick={() => run(() => saveCalcAction(id, blocks))}>
          Save calculation
        </button>
        <select
          value=""
          onChange={(e) => e.target.value && run(() => addBlockAction(id, e.target.value as BlockKind))}
          aria-label="Add a block"
        >
          <option value="">+ Add block…</option>
          {(Object.keys(BLOCK_SPEC) as BlockKind[]).map((k) => (
            <option key={k} value={k}>
              {BLOCK_SPEC[k].title}
            </option>
          ))}
        </select>
        <Msg s={s} />
      </div>
    </div>
  );
}

export function StepsEditor({ id, steps, owners }: { id: string; steps: Array<{ id: string; name: string; start: string; due: string; owner: string; status: string; state: string; kind: string | null }>; owners: string[] }) {
  const { s, pending, run } = useRun();
  const [nn, setNn] = useState("");
  return (
    <div>
      <div className="steplist">
        {steps.map((x, i) => (
          <div key={x.id} className={"stepcard" + (x.state === "late" ? " late" : x.status === "DONE" ? " done" : "")}>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <span className="sn">{i + 1}</span>
              <input defaultValue={x.name} onBlur={(e) => e.target.value !== x.name && run(() => updateStepAction(x.id, { name: e.target.value }))} style={{ flex: 1, minWidth: 0 }} aria-label="Step name" />
              <button type="button" className="lnk" disabled={pending || i === 0} onClick={() => run(() => moveStepAction(x.id, -1))} aria-label="Move up">
                ↑
              </button>
              <button type="button" className="lnk" disabled={pending || i === steps.length - 1} onClick={() => run(() => moveStepAction(x.id, 1))} aria-label="Move down">
                ↓
              </button>
              <button type="button" className="lnk" style={{ color: "var(--red)" }} onClick={() => confirm(`Remove “${x.name}”?`) && run(() => deleteStepAction(x.id))} aria-label="Remove">
                ×
              </button>
            </div>
            <div className="row sf">
              <label>
                Start
                <input type="date" defaultValue={x.start} onBlur={(e) => e.target.value !== x.start && run(() => updateStepAction(x.id, { start: e.target.value || null }))} />
              </label>
              <label>
                Due
                <input type="date" defaultValue={x.due} onBlur={(e) => e.target.value !== x.due && run(() => updateStepAction(x.id, { due: e.target.value || null }))} />
              </label>
              <label>
                Owner
                <select defaultValue={x.owner} onChange={(e) => run(() => updateStepAction(x.id, { owner: e.target.value || null }))}>
                  <option value="">—</option>
                  {[...new Set([...owners, ...(x.owner ? [x.owner] : [])])].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select defaultValue={x.status} onChange={(e) => run(() => updateStepAction(x.id, { status: e.target.value as "DONE" }))}>
                  <option value="NOT_STARTED">not started</option>
                  <option value="IN_PROGRESS">in progress</option>
                  <option value="DONE">done</option>
                </select>
              </label>
              {x.state === "late" && <span className="msg-err small">late</span>}
              {x.kind === "measure_after" && <span className="meta small">recalculates the saving</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input value={nn} onChange={(e) => setNn(e.target.value)} placeholder="New step" />
        <button type="button" className="btn" disabled={pending || !nn.trim()} onClick={() => (run(() => addStepAction(id, nn)), setNn(""))}>
          Add step
        </button>
        <Msg s={s} />
      </div>
      <p className="meta small">Steps owned by someone with a login become their Tasks (with the due date); late steps are flagged. Packers without a login are listed as participants only.</p>
    </div>
  );
}

export function Participants({ id, people, staff }: { id: string; people: string[]; staff: string[] }) {
  const { s, pending, run } = useRun();
  const [add, setAdd] = useState("");
  const save = (list: string[]) => run(() => updateImprovementAction(id, "participants", list));
  return (
    <div>
      <div className="chips">
        {people.map((p) => (
          <span key={p} className="chip">
            {p}
            <button type="button" disabled={pending} onClick={() => save(people.filter((x) => x !== p))} aria-label={`Remove ${p}`}>
              ×
            </button>
          </span>
        ))}
        {!people.length && <span className="meta">No one yet.</span>}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input list="staff-names" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add a person (staff or anyone)" style={{ width: 240 }} />
        <datalist id="staff-names">
          {staff.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <button type="button" className="btn" disabled={pending || !add.trim() || people.includes(add.trim())} onClick={() => (save([...people, add.trim()]), setAdd(""))}>
          Add
        </button>
        <Msg s={s} />
      </div>
    </div>
  );
}

export function CommentBox({ id }: { id: string }) {
  const { s, pending, run } = useRun();
  const [t, setT] = useState("");
  return (
    <div className="row">
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Add an update or comment" style={{ flex: 1, minWidth: 220 }} />
      <button type="button" className="btn" disabled={pending || !t.trim()} onClick={() => (run(() => addCommentAction(id, t)), setT(""))}>
        Post
      </button>
      <Msg s={s} />
    </div>
  );
}

export function AddCategory() {
  const { s, pending, run } = useRun();
  const [n, setN] = useState("");
  const [subs, setSubs] = useState("");
  return (
    <div className="addform">
      <label>
        New category
        <input value={n} onChange={(e) => setN(e.target.value)} />
      </label>
      <label>
        Sub-categories (comma-separated)
        <input value={subs} onChange={(e) => setSubs(e.target.value)} style={{ width: 260 }} />
      </label>
      <button type="button" className="btn" disabled={pending || !n.trim()} onClick={() => (run(() => addCategoryAction(n, subs)), setN(""), setSubs(""))}>
        Add
      </button>
      <Msg s={s} />
    </div>
  );
}
