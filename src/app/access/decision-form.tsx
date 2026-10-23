"use client";

import { useActionState, useState } from "react";
import { authButton, CodeInput, CopyBox, FormError, FormNotice } from "@/components/auth/fields";
import { decideAccessWithLink, type AccessDecisionState } from "./actions";

/** Phone-friendly: code, then role (approve only), then Confirm. */
export function AccessDecisionForm({ token, decision, firstName }: { token: string; decision: "approve" | "decline"; firstName: string }) {
  const [state, action, pending] = useActionState(decideAccessWithLink, {} as AccessDecisionState);
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  if (state.ok) {
    return (
      <div className="space-y-3">
        <FormNotice>{state.message}</FormNotice>
        {state.link && (
          <div className="space-y-2 rounded bg-amber-50 p-3 text-sm text-amber-900">
            <p>
              The invitation email wasn&apos;t sent. Copy this link and send it to {firstName} yourself — it&apos;s shown only once and works for 7 days.
            </p>
            <CopyBox text={state.link} label="Copy link" />
          </div>
        )}
        <p className="text-sm text-muted">You can close this page.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="decision" value={decision} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fa-grey-dark">{decision === "approve" ? "1. Your two-step sign-in code" : "Your two-step sign-in code"}</span>
        <CodeInput allowBackup />
      </label>
      {decision === "approve" && (
        <fieldset className="text-sm">
          <legend className="mb-2 font-medium text-fa-grey-dark">2. Role</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["USER", "User", "Works every screen"],
                ["ADMIN", "Admin", "Also users and settings"],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className={"cursor-pointer rounded border p-3 " + (role === value ? "border-fa-blue bg-blue-50" : "border-border bg-card")}>
                <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="mr-2" />
                <span className="font-medium">{label}</span>
                <span className="mt-1 block text-xs text-muted">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <FormError>{state.error}</FormError>
      <button type="submit" disabled={pending} className={decision === "approve" ? authButton : authButton.replace("bg-fa-solid", "bg-red-600")}>
        {pending ? "Checking…" : decision === "approve" ? `Confirm — approve ${firstName}` : `Confirm — decline ${firstName}`}
      </button>
    </form>
  );
}
