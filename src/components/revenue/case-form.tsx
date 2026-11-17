"use client";

import { useActionState, useEffect, useTransition, useState } from "react";
import { deleteCase, saveCase, type CaseState } from "@/app/revenue/actions";

export interface CaseValues {
  id?: string;
  date: string;
  clientId: string;
  clientName: string;
  title: string;
  kind: string;
  whatHappened: string;
  amountBefore: string;
  amountAfter: string;
  pending: string;
  status: string;
  stoppedBy: string;
  carNumber: string;
  lessons: string;
}

const LABEL_BEFORE: Record<string, string> = { COST_AVOIDED: "Would have cost ($, ex GST)", LOSS: "Should have earned / cost ($)", RECOVERED: "Missed ($)" };
const LABEL_AFTER: Record<string, string> = { COST_AVOIDED: "Actually cost ($)", LOSS: "Actually cost ($)", RECOVERED: "Still missed after recovery ($, usually 0)" };

/** Add or edit a revenue protection case (batch 4). Amounts left empty = not known yet (never guessed). */
export function CaseForm(props: { v: CaseValues; clients: Array<[string, string]>; canEdit: boolean }) {
  // A new form per case: switching cases in the drawer must not carry the previous case's kind over.
  // The "Add" form gets a fresh, empty form after each successful add (so a second click can't add it twice).
  const [round, setRound] = useState(0);
  const [added, setAdded] = useState<string | null>(null);
  return (
    <>
      {added && !props.v.id && <p className="msg-ok">{added}</p>}
      <CaseFormInner
        key={`${props.v.id ?? "new"}:${round}`}
        {...props}
        onAdded={
          props.v.id
            ? undefined
            : (m) => {
                setAdded(m);
                setRound((r) => r + 1);
              }
        }
      />
    </>
  );
}

function CaseFormInner({ v, clients, canEdit, onAdded }: { v: CaseValues; clients: Array<[string, string]>; canEdit: boolean; onAdded?: (message: string) => void }) {
  const [state, action, pending] = useActionState(saveCase, null as CaseState | null);
  useEffect(() => {
    if (state?.ok && onAdded) onAdded(state.message);
  }, [state, onAdded]);
  const [, startSave] = useTransition();
  const [kind, setKind] = useState(v.kind || "COST_AVOIDED");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className="stack"
      // Submit without React's automatic form reset, so a validation message never wipes what was typed
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startSave(() => action(fd));
      }}
    >
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="form-grid">
        <label>
          Date
          <input type="date" name="date" defaultValue={v.date} required disabled={!canEdit} />
        </label>
        <label>
          Kind
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} disabled={!canEdit}>
            <option value="COST_AVOIDED">Cost avoided</option>
            <option value="LOSS">Loss (not prevented)</option>
            <option value="RECOVERED">Recovered</option>
          </select>
        </label>
        <label>
          Client
          <select name="clientId" defaultValue={v.clientId} disabled={!canEdit}>
            <option value="">— not in the list —</option>
            {clients.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Client (as written)
          <input type="text" name="clientName" defaultValue={v.clientName} maxLength={120} disabled={!canEdit} />
        </label>
      </div>
      <label>
        Title
        <input type="text" name="title" defaultValue={v.title} required maxLength={160} disabled={!canEdit} />
      </label>
      <label>
        What happened
        <textarea name="whatHappened" defaultValue={v.whatHappened} rows={4} required maxLength={4000} disabled={!canEdit} />
      </label>
      <div className="form-grid">
        <label>
          {LABEL_BEFORE[kind]}
          <input type="text" name="amountBefore" inputMode="decimal" defaultValue={v.amountBefore} disabled={!canEdit} />
        </label>
        <label>
          {LABEL_AFTER[kind]}
          <input type="text" name="amountAfter" inputMode="decimal" defaultValue={v.amountAfter} disabled={!canEdit} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={v.status || "OPEN"} disabled={!canEdit}>
            <option value="OPEN">Open — figures to confirm</option>
            <option value="CLOSED">Closed</option>
          </select>
        </label>
        <label>
          CAR number
          <input type="text" name="carNumber" defaultValue={v.carNumber} maxLength={40} disabled={!canEdit} />
          <span className="meta">From the HR app — no staff names here</span>
        </label>
      </div>
      <label>
        Still to confirm
        <input type="text" name="pending" defaultValue={v.pending} maxLength={500} disabled={!canEdit} placeholder="e.g. NZ delivery cost, invoice hours" />
      </label>
      <label>
        Stopped / raised by
        <input type="text" name="stoppedBy" defaultValue={v.stoppedBy} maxLength={120} disabled={!canEdit} />
      </label>
      <label>
        Lessons / process gaps
        <textarea name="lessons" defaultValue={v.lessons} rows={3} maxLength={4000} disabled={!canEdit} />
      </label>
      {canEdit && (
        <div className="row">
          <button className="btn primary" disabled={pending}>
            {v.id ? "Save" : "Add case"}
          </button>
          {v.id && (
            <button type="button" className="btn" style={{ color: "var(--red)" }} disabled={busy} onClick={() => confirm(`Delete “${v.title}”?`) && start(async () => setMsg((await deleteCase(v.id!)).message))}>
              Delete
            </button>
          )}
          {state && <span className={state.ok ? "msg-ok" : "msg-err"}>{state.message}</span>}
          {msg && <span className="meta">{msg}</span>}
        </div>
      )}
    </form>
  );
}
