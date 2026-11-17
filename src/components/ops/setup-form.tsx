"use client";

import { useActionState, useState, useTransition } from "react";
import { saveOpsSetupAction } from "@/app/operations/actions";
import type { FlowKey, OpsConfig, RoleKey } from "@/lib/ops/config";

type FlowInfo = Record<FlowKey, { title: string; defaultTable: string; roles: ReadonlyArray<readonly [RoleKey, string, boolean]> }>;

/** Operations → Setup: pick, per flow, the Thomax table and which of its fields mean client / created / done … */
export function OpsSetupForm({ cfg, info, tables }: { cfg: OpsConfig; info: FlowInfo; tables: Array<{ name: string; label: string; fields: string[] }> }) {
  const [state, action, pending] = useActionState(saveOpsSetupAction, null);
  const [, startSave] = useTransition();
  const [picked, setPicked] = useState<Record<FlowKey, string>>({ dispatch: cfg.flows.dispatch.table, receiving: cfg.flows.receiving.table, expected: cfg.flows.expected.table });
  const fieldsOf = (t: string) => tables.find((x) => x.name === t)?.fields ?? [];
  return (
    <form
      className="stack"
      // No automatic reset after saving: the chosen fields stay on screen (and a second Save keeps them)
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startSave(() => action(fd));
      }}
    >
      {(Object.keys(info) as FlowKey[]).map((k) => {
        const fields = fieldsOf(picked[k]);
        return (
          <fieldset key={k}>
            <legend>{info[k].title}</legend>
            <div className="form-grid">
              <label>
                Thomax table
                <select name={`${k}.table`} value={picked[k]} onChange={(e) => setPicked({ ...picked, [k]: e.target.value })}>
                  {tables.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name} · {t.label}
                    </option>
                  ))}
                </select>
                {!fields.length && <span className="meta">No fields yet — run Explore for {picked[k]} on Data sources → WMS.</span>}
              </label>
              {info[k].roles.map(([r, label, req]) => (
                <label key={`${k}.${r}.${picked[k]}`}>
                  {label}
                  {req ? "" : " (optional)"}
                  <select name={`${k}.${r}`} defaultValue={picked[k] === cfg.flows[k].table ? (cfg.flows[k].roles[r] ?? "") : ""}>
                    <option value="">—</option>
                    {fields.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
      <fieldset>
        <legend>SLA rules</legend>
        <div className="form-grid">
          <label>
            Same-day cut-off (hour, 0–23)
            <input name="cutoffHour" type="number" min={0} max={23} defaultValue={cfg.rules.cutoffHour} />
            <span className="meta">Orders before this hour on a working day ship the same day.</span>
          </label>
          <label>
            B2B: extra working days
            <input name="b2bExtraDays" type="number" min={0} max={10} defaultValue={cfg.rules.b2bExtraDays} />
            <span className="meta">2 = the agreed 48 hours.</span>
          </label>
          <label>
            Order type values that mean B2B
            <input name="b2bValues" defaultValue={cfg.b2bValues.join(", ")} placeholder="e.g. B2B, WHOLESALE" maxLength={400} />
            <span className="meta">Comma-separated; matched on the order type field. Empty = every order is treated as B2C.</span>
          </label>
          <label>
            Receiving target (hours)
            <input name="receivingHours" type="number" min={1} max={720} step="0.5" defaultValue={cfg.rules.receivingHours} />
          </label>
          <label className="row">
            Public holidays (not working days)
            <textarea name="holidays" rows={3} defaultValue={cfg.rules.holidays.join(", ")} placeholder="25/12/2026, 26/12/2026, 2027-01-01" maxLength={4000} />
            <span className="meta">Weekends are never working days. Add NSW public holidays here; until then they count as working days.</span>
          </label>
        </div>
      </fieldset>
      <div>
        <button className="btn primary" disabled={pending}>
          Save
        </button>{" "}
        {state && <span className={state.ok ? "msg-ok" : "msg-err"}>{state.message}</span>}
      </div>
    </form>
  );
}
