"use client";

import { useState, useTransition } from "react";
import { setPackagingMode } from "@/app/cost/packaging-actions";
import { Pill } from "@/components/ui/pill";

/** Average / Precise packaging cost (batch 3). Precise needs Logiwa pack scans — until then it shows a note. */
export function PackagingToggle({ mode, admin }: { mode: "AVERAGE" | "PRECISE"; admin: boolean }) {
  const [m, setM] = useState(mode);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pick = (v: "AVERAGE" | "PRECISE") =>
    start(async () => {
      const r = await setPackagingMode(v);
      if (r.ok) setM(v);
      setMsg(r.message);
    });
  return (
    <div className="row" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <span className="seg" role="group" aria-label="Packaging cost method">
        <button type="button" className="segb" aria-pressed={m === "AVERAGE"} disabled={!admin || pending} onClick={() => pick("AVERAGE")}>
          Average per order
        </button>
        <button type="button" className="segb" aria-pressed={m === "PRECISE"} disabled={!admin || pending} onClick={() => pick("PRECISE")}>
          Precise (actual usage)
        </button>
      </span>
      {m === "PRECISE" && <Pill tone="amber">Awaiting Logiwa integration — average used until then</Pill>}
      {msg && <span className="meta">{msg}</span>}
    </div>
  );
}
