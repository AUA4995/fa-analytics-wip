"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createReviewAction, updateReviewAction } from "@/app/rates/actions";
import { TYPES } from "@/lib/rates/review";
import "@/components/model/model.css";

export function ReviewEditor({ id, stage, owner, due, note, stages, people }: { id: string; stage: number; owner: string; due: string; note: string; stages: string[]; people: string[] }) {
  const [v, setV] = useState({ stage, owner, due, note });
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = (extra: { closed?: boolean } = {}) =>
    start(async () => {
      const r = await updateReviewAction(id, { stage: v.stage, owner: v.owner, due: v.due || null, note: v.note, ...extra });
      setMsg(r);
      router.refresh();
    });
  return (
    <div className="addform" style={{ marginTop: 6 }}>
      <label>
        Stage
        <select value={v.stage} onChange={(e) => setV({ ...v, stage: Number(e.target.value) })}>
          {stages.map((s, k) => (
            <option key={s} value={k}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label>
        Owner
        <select value={v.owner} onChange={(e) => setV({ ...v, owner: e.target.value })}>
          <option value="">—</option>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label>
        Due
        <input type="date" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} />
      </label>
      <label style={{ flex: "1 1 100%" }}>
        Note
        <input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </label>
      <button type="button" className="btn primary" disabled={pending} onClick={() => save()}>
        Save
      </button>
      <button type="button" className="btn" disabled={pending} onClick={() => confirm("Close this review?") && save({ closed: true })}>
        Close review
      </button>
      {msg && <span className={msg.ok ? "msg-ok" : "msg-err"}>{msg.message}</span>}
    </div>
  );
}

export function NewReview({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ clientId: clients[0]?.id ?? "", type: "RENEWAL", due: "" });
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open)
    return (
      <button type="button" className="btn primary" onClick={() => setOpen(true)} disabled={!clients.length}>
        + Start a review
      </button>
    );
  return (
    <div className="addform">
      <select value={v.clientId} onChange={(e) => setV({ ...v, clientId: e.target.value })} aria-label="Client">
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} aria-label="Type">
        {Object.entries(TYPES).map(([k, [l]]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <input type="date" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} aria-label="Due" />
      <button
        type="button"
        className="btn primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createReviewAction(v.clientId, v.type as "CPI" | "CARRIER" | "RENEWAL" | "ADHOC", v.due || null, null);
            setMsg(r);
            if (r.ok) {
              setOpen(false);
              router.refresh();
            }
          })
        }
      >
        Start
      </button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {msg && !msg.ok && <span className="msg-err">{msg.message}</span>}
    </div>
  );
}
