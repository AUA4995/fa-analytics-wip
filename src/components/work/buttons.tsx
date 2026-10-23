"use client";

import { useState, useTransition } from "react";
import { resolveTaskAction, snoozeTaskAction, addFromNoticeAction, dismissNoticeAction } from "@/app/tasks/actions";
import { leakExplainAction, leakRecoveredAction, leakReopenAction, leakTaskAction, runDetectionAction } from "@/app/leakage/actions";
import "@/components/model/model.css";

type S = { ok: boolean; message: string } | null;
function Msg({ s }: { s: S }) {
  return s ? <span className={s.ok ? "msg-ok" : "msg-err"}>{s.message}</span> : null;
}

export function TaskButtons({ id, hasCheck, status }: { id: string; hasCheck: boolean; status: string }) {
  const [s, set] = useState<S>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  if (status === "DONE") return null;
  return (
    <span className="row" style={{ display: "inline-flex" }}>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="what was done (optional)" style={{ width: 180 }} className="ev-reason" aria-label="What was done" />
      <button type="button" className="btn primary" disabled={pending} onClick={() => start(async () => set(await resolveTaskAction(id, note)))} title={hasCheck ? "Checked against the source before closing" : "Closed by hand"}>
        {pending ? "Checking…" : hasCheck ? "Resolve (check)" : "Done"}
      </button>
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => set(await snoozeTaskAction(id)))}>
        Snooze 48 h
      </button>
      <Msg s={s} />
    </span>
  );
}

export function NoticeActions({ id, kind, clients }: { id: string; kind: string; clients: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const [s, set] = useState<S>(null);
  const [pending, start] = useTransition();
  const field = (k: string, label: string, el: React.ReactNode) => (
    <label key={k}>
      {label}
      {el}
    </label>
  );
  const sel = (k: string, opts: Array<[string, string]>) => (
    <select value={f[k] ?? opts[0][0]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
  const inp = (k: string, ph = "") => <input value={f[k] ?? ""} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} />;
  return (
    <div>
      {!open ? (
        <span className="row" style={{ display: "inline-flex" }}>
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            Add to Analytics
          </button>
          <button type="button" className="btn" disabled={pending} onClick={() => start(async () => set(await dismissNoticeAction(id)))}>
            Dismiss
          </button>
          <Msg s={s} />
        </span>
      ) : (
        <div className="addform">
          {kind === "NEW_STAFF" && [
            field("site", "Site", sel("site", [["smi", "Smithfield"], ["par", "Parramatta"], ["both", "Both sites"]])),
            field("pool", "Pool", sel("pool", [["floor", "Floor"], ["csr", "CSR"], ["supervisor", "Supervisor"], ["admin", "Admin"]])),
            field("type", "Type", sel("type", [["PERMANENT", "Permanent"], ["CASUAL", "Casual"], ["AGENCY", "Agency"]])),
            field("position", "Position", inp("position")),
          ]}
          {kind === "NEW_CLIENT" && [field("shortName", "Short name", inp("shortName")), field("site", "Site", sel("site", [["", "—"], ["smi", "Smithfield"], ["par", "Parramatta"]]))]}
          {kind === "NEW_TENANT" && [field("clientId", "Existing client", sel("clientId", [["", "— new client —"], ...clients.map((c) => [c.id, c.name] as [string, string])])), field("name", "or new client's name", inp("name"))]}
          <button type="button" className="btn primary" disabled={pending} onClick={() => start(async () => set(await addFromNoticeAction(id, f)))}>
            Add
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Close
          </button>
          <Msg s={s} />
        </div>
      )}
    </div>
  );
}

export function DetectButton() {
  const [s, set] = useState<S>(null);
  const [pending, start] = useTransition();
  return (
    <span className="row" style={{ display: "inline-flex" }}>
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => set(await runDetectionAction()))}>
        {pending ? "Checking…" : "Check now"}
      </button>
      <Msg s={s} />
    </span>
  );
}

export function LeakActions({ id, status, people }: { id: string; status: string; people: string[] }) {
  const [mode, setMode] = useState<"" | "task" | "explain" | "rec">("");
  const [v, setV] = useState<Record<string, string>>({});
  const [s, set] = useState<S>(null);
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<S>) => start(async () => set(await fn()));
  if (status === "RECOVERED" || status === "EXPLAINED")
    return (
      <span className="row" style={{ display: "inline-flex" }}>
        <button type="button" className="btn" disabled={pending} onClick={() => go(() => leakReopenAction(id))}>
          Reopen
        </button>
        <Msg s={s} />
      </span>
    );
  return (
    <div>
      <div className="row">
        {status === "OPEN" && (
          <button type="button" className={"btn" + (mode === "task" ? " on" : "")} onClick={() => setMode("task")}>
            Create task (fix by hand)
          </button>
        )}
        <button type="button" className={"btn" + (mode === "explain" ? " on" : "")} onClick={() => setMode("explain")}>
          Explained
        </button>
        <button type="button" className={"btn primary" + (mode === "rec" ? " on" : "")} onClick={() => setMode("rec")}>
          Recovered
        </button>
      </div>
      {mode && (
        <div className="addform" style={{ marginTop: 8 }}>
          {mode === "task" && (
            <label>
              Owner
              <select value={v.owner ?? ""} onChange={(e) => setV({ ...v, owner: e.target.value })}>
                <option value="">—</option>
                {people.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          )}
          {mode === "explain" && (
            <label>
              Why it isn&apos;t leakage
              <input value={v.cause ?? ""} onChange={(e) => setV({ ...v, cause: e.target.value })} style={{ width: 280 }} />
            </label>
          )}
          {mode === "rec" && (
            <>
              <label>
                Amount billed
                <input value={v.amount ?? ""} onChange={(e) => setV({ ...v, amount: e.target.value })} style={{ width: 100 }} inputMode="decimal" />
              </label>
              <label>
                Xero invoice
                <input value={v.invoice ?? ""} onChange={(e) => setV({ ...v, invoice: e.target.value })} placeholder="INV-21874" style={{ width: 120 }} />
              </label>
              <label>
                Date
                <input value={v.date ?? ""} onChange={(e) => setV({ ...v, date: e.target.value })} placeholder="DD/MM/YYYY" style={{ width: 110 }} />
              </label>
            </>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={pending}
            onClick={() => go(() => (mode === "task" ? leakTaskAction(id, v.owner ?? "") : mode === "explain" ? leakExplainAction(id, v.cause ?? "") : leakRecoveredAction(id, { amount: v.amount ?? "", invoice: v.invoice ?? "", date: v.date ?? "" })))}
          >
            Save
          </button>
        </div>
      )}
      <Msg s={s} />
    </div>
  );
}
