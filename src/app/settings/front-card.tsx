"use client";

import { useActionState, useState, useTransition } from "react";
import { loadFrontChannels, setFrontSendChannel, type FrontActionState } from "./front-actions";

export function FrontCard({
  configured,
  isOwner,
  ownerName,
  channelId,
  channels,
}: {
  configured: boolean;
  isOwner: boolean;
  ownerName: string;
  channelId: string | null;
  channels: Array<{ id: string; name: string; address: string }>;
}) {
  const [msg, setMsg] = useState<FrontActionState | null>(null);
  const [pending, start] = useTransition();
  const [saved, save, saving] = useActionState(setFrontSendChannel, null);
  return (
    <div className="space-y-4 text-sm">
      <div className="row">
        <span className={"pill " + (configured ? "p-green" : "p-grey")}>{configured ? "Token set" : "Not connected"}</span>
        <span className="meta">Used to send sign-in emails now, and report emails later. Front is otherwise read-only for this app.</span>
      </div>
      {!configured && <p className="callout amber" style={{ margin: 0 }}>Add <code className="mono">FRONT_API_TOKEN</code> to <code className="mono">.env</code>, then restart the app.</p>}
      {configured && isOwner && (
        <form action={save} className="row">
          <label className="small" htmlFor="ch">
            Send from
          </label>
          <select id="ch" name="channelId" defaultValue={channelId ?? ""}>
            <option value="">— pick a channel —</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.address}
              </option>
            ))}
          </select>
          <button type="submit" className="btn primary" disabled={saving}>
            Save
          </button>
          <button type="button" className="btn" disabled={pending} onClick={() => start(async () => setMsg(await loadFrontChannels()))}>
            {pending ? "Loading…" : "Load channels"}
          </button>
        </form>
      )}
      {configured && !isOwner && <p className="meta">Only {ownerName} (owner) picks the send channel.</p>}
      {msg && <p className={msg.ok ? "msg-ok" : "msg-err"}>{msg.message}</p>}
      {saved && <p className={saved.ok ? "msg-ok" : "msg-err"}>{saved.message}</p>}
    </div>
  );
}
