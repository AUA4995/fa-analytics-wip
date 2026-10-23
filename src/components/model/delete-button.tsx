"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deleteRecord } from "@/app/settings/model-actions";
import { withPanel } from "@/components/ui/panel";

export function DeleteButton({ entity, id, label }: { entity: "xeromap" | "wmsmap" | "service" | "supplier"; id: string; label: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <span className="row" style={{ display: "inline-flex" }}>
      <button
        type="button"
        className="btn danger"
        disabled={pending}
        onClick={() =>
          confirm(`${label}? The old values stay in the logs.`) &&
          start(async () => {
            const r = await deleteRecord(entity, id);
            if (!r.ok) setMsg(r.message);
            else if (sp.get("panel")) router.replace(withPanel(pathname, sp, null), { scroll: false });
          })
        }
      >
        {label}
      </button>
      {msg && <span className="msg-err">{msg}</span>}
    </span>
  );
}
