"use client";

import { useActionState, useState, useTransition } from "react";
import type { DataActionState } from "@/app/data/actions";
import { disconnectThomaxAction, exploreThomaxAction, runThomaxAction, saveThomaxConnectionAction, saveThomaxTableAction, testThomaxAction } from "@/app/data/thomax-actions";

function Msg({ m }: { m: DataActionState | null }) {
  if (!m) return null;
  return <span className={m.ok ? "msg-ok" : "msg-err"}>{m.message}</span>;
}

export function ThomaxConnectionForm({ cluster, username, historyFrom, recheckDays, connected }: { cluster: string; username: string; historyFrom: string; recheckDays: number; connected: boolean }) {
  const [state, action, pending] = useActionState(saveThomaxConnectionAction, null);
  return (
    <form action={action} className="form-grid" autoComplete="off">
      <label>
        Cluster
        <input name="cluster" defaultValue={cluster} required maxLength={32} />
        <span className="meta">https://<b>{cluster || "e"}</b>.dotwms.com — FA&apos;s is &quot;e&quot; (the one Power BI uses)</span>
      </label>
      <label>
        .wms user name
        <input name="username" defaultValue={username} required maxLength={200} autoComplete="off" />
      </label>
      <label>
        Password
        <input name="password" type="password" placeholder={connected ? "•••••••• (leave empty to keep)" : ""} required={!connected} maxLength={500} autoComplete="new-password" />
        <span className="meta">Stored encrypted. Never shown again.</span>
      </label>
      <label>
        Copy history from
        <input name="historyFrom" type="date" defaultValue={historyFrom} />
        <span className="meta">An earlier date reads the history again from it (rows are updated, not duplicated).</span>
      </label>
      <label>
        Re-check the last … days each night
        <input name="recheckDays" type="number" min={1} max={90} defaultValue={recheckDays} />
        <span className="meta">Catches status changes on recent orders and consignments.</span>
      </label>
      <div className="row">
        <button className="btn primary" disabled={pending}>
          {connected ? "Save & test" : "Connect & test"}
        </button>
        <Msg m={state} />
      </div>
    </form>
  );
}

function useRun() {
  const [msg, setMsg] = useState<DataActionState | null>(null);
  const [pending, start] = useTransition();
  return { msg, pending, run: (fn: () => Promise<DataActionState>) => start(async () => setMsg(await fn())) };
}

export function ThomaxButtons({ owner }: { owner: boolean }) {
  const { msg, pending, run } = useRun();
  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <button type="button" className="btn" disabled={pending} onClick={() => run(testThomaxAction)}>
        Test
      </button>
      <button type="button" className="btn" disabled={pending} onClick={() => run(() => exploreThomaxAction())}>
        Explore all tables
      </button>
      <button type="button" className="btn primary" disabled={pending} onClick={() => run(() => runThomaxAction("nightly"))}>
        Sync now
      </button>
      <button type="button" className="btn" disabled={pending} onClick={() => confirm("Start loading history now? It keeps going, step by step, until the history is loaded — also during the day, when it shares Thomax with Power BI and the daily emails (they may be a little slower). Close the app to pause it.") && run(() => runThomaxAction("history"))}>
        Load history now
      </button>
      {owner && (
        <button type="button" className="btn" style={{ color: "var(--red)" }} disabled={pending} onClick={() => confirm("Disconnect Thomax? The copied rows are kept.") && run(disconnectThomaxAction)}>
          Disconnect
        </button>
      )}
      <Msg m={msg} />
    </div>
  );
}

export function ExploreOneButton({ table }: { table: string }) {
  const { msg, pending, run } = useRun();
  return (
    <span className="row" style={{ display: "inline-flex" }}>
      <button type="button" className="btn" disabled={pending} onClick={() => run(() => exploreThomaxAction(table))}>
        Explore {table}
      </button>
      <Msg m={msg} />
    </span>
  );
}

export function ThomaxTableForm({
  table,
  fields,
  enabled,
  kind,
  dateField,
  keyFields,
  lookupFields,
  excludeFields = [],
  confirmed,
  rowCount,
  owner,
}: {
  table: string;
  fields: string[];
  enabled: boolean;
  kind: string;
  dateField: string | null;
  keyFields: string[];
  lookupFields: string[];
  excludeFields?: string[];
  confirmed: boolean;
  rowCount: number;
  owner: boolean;
}) {
  const [state, action, pending] = useActionState(saveThomaxTableAction, null);
  const [k, setK] = useState(kind);
  if (!fields.length) return <p className="meta">Explore this table first — its fields come from Thomax.</p>;
  return (
    <form action={action} className="stack">
      <input type="hidden" name="table" value={table} />
      {!confirmed && <p className="small" style={{ margin: 0 }}>Suggested settings below — check them and save. Nothing is copied until saved.</p>}
      <label className="row">
        <input type="checkbox" name="enabled" defaultChecked={enabled} disabled={!owner} /> Copy this table
      </label>
      <label>
        How to copy
        <select name="kind" value={k} onChange={(e) => setK(e.target.value)} disabled={!owner}>
          <option value="TRANSACTIONAL">By date: history month by month, then the last days each night</option>
          <option value="MASTER">Re-read in full each night (small lists: clients, items, carriers …)</option>
        </select>
      </label>
      {k === "TRANSACTIONAL" && (
        <label>
          Date field
          <select name="dateField" defaultValue={dateField ?? ""} disabled={!owner}>
            <option value="">— choose —</option>
            {fields.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <span className="meta">The time the record was created is best (e.g. a …CreateTime field).</span>
        </label>
      )}
      <fieldset>
        <legend>Field(s) that identify one row</legend>
        <span className="meta">So a re-read updates the row instead of adding a copy. Required — pick a field that is unique per row (an ID).</span>
        <div className="chips-wrap">
          {fields.map((f) => (
            <label key={f} className="chip-check">
              <input type="checkbox" name="keyFields" value={f} defaultChecked={keyFields.includes(f)} disabled={!owner} /> {f}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Searchable in Order lookup</legend>
        <span className="meta">Order numbers, consignment numbers, references, tracking numbers…</span>
        <div className="chips-wrap">
          {fields.map((f) => (
            <label key={f} className="chip-check">
              <input type="checkbox" name="lookupFields" value={f} defaultChecked={lookupFields.includes(f)} disabled={!owner} /> {f}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Don&apos;t copy these fields</legend>
        <span className="meta">For anything private Thomax keeps under an unusual name (a key, PIN or password). Fields named like passwords, PINs and tokens are already left out.</span>
        <div className="chips-wrap">
          {fields.map((f) => (
            <label key={f} className="chip-check">
              <input type="checkbox" name="excludeFields" value={f} defaultChecked={excludeFields.includes(f)} disabled={!owner} /> {f}
            </label>
          ))}
        </div>
      </fieldset>
      {owner && confirmed && rowCount > 0 && (
        <label className="row small">
          <input type="checkbox" name="confirmKeyChange" /> I understand: if I change the key fields, the {rowCount.toLocaleString("en-AU")} copied rows are deleted and the table is copied again.
        </label>
      )}
      {owner ? (
        <div className="row">
          <button className="btn primary" disabled={pending}>
            Save {table}
          </button>
          <Msg m={state} />
        </div>
      ) : (
        <p className="meta">Only the owner can change these settings.</p>
      )}
    </form>
  );
}
