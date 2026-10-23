"use client";

import { useState, useTransition } from "react";
import { deleteImportAction, recountFrontAction, syncXeroAction, type DataActionState } from "@/app/data/actions";

function useRun() {
  const [msg, setMsg] = useState<DataActionState | null>(null);
  const [pending, start] = useTransition();
  return { msg, pending, run: (fn: () => Promise<DataActionState>) => start(async () => setMsg(await fn())) };
}

export function XeroSyncButtons({ connected }: { connected: boolean }) {
  const { msg, pending, run } = useRun();
  return (
    <span className="row" style={{ display: "inline-flex" }}>
      <button type="button" className="btn primary" disabled={!connected || pending} onClick={() => run(() => syncXeroAction("INCREMENTAL"))}>
        Sync now
      </button>
      <button type="button" className="btn" disabled={!connected || pending} onClick={() => confirm("Re-read everything from Xero (sales since 2021, 24 months of P&L, payroll)? It runs in the background.") && run(() => syncXeroAction("FULL"))}>
        Full re-read
      </button>
      {msg && <span className={msg.ok ? "msg-ok" : "msg-err"}>{msg.message}</span>}
    </span>
  );
}

export function FrontRecountButton({ configured }: { configured: boolean }) {
  const { msg, pending, run } = useRun();
  return (
    <span className="row" style={{ display: "inline-flex" }}>
      <button type="button" className="btn primary" disabled={!configured || pending} onClick={() => run(() => recountFrontAction(2))}>
        Recount now
      </button>
      <button type="button" className="btn" disabled={!configured || pending} onClick={() => run(() => recountFrontAction(24))}>
        Count 24 months
      </button>
      {msg && <span className={msg.ok ? "msg-ok" : "msg-err"}>{msg.message}</span>}
    </span>
  );
}

export function DeleteImportButton({ id, name }: { id: string; name: string }) {
  const { msg, pending, run } = useRun();
  return (
    <>
      <button type="button" className="lnk" style={{ color: "var(--red)" }} disabled={pending} onClick={() => confirm(`Remove ${name} and every row it loaded?`) && run(() => deleteImportAction(id))}>
        remove
      </button>
      {msg && !msg.ok && <span className="msg-err">{msg.message}</span>}
    </>
  );
}
