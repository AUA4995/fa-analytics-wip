"use client";

import { useState, useTransition } from "react";
import { disconnectXero, testXero, type XeroActionState } from "./xero-actions";

export interface XeroCardProps {
  configured: boolean;
  connected: boolean;
  tenantName?: string;
  lastSyncAt?: string | null;
  flash?: { kind: "connected" | "error"; message: string } | null;
  /** Connect / reconnect / disconnect are owner-only (the server enforces it too) */
  canConnect: boolean;
  ownerName: string;
  /** Connected before newer read-only permissions (reports, payroll) were added — reconnect once */
  missingScopes: string[];
  status: { state: "connected" | "disconnected" | "error"; headline: string; detail?: string };
}

const btn = "btn primary";
const btn2 = "btn";

export function XeroCard(props: XeroCardProps) {
  const [state, setState] = useState<XeroActionState | null>(props.flash ? { ok: props.flash.kind === "connected", message: props.flash.message } : null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<XeroActionState>) => start(async () => setState(await fn()));

  return (
    <div className="space-y-4 text-sm">
      <div className="row">
        <span className={"pill " + (props.status.state === "connected" ? "p-green" : props.status.state === "error" ? "p-red" : "p-grey")}>
          {props.status.state === "connected" ? "Connected" : props.status.state === "error" ? "Problem" : "Not connected"}
        </span>
        {props.connected && <strong>{props.tenantName}</strong>}
        <span className="meta">Last read: {props.lastSyncAt ? new Date(props.lastSyncAt).toLocaleString("en-AU") : "never"}</span>
      </div>
      <p className={props.status.state === "error" ? "msg-err" : "meta"} style={{ margin: 0 }}>
        {props.status.headline}
      </p>
      <p className="meta" style={{ margin: 0 }}>
        Read-only: invoices, bills, contacts, chart of accounts, bank, reports (P&amp;L, balance sheet, aged, BAS) and AU Payroll. This app never writes to Xero.
      </p>
      {props.connected && props.missingScopes.length > 0 && (
        <p className="callout amber" style={{ margin: 0 }}>
          {props.canConnect ? "Reconnect Xero once" : `Ask ${props.ownerName} to reconnect Xero once`} to add these read-only permissions: {props.missingScopes.join(", ")}.
        </p>
      )}
      {!props.configured && props.canConnect && (
        <p className="callout amber" style={{ margin: 0 }}>
          Add <code className="mono">XERO_CLIENT_ID</code>, <code className="mono">XERO_CLIENT_SECRET</code> and <code className="mono">TOKEN_ENCRYPTION_KEY</code> to{" "}
          <code className="mono">.env</code>, then restart the app.
        </p>
      )}
      <div className="row">
        {!props.connected ? (
          props.canConnect && (
            <a href="/api/xero/connect" aria-disabled={!props.configured} className={btn} style={props.configured ? undefined : { pointerEvents: "none", opacity: 0.5 }}>
              Connect Xero (read-only)
            </a>
          )
        ) : (
          <>
            <button type="button" onClick={() => run(testXero)} disabled={pending} className={btn}>
              {pending ? "Checking…" : "Test connection"}
            </button>
            {props.canConnect && (
              <>
                <a href="/api/xero/connect" className={btn2}>
                  Reconnect
                </a>
                <button
                  type="button"
                  onClick={() => confirm("Disconnect Xero? Data already read is kept.") && run(disconnectXero)}
                  disabled={pending}
                  className="btn danger"
                >
                  Disconnect
                </button>
              </>
            )}
          </>
        )}
      </div>
      {state && <p className={state.ok ? "msg-ok" : "msg-err"}>{state.message}</p>}
    </div>
  );
}
