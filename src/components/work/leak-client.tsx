"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importLeakLogAction } from "@/app/leakage/actions";
import { createReviewAction, decideRateAction, uploadRatesAction } from "@/app/rates/actions";
import "@/components/model/model.css";

type S = { ok: boolean; message: string } | null;
const Msg = ({ s }: { s: S }) => (s ? <span className={s.ok ? "msg-ok" : "msg-err"}>{s.message}</span> : null);

export function LeakLogImport() {
  const [text, setText] = useState("");
  const [s, set] = useState<S>(null);
  const [pending, start] = useTransition();
  return (
    <div className="csv-box">
      <input type="file" accept=".csv,text/csv" onChange={async (e) => setText((await e.target.files?.[0]?.text()) ?? "")} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="date found,client,service,type,amount,status,recovered amount,invoice,recovered date,cause,owner" />
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn primary" disabled={pending || !text.trim()} onClick={() => start(async () => set(await importLeakLogAction(text)))}>
          Import
        </button>
        <Msg s={s} />
      </div>
    </div>
  );
}

export function RateUpload() {
  const [source, setSource] = useState<"DYSPATCH" | "WMS">("DYSPATCH");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [s, set] = useState<S>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="addform">
      <label>
        Export from
        <select value={source} onChange={(e) => setSource(e.target.value as "DYSPATCH" | "WMS")}>
          <option value="DYSPATCH">Dyspatch</option>
          <option value="WMS">WMS</option>
        </select>
      </label>
      <label>
        CSV (tenant / customer ID, charge code, rate)
        <input type="file" accept=".csv,text/csv" onChange={async (e) => {
          const f = e.target.files?.[0];
          setFile(f ? { name: f.name, text: await f.text() } : null);
        }} />
      </label>
      <button type="button" className="btn primary" disabled={pending || !file} onClick={() => start(async () => {
        const r = await uploadRatesAction(source, file!.text, file!.name);
        set(r);
        if (r.ok) router.refresh();
      })}>
        Load rates
      </button>
      <Msg s={s} />
    </div>
  );
}

export function RateDecide({ clientId, serviceCode, options }: { clientId: string; serviceCode: string; options: Array<[string, number]> }) {
  const [s, set] = useState<S>(null);
  const [pending, start] = useTransition();
  const name = (k: string) => (k === "CLM" ? "CLM" : k === "DYSPATCH" ? "Dyspatch" : "WMS");
  if (s?.ok) return <Msg s={s} />;
  return (
    <span className="row" style={{ display: "inline-flex" }}>
      <span className="small">Right one:</span>
      {options.map(([k, v]) => (
        <button key={k} type="button" className="btn" disabled={pending} onClick={() => confirm(`${name(k)} ($${v}) is right? Tasks are created to fix the others by hand.`) && start(async () => set(await decideRateAction(clientId, serviceCode, k as "CLM" | "DYSPATCH" | "WMS", v)))}>
          {name(k)}
        </button>
      ))}
      <Msg s={s} />
    </span>
  );
}

export function StartReview({ clientId }: { clientId: string }) {
  const [s, set] = useState<S>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (s?.ok) return <Msg s={s} />;
  return (
    <button type="button" className="lnk" disabled={pending} onClick={() => start(async () => {
      const r = await createReviewAction(clientId, "ADHOC", null, "Started from Under-pricing");
      set(r);
      if (r.ok && r.id) router.push(`/rates?section=workbench&client=${clientId}&review=${r.id}`);
    })}>
      Rate review
    </button>
  );
}
