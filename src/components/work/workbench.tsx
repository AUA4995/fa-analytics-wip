"use client";

import { useMemo, useState, useTransition } from "react";
import { createReviewAction, updateReviewAction } from "@/app/rates/actions";
import "@/components/model/model.css";

export interface WbLine {
  code: string;
  name: string;
  unit: string;
  rate: number | null;
  cost: number;
  avg3: number;
}

const aud = (n: number | null, dp = 2) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: dp, maximumFractionDigits: dp }));
const pc = (n: number | null) => (n == null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(1)}%`);

/** Rate review workbench (brief §8): costs are TDABC; new rates → $ / month on 3-month average volume. */
export function Workbench({ clientId, lines, reviewId, saved, floor, ticketsCost }: { clientId: string; lines: WbLine[]; reviewId: string | null; saved: Record<string, number>; floor: number; ticketsCost: number | null }) {
  const [rates, setRates] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.code, saved[l.code] != null ? String(saved[l.code]) : l.rate != null ? l.rate.toFixed(2) : ""])));
  const [target, setTarget] = useState(String(Math.round(floor * 100)));
  const [rid, setRid] = useState(reviewId);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const calc = useMemo(() => {
    const rows = lines.map((l) => {
      const nr = Number(rates[l.code]);
      return { ...l, newRate: Number.isFinite(nr) && rates[l.code] !== "" ? nr : null };
    });
    const cur = rows.reduce((a, l) => a + (l.rate != null ? (l.rate - l.cost) * l.avg3 : 0), 0);
    const nw = rows.reduce((a, l) => a + (l.newRate != null ? (l.newRate - l.cost) * l.avg3 : l.rate != null ? (l.rate - l.cost) * l.avg3 : 0), 0);
    return { rows, cur, nw };
  }, [lines, rates]);
  const raise = () => {
    const t = Number(target) / 100;
    setRates((r) => Object.fromEntries(lines.map((l) => {
      const need = l.cost / (1 - t);
      const curr = Number(r[l.code]);
      return [l.code, !Number.isFinite(curr) || r[l.code] === "" || curr < need ? (Math.ceil(need * 20) / 20).toFixed(2) : r[l.code]];
    })));
  };
  const save = () =>
    start(async () => {
      const newRates = Object.fromEntries(calc.rows.filter((r) => r.newRate != null && r.newRate !== r.rate).map((r) => [r.code, r.newRate!]));
      let id = rid;
      if (!id) {
        const c = await createReviewAction(clientId, "ADHOC", null, null);
        id = c.id ?? null;
        setRid(id);
      }
      if (id) setMsg(await updateReviewAction(id, { newRates, target: Number(target) / 100 }));
    });
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="small">
          Target margin <input value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 50 }} className="ev-reason" inputMode="decimal" />%
        </label>
        <button type="button" className="btn" onClick={raise}>
          Raise lines below target
        </button>
        <button type="button" className="btn" onClick={() => setRates(Object.fromEntries(lines.map((l) => [l.code, l.rate != null ? l.rate.toFixed(2) : ""])))}>
          Reset
        </button>
        <button type="button" className="btn primary" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save to the review"}
        </button>
        {msg && <span className={msg.ok ? "msg-ok" : "msg-err"}>{msg.message}</span>}
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="l">New margin / month</div>
          <div className="v">{aud(calc.nw, 0)}</div>
          <div className="s">on 3-month average volume</div>
        </div>
        <div className="kpi">
          <div className="l">Current margin / month</div>
          <div className="v">{aud(calc.cur, 0)}</div>
          <div className="s">billable services with a rate</div>
        </div>
        <div className="kpi green">
          <div className="l">Change / month</div>
          <div className="v">{aud(calc.nw - calc.cur, 0)}</div>
          <div className="s">{aud((calc.nw - calc.cur) * 12, 0)} a year</div>
        </div>
        <div className="kpi">
          <div className="l">Account management</div>
          <div className="v">{aud(ticketsCost, 0)}</div>
          <div className="s">Front tickets × CSR minutes — not billed today</div>
        </div>
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th className="r">Current rate</th>
              <th className="r">Cost (TDABC)</th>
              <th className="r">Margin</th>
              <th className="r">3-month avg volume</th>
              <th className="r">New rate</th>
              <th className="r">New margin</th>
              <th className="r">+ $ / month</th>
            </tr>
          </thead>
          <tbody>
            {calc.rows.map((r) => {
              const m = r.rate ? (r.rate - r.cost) / r.rate : null;
              const nm = r.newRate ? (r.newRate - r.cost) / r.newRate : null;
              const delta = r.newRate != null ? (r.newRate - (r.rate ?? 0)) * r.avg3 : 0;
              return (
                <tr key={r.code}>
                  <td className="sup">
                    {r.name}
                    <div className="meta mono">
                      {r.code} · per {r.unit}
                    </div>
                  </td>
                  <td className="r num">{aud(r.rate, 3)}</td>
                  <td className="r num">{aud(r.cost, 3)}</td>
                  <td className={"r num" + (m != null && m < 0 ? " delta-neg" : "")}>{pc(m)}</td>
                  <td className="r num">{Math.round(r.avg3).toLocaleString("en-AU")}</td>
                  <td className="r">
                    <input value={rates[r.code] ?? ""} onChange={(e) => setRates({ ...rates, [r.code]: e.target.value })} style={{ width: 80, textAlign: "right" }} className="ev-reason" inputMode="decimal" aria-label={`New rate for ${r.name}`} />
                  </td>
                  <td className={"r num" + (nm != null && nm < floor ? " delta-neg" : "")}>{pc(nm)}</td>
                  <td className={"r num" + (delta > 0 ? " delta-pos" : "")}>{delta ? aud(delta, 0) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn primary" disabled>
          Send schedule of rates to CLM
        </button>
        <span className="pill p-amber">Coming soon</span>
        <span className="meta">Will create an amendment draft in CLM (rates only — costs never leave FA). Nothing changes in Dyspatch, the WMS or Xero.</span>
      </div>
    </div>
  );
}
