"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { formatFieldValue, inputFieldValue, type FieldSpec } from "@/lib/model/fields";
import { logsAction, updateValueAction } from "@/app/settings/model-actions";
import type { LogLine } from "@/lib/model/store";
import "./model.css";

/**
 * One editable value with its Logs button (brief §4, §12). Click the value (or Edit) → input → Save with an optional
 * reason. Used in Settings and in every details panel, so both edit the same stored value.
 */
export function EditableValue({
  entity,
  id,
  field,
  spec,
  value,
  logCount = 0,
  canEdit = true,
  compact = false,
}: {
  entity: string;
  id: string;
  field: string;
  spec: FieldSpec;
  value: unknown;
  logCount?: number;
  canEdit?: boolean;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [display, setDisplay] = useState(() => formatFieldValue(spec, value));
  const [draft, setDraft] = useState(() => inputFieldValue(spec, value));
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [count, setCount] = useState(logCount);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement & HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = (raw: string | boolean) =>
    start(async () => {
      const r = await updateValueAction(entity, id, field, raw, reason);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        if (r.display != null) setDisplay(r.display);
        if (r.message === "Saved") setCount((c) => c + 1);
        setEditing(false);
        setReason("");
      }
    });

  if (spec.kind === "bool") {
    return (
      <span className="ev">
        <label className="ev-bool">
          <input type="checkbox" defaultChecked={!!value} disabled={!canEdit || pending} onChange={(e) => save(e.target.checked)} aria-label={spec.label} />
          <span>{display}</span>
        </label>
        <LogsButton entity={entity} id={id} field={field} spec={spec} count={count} />
        {msg && !msg.ok && <span className="msg-err">{msg.text}</span>}
      </span>
    );
  }

  return (
    <span className={"ev" + (compact ? " compact" : "")}>
      {!editing ? (
        <>
          {canEdit ? (
            <button type="button" className="ev-val" onClick={() => setEditing(true)} title="Click to edit">
              {display}
            </button>
          ) : (
            <span className="ev-val ro">{display}</span>
          )}
          <LogsButton entity={entity} id={id} field={field} spec={spec} count={count} />
          {msg?.ok && msg.text === "Saved" && <span className="msg-ok">Saved</span>}
        </>
      ) : (
        <form
          className="ev-edit"
          onSubmit={(e) => {
            e.preventDefault();
            save(draft);
          }}
        >
          {spec.kind === "select" ? (
            <select ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={spec.label}>
              {spec.optional && <option value="">—</option>}
              {spec.options?.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={spec.label}
              placeholder={spec.kind === "date" ? "DD/MM/YYYY" : spec.kind === "list" ? "comma separated" : ""}
              inputMode={["number", "int", "money", "pct"].includes(spec.kind) ? "decimal" : undefined}
              style={{ width: ["text", "list", "drivers"].includes(spec.kind) ? 220 : 110 }}
            />
          )}
          {spec.kind === "pct" && <span className="small">%</span>}
          <input className="ev-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why (optional)" aria-label="Reason for the change" />
          <button type="submit" className="btn primary" disabled={pending}>
            {pending ? "…" : "Save"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setEditing(false);
              setMsg(null);
              setDraft(inputFieldValue(spec, value));
            }}
          >
            Cancel
          </button>
          {msg && !msg.ok && <span className="msg-err">{msg.text}</span>}
        </form>
      )}
    </span>
  );
}

/** Small "Logs · n" button → who, when, old → new, why (newest first). */
export function LogsButton({ entity, id, field, spec, count }: { entity: string; id: string; field?: string; spec?: FieldSpec; count: number }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<LogLine[] | null>(null);
  const [pending, start] = useTransition();
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) start(async () => setLines(await logsAction(entity, id, field)));
  };
  const fmt = (v: unknown) => (spec ? formatFieldValue(spec, v) : typeof v === "object" && v !== null ? JSON.stringify(v) : v == null ? "—" : String(v));
  return (
    <span className="logs-wrap">
      <button type="button" className="lnk logsbtn" onClick={toggle} aria-expanded={open}>
        Logs{count ? ` · ${count}` : ""}
      </button>
      {open && (
        <span className="logs-pop" role="dialog" aria-label="Change log">
          {pending && !lines ? (
            <span className="meta">Loading…</span>
          ) : !lines?.length ? (
            <span className="meta">No changes yet{field ? " — this is the starting value" : ""}.</span>
          ) : (
            lines.map((l) => (
              <span key={l.id} className="log-line">
                <span className="meta">
                  {new Date(l.at).toLocaleString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney" })} · {l.actorName}
                  {l.actorType !== "USER" ? ` (${l.actorType === "API_KEY" ? "API key" : "sync"})` : ""}
                </span>
                <span>
                  {l.field === "_created" ? "Added" : l.field === "_deleted" ? "Removed" : (
                    <>
                      {!field && <strong>{l.field}: </strong>}
                      {fmt(l.oldValue)} → <strong>{fmt(l.newValue)}</strong>
                    </>
                  )}
                </span>
                {l.reason && <span className="meta">“{l.reason}”</span>}
              </span>
            ))
          )}
          <button type="button" className="lnk" onClick={() => setOpen(false)}>
            Close
          </button>
        </span>
      )}
    </span>
  );
}
