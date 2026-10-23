"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { createKeyAction, revokeKeyAction } from "@/app/apis/actions";
import { SCOPES } from "@/lib/apikeys/scopes";
import "@/components/model/model.css";

export function NewKeyForm() {
  const [s, action, pending] = useActionState(createKeyAction, null);
  const [copied, setCopied] = useState(false);
  return (
    <form action={action}>
      <div className="addform">
        <label>
          App / who it&apos;s for
          <input name="name" placeholder="e.g. CLM, Accounts Hub, Marcus app" style={{ width: 240 }} />
        </label>
        <label>
          Expires
          <select name="days" defaultValue="365">
            <option value="90">in 90 days</option>
            <option value="365">in 1 year</option>
            <option value="0">never</option>
          </select>
        </label>
      </div>
      <div className="scopes">
        {SCOPES.map((sc) => (
          <label key={sc.key} className="scope">
            <input type="checkbox" name="scopes" value={sc.key} />
            <span>
              <strong>{sc.label}</strong> <code>{sc.key}</code>
              {sc.write && <span className="pill p-amber"> write</span>}
              {sc.internal && <span className="pill p-red"> internal</span>}
              <br />
              <span className="meta small">{sc.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button type="submit" className="btn primary" disabled={pending}>
          Create key
        </button>
        {s && !s.key && <span className={s.ok ? "msg-ok" : "msg-err"}>{s.message}</span>}
      </div>
      {s?.key && (
        <div className="callout" style={{ marginTop: 10 }}>
          <strong>{s.message}</strong>
          <div className="row" style={{ marginTop: 6 }}>
            <code className="keyshow">{s.key}</code>
            <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(s.key!).then(() => setCopied(true))}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="meta small">Give it to the app&apos;s owner through a password manager or in person — not by email or chat. Only its first characters are kept here.</p>
        </div>
      )}
    </form>
  );
}

export function RevokeKey({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" className="lnk" style={{ color: "var(--red)" }} disabled={pending} onClick={() => confirm(`Revoke the key for ${name}? The app stops working with it immediately.`) && start(async () => (await revokeKeyAction(id), router.refresh()))}>
      Revoke
    </button>
  );
}
