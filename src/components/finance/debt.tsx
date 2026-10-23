"use client";

import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { addDebtAction, deleteDebtAction } from "@/app/finance/actions";
import "@/components/model/model.css";

export function AddDebt() {
  const [s, action, pending] = useActionState(addDebtAction, null);
  return (
    <form action={action} className="addform">
      <label>
        Facility
        <input name="name" placeholder="e.g. Equipment loan (CMC)" />
      </label>
      <label>
        Lender
        <input name="lender" style={{ width: 120 }} />
      </label>
      <label>
        Limit $
        <input name="limit" style={{ width: 100 }} />
      </label>
      <label>
        Balance $
        <input name="balance" style={{ width: 100 }} />
      </label>
      <label>
        Rate %
        <input name="rate" style={{ width: 60 }} />
      </label>
      <label>
        Principal / month $
        <input name="principalMonthly" style={{ width: 100 }} />
      </label>
      <label>
        Ends
        <input name="endDate" type="date" />
      </label>
      <label>
        Security
        <input name="security" style={{ width: 160 }} />
      </label>
      <button type="submit" className="btn primary" disabled={pending}>
        Add
      </button>
      {s && <span className={s.ok ? "msg-ok" : "msg-err"}>{s.message}</span>}
    </form>
  );
}

export function DeleteDebt({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" className="lnk" style={{ color: "var(--red)" }} disabled={pending} onClick={() => confirm(`Remove ${name}?`) && start(async () => (await deleteDebtAction(id), router.refresh()))}>
      Remove
    </button>
  );
}
