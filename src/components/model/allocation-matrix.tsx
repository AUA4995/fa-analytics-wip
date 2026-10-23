"use client";

import { useMemo, useState, useTransition } from "react";
import { setAllocation } from "@/app/settings/model-actions";
import "./model.css";

interface Cell {
  staffId: string;
  clientId: string;
  pct: number;
  source: "MANUAL" | "WMS";
}

/** Staff = rows, clients = columns, % per cell. Saves on blur; each cell has its own log (click the total for a person's). */
export function AllocationMatrix({ staff, clients, cells, canEdit }: { staff: Array<{ id: string; name: string; pool: string }>; clients: Array<{ id: string; name: string }>; cells: Cell[]; canEdit: boolean }) {
  const [vals, setVals] = useState(() => Object.fromEntries(cells.map((c) => [`${c.staffId}|${c.clientId}`, c.pct])) as Record<string, number>);
  const src = useMemo(() => Object.fromEntries(cells.map((c) => [`${c.staffId}|${c.clientId}`, c.source])), [cells]);
  const [err, setErr] = useState<Record<string, string>>({});
  const [, start] = useTransition();
  const total = (sid: string) => clients.reduce((a, c) => a + (vals[`${sid}|${c.id}`] ?? 0), 0) + cells.filter((c) => c.staffId === sid && !clients.some((x) => x.id === c.clientId)).reduce((a, c) => a + c.pct, 0);
  const save = (sid: string, cid: string, raw: string) => {
    const k = `${sid}|${cid}`;
    const n = raw.trim() === "" ? 0 : Number(raw);
    if ((vals[k] ?? 0) === n) return;
    start(async () => {
      const r = await setAllocation(sid, cid, raw);
      if (r.ok) {
        setVals((v) => ({ ...v, [k]: n }));
        setErr((e) => ({ ...e, [k]: "" }));
      } else setErr((e) => ({ ...e, [k]: r.message }));
    });
  };
  return (
    <div className="tw">
      <table className="matrix">
        <thead>
          <tr>
            <th>Staff</th>
            {clients.map((c) => (
              <th key={c.id} className="r" style={{ minWidth: 64 }}>
                {c.name}
              </th>
            ))}
            <th className="r">Total</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => {
            const t = total(s.id);
            return (
              <tr key={s.id}>
                <td className="sup">
                  {s.name}
                  <div className="meta">{s.pool}</div>
                </td>
                {clients.map((c) => {
                  const k = `${s.id}|${c.id}`;
                  return (
                    <td key={c.id} className="cell">
                      <input
                        className={"mx" + (src[k] === "WMS" ? " wms" : "") + (err[k] ? " err" : "")}
                        defaultValue={vals[k] ? String(vals[k]) : ""}
                        disabled={!canEdit}
                        inputMode="decimal"
                        aria-label={`${s.name} on ${c.name}, %`}
                        title={err[k] || (src[k] === "WMS" ? "From the WMS — type to override" : "Manual")}
                        onBlur={(e) => save(s.id, c.id, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      />
                    </td>
                  );
                })}
                <td className={"r num tot" + (t > 100 ? " over" : "")}>{Math.round(t * 10) / 10}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {Object.values(err).some(Boolean) && <p className="msg-err">{Object.values(err).filter(Boolean)[0]}</p>}
      <p className="meta">Every cell change is logged — open a person for their allocation history.</p>
    </div>
  );
}
