"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { addRecipientAction, removeRecipientAction, saveDomainsAction, type ContactState } from "@/app/settings/contacts-actions";
import "./model.css";

const Msg = ({ s }: { s: ContactState | null }) => (s ? <span className={s.ok ? "msg-ok" : "msg-err"}>{s.message}</span> : null);

export function DomainsEditor({ initial }: { initial: string[] }) {
  const [v, setV] = useState(initial.join(", "));
  const [s, set] = useState<ContactState | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="addform">
      <input value={v} onChange={(e) => setV(e.target.value)} style={{ width: 360 }} aria-label="Internal domains" />
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => set(await saveDomainsAction(v)))}>
        Save
      </button>
      <Msg s={s} />
    </div>
  );
}

export function AddRecipient({ list, clients, preset }: { list: "INTERNAL" | "CLIENT" | "LENDER"; clients?: Array<[string, string]>; preset?: { name: string; email: string; clientId: string } }) {
  const [s, action, pending] = useActionState(addRecipientAction, null);
  if (preset)
    return (
      <form action={action} className="row">
        <input type="hidden" name="list" value="CLIENT" />
        <input type="hidden" name="name" value={preset.name} />
        <input type="hidden" name="email" value={preset.email} />
        <input type="hidden" name="clientId" value={preset.clientId} />
        <button type="submit" className="btn" disabled={pending || !!s?.ok}>
          {s?.ok ? "Added" : "Add as client contact"}
        </button>
        {s && !s.ok && <Msg s={s} />}
      </form>
    );
  return (
    <form action={action} className="addform">
      <input type="hidden" name="list" value={list} />
      <label>
        Name
        <input name="name" />
      </label>
      <label>
        Email
        <input name="email" type="email" style={{ width: 230 }} />
      </label>
      {list === "CLIENT" && (
        <label>
          Client
          <select name="clientId">
            {clients?.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      {list === "LENDER" && (
        <label>
          Role
          <select name="role">
            <option>Bank</option>
            <option>Accountant</option>
            <option>Auditor</option>
            <option>Broker</option>
            <option>Other</option>
          </select>
        </label>
      )}
      <button type="submit" className="btn primary" disabled={pending}>
        Add
      </button>
      <Msg s={s} />
    </form>
  );
}

export function RemoveRecipient({ id, email }: { id: string; email: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" className="lnk" style={{ color: "var(--red)" }} disabled={pending} onClick={() => confirm(`Remove ${email}? It's also taken off any saved report.`) && start(async () => (await removeRecipientAction(id), router.refresh()))}>
      Remove
    </button>
  );
}
