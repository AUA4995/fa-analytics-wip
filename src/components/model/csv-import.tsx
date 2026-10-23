"use client";

import { useState, useTransition } from "react";
import { importCsvAction, type ImportState } from "@/app/settings/model-actions";
import type { ImportEntity } from "@/lib/model/csv";
import "./model.css";

/** Paste or upload a CSV → preview what changes → Save. Nothing is deleted; every change is logged. */
export function CsvImport({ entity, columns, example }: { entity: ImportEntity; columns: string; example?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<ImportState | null>(null);
  const [pending, start] = useTransition();
  const run = (commit: boolean) => start(async () => setState(await importCsvAction(entity, text, commit)));
  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Import CSV
      </button>
    );
  const p = state?.plan;
  return (
    <div className="csv-box card" style={{ marginTop: 10 }}>
      <p className="small" style={{ marginTop: 0 }}>
        Columns: <code className="mono">{columns}</code>. First row = headers. Empty cells leave values as they are.
      </p>
      <input
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setText(await f.text());
          setState(null);
        }}
      />
      <textarea value={text} onChange={(e) => (setText(e.target.value), setState(null))} placeholder={example ?? columns} aria-label="CSV text" />
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn" disabled={pending || !text.trim()} onClick={() => run(false)}>
          Preview
        </button>
        <button type="button" className="btn primary" disabled={pending || !state?.ok || !!state?.done || !p || (p.creates.length + p.updates.length === 0)} onClick={() => run(true)}>
          Save {p ? `${p.creates.length + p.updates.length} changes` : ""}
        </button>
        <button type="button" className="btn" onClick={() => (setOpen(false), setText(""), setState(null))}>
          Close
        </button>
      </div>
      {state && <p className={state.ok ? "msg-ok" : "msg-err"}>{state.message}</p>}
      {p && (
        <div className="small">
          {p.unknownColumns.length > 0 && <p className="meta">Ignored columns: {p.unknownColumns.join(", ")}</p>}
          {p.errors.length > 0 && (
            <ul className="msg-err">
              {p.errors.slice(0, 20).map((e, i) => (
                <li key={i}>
                  Row {e.line}: {e.message}
                </li>
              ))}
            </ul>
          )}
          {p.creates.length > 0 && <p>New: {p.creates.slice(0, 15).map((c) => c.key.replace(/^(name|xero):/, "")).join(", ")}{p.creates.length > 15 ? ` and ${p.creates.length - 15} more` : ""}</p>}
          {p.updates.length > 0 && (
            <ul>
              {p.updates.slice(0, 15).map((u, i) => (
                <li key={i}>
                  {u.key.replace(/^(name|xero):/, "")} · {u.field}: {fmt(u.old)} → <strong>{fmt(u.value)}</strong>
                </li>
              ))}
              {p.updates.length > 15 && <li>and {p.updates.length - 15} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const fmt = (v: unknown) => (v == null || v === "" ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v));
