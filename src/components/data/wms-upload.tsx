"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import "@/components/model/model.css";

type Mapping = Record<string, number | null>;
interface PlanResp {
  header: string[];
  mapping: Mapping;
  fields: Array<{ key: string; label: string; required: boolean }>;
  plan: {
    duplicateFile: boolean;
    rowsRead: number;
    errors: Array<{ line: number; message: string }>;
    dateFrom: string | null;
    dateTo: string | null;
    tenants: Array<{ tenant: string; rows: number; client: string | null }>;
    overlap: number;
    unmappedCodes: string[];
    lines: number;
    sample: Array<Record<string, unknown>>;
  };
  error?: string;
}

const au = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/** Upload a WMS export → map columns (remembered per system and file type) → preview → save. */
export function WmsUpload({ sources }: { sources: ReadonlyArray<readonly [string, string]> }) {
  const router = useRouter();
  const [source, setSource] = useState("THOMAX");
  const [kind, setKind] = useState<"CHARGES" | "ORDERS">("ORDERS");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [resp, setResp] = useState<PlanResp | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [onOverlap, setOnOverlap] = useState<"replace" | "keep">("replace");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const call = async (action: "plan" | "apply" | "suggest", m: Mapping | null) => {
    // "suggest" needs only the first rows; the rest of a big file isn't sent
    const text = action === "suggest" ? file!.text.split(/\r?\n/).slice(0, 6).join("\n") : file!.text;
    const res = await fetch("/api/wms/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, source, kind, text, fileName: file!.name, mapping: m, onOverlap }) });
    return res.json();
  };
  const plan = (m: Mapping | null) =>
    start(async () => {
      setMsg(null);
      const r = (await call("plan", m)) as PlanResp;
      if (r.error) setMsg({ ok: false, text: r.error });
      else {
        setResp(r);
        setMapping(r.mapping);
      }
    });
  const suggest = () =>
    start(async () => {
      setMsg(null);
      const r = (await call("suggest", null)) as { mapping?: Mapping; error?: string };
      if (r.error || !r.mapping) return setMsg({ ok: false, text: r.error ?? "Claude didn't suggest anything." });
      const m = r.mapping;
      const p2 = (await call("plan", m)) as PlanResp;
      if (p2.error) return setMsg({ ok: false, text: p2.error });
      setResp(p2);
      setMapping(p2.mapping);
      setMsg({ ok: true, text: "Claude's suggestion is filled in below (it saw only the column names and the shape of the values). Check each column and the preview before saving." });
    });
  const apply = () =>
    start(async () => {
      const r = await call("apply", mapping);
      if (r.error) setMsg({ ok: false, text: r.error });
      else {
        setMsg({ ok: true, text: `Saved: ${r.inserted.toLocaleString("en-AU")} ${kind === "ORDERS" ? "orders" : "day lines"} added${r.replaced ? `, ${r.replaced.toLocaleString("en-AU")} older rows replaced` : ""}${r.kept ? `, ${r.kept.toLocaleString("en-AU")} already there (kept)` : ""}.` });
        setResp(null);
        setFile(null);
        router.refresh();
      }
    });

  const p = resp?.plan;
  return (
    <div>
      <div className="addform">
        <label>
          WMS
          <select value={source} onChange={(e) => (setSource(e.target.value), setResp(null))}>
            {sources.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          File type
          <select value={kind} onChange={(e) => (setKind(e.target.value as "CHARGES" | "ORDERS"), setResp(null))}>
            <option value="ORDERS">Orders (order or order-line export)</option>
            <option value="CHARGES">Charges (billable activity by charge code)</option>
          </select>
        </label>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setResp(null);
              setMsg(null);
              setFile(f ? { name: f.name, text: await f.text() } : null);
            }}
          />
        </label>
        <button type="button" className="btn primary" disabled={!file || pending} onClick={() => plan(null)}>
          {pending && !resp ? "Reading…" : "Read file"}
        </button>
      </div>
      <p className="meta">Excel files: save as CSV first. Large history files are fine — split by year if the browser struggles.</p>

      {resp && mapping && p && (
        <div className="card" style={{ marginTop: 10 }}>
          <h2>Columns</h2>
          <p className="sub">Which column holds what. Remembered for the next {sources.find((s) => s[0] === source)?.[1]} {kind.toLowerCase()} file.</p>
          <div className="addform">
            {resp.fields.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.required ? " *" : ""}
                <select value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === "" ? null : Number(e.target.value) })}>
                  <option value="">—</option>
                  {resp.header.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `(column ${i + 1})`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button type="button" className="btn" disabled={pending} onClick={() => plan(mapping)}>
              Check again
            </button>
            <button type="button" className="btn" disabled={pending} onClick={suggest} title="Claude sees only the column names and the shape of a few values (digits and letters masked), never the data">
              Suggest with Claude
            </button>
          </div>

          <h2 style={{ marginTop: 16 }}>Preview</h2>
          {p.duplicateFile && <p className="callout amber">This exact file was already loaded — nothing to do.</p>}
          <dl className="fl">
            <dt>Rows read</dt>
            <dd>{p.rowsRead.toLocaleString("en-AU")}</dd>
            <dt>{kind === "ORDERS" ? "Orders" : "Day lines (summed)"}</dt>
            <dd>{p.lines.toLocaleString("en-AU")}</dd>
            <dt>Dates</dt>
            <dd>
              {au(p.dateFrom)} – {au(p.dateTo)}
            </dd>
            <dt>Tenants</dt>
            <dd>
              {p.tenants.slice(0, 12).map((t) => (
                <span key={t.tenant} className="chip" style={{ marginRight: 6 }}>
                  {t.tenant} · {t.rows.toLocaleString("en-AU")} {t.client ? `· ${t.client}` : <span className="msg-err">· no client has this ID</span>}
                </span>
              ))}
              {p.tenants.length > 12 && <span className="meta"> and {p.tenants.length - 12} more</span>}
            </dd>
            {p.unmappedCodes.length > 0 && (
              <>
                <dt>Charge codes not mapped yet</dt>
                <dd className="small">
                  {p.unmappedCodes.slice(0, 20).join(", ")}
                  {p.unmappedCodes.length > 20 ? ` and ${p.unmappedCodes.length - 20} more` : ""} — saved anyway; map them in Settings → Cost pools & mapping
                </dd>
              </>
            )}
          </dl>
          {p.errors.length > 0 && (
            <div className="callout amber" style={{ marginTop: 10 }}>
              <strong>{p.errors.length >= 200 ? "200+" : p.errors.length} rows need fixing — nothing is saved until they are.</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {p.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    Row {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.overlap > 0 && (
            <div className="row" style={{ marginTop: 10 }}>
              <span className="small">
                <strong>{p.overlap.toLocaleString("en-AU")}</strong> rows already exist for these tenants and dates.
              </span>
              <label className="small">
                <input type="radio" checked={onOverlap === "replace"} onChange={() => setOnOverlap("replace")} /> This file replaces them
              </label>
              <label className="small">
                <input type="radio" checked={onOverlap === "keep"} onChange={() => setOnOverlap("keep")} /> Keep the existing rows, add only new ones
              </label>
            </div>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn primary" disabled={pending || p.duplicateFile || p.errors.length > 0 || !p.lines} onClick={apply}>
              {pending ? "Saving…" : `Save ${p.lines.toLocaleString("en-AU")} ${kind === "ORDERS" ? "orders" : "lines"}`}
            </button>
            <button type="button" className="btn" onClick={() => (setResp(null), setFile(null))}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <p className={msg.ok ? "msg-ok" : "msg-err"} style={{ fontSize: 13 }}>{msg.text}</p>}
    </div>
  );
}
