"use client";

import { useActionState, useState } from "react";
import { createRecord, type CreateState } from "@/app/settings/model-actions";
import "./model.css";

export interface AddField {
  name: string;
  label: string;
  type?: "text" | "select" | "multi";
  options?: ReadonlyArray<readonly [string, string]>;
  placeholder?: string;
  width?: number;
}

/** "+ Add …" button → one-line form. New records open in their details panel afterwards via `onAddedHref`. */
export function AddForm({ entity, label, fields }: { entity: string; label: string; fields: AddField[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: CreateState | null, fd: FormData) => createRecord(entity, prev, fd), null);
  if (!open)
    return (
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>
        + {label}
      </button>
    );
  return (
    <form action={action} className="addform card" style={{ marginTop: 10 }}>
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          {f.type === "select" || f.type === "multi" ? (
            <select name={f.name} multiple={f.type === "multi"} defaultValue={f.type === "multi" ? [] : f.options?.[0]?.[0]}>
              {f.options?.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <input name={f.name} placeholder={f.placeholder} style={{ width: f.width ?? 180 }} />
          )}
        </label>
      ))}
      <button type="submit" className="btn primary" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        Close
      </button>
      {state && <span className={state.ok ? "msg-ok" : "msg-err"}>{state.message}</span>}
    </form>
  );
}
