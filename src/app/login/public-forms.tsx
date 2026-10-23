"use client";

import { useActionState } from "react";
import { authButton, authInput, Field, FormError, FormNotice } from "@/components/auth/fields";
import { forgotPassword, requestAccess, setNewPassword, type PublicFormState } from "./public-actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPassword, {} as PublicFormState);
  if (state.ok) return <FormNotice>{state.message}</FormNotice>;
  return (
    <form action={action} className="space-y-4">
      <Field label="Email">
        <input name="email" type="email" autoComplete="username" required autoFocus defaultValue={state.values?.email} key={state.values?.email ?? ""} className={authInput} />
      </Field>
      <FormError>{state.error}</FormError>
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}

export function NewPasswordForm({ token, kind, submitLabel }: { token: string; kind: "invite" | "reset"; submitLabel: string }) {
  const [state, action, pending] = useActionState(setNewPassword, {} as PublicFormState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="kind" value={kind} />
      <Field label="New password" hint="At least 10 characters. A short sentence is easy to remember.">
        <input name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus className={authInput} />
      </Field>
      <Field label="Confirm new password">
        <input name="confirm" type="password" autoComplete="new-password" minLength={10} required className={authInput} />
      </Field>
      <FormError>{state.error}</FormError>
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export function RequestAccessForm({ domain }: { domain: string }) {
  const [state, action, pending] = useActionState(requestAccess, {} as PublicFormState);
  if (state.ok) return <FormNotice>{state.message}</FormNotice>;
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-4">
      <Field label="Your name">
        <input name="name" required autoFocus autoComplete="name" maxLength={80} defaultValue={v.name} key={`n-${v.name ?? ""}`} className={authInput} />
      </Field>
      <Field label="Work email" hint={`Only @${domain} addresses.`}>
        <input name="email" type="email" required autoComplete="email" placeholder={`you@${domain}`} defaultValue={v.email} key={`e-${v.email ?? ""}`} className={authInput} />
      </Field>
      <Field label="Why do you need access?">
        <textarea name="reason" required maxLength={500} rows={3} defaultValue={v.reason} key={`r-${v.reason ?? ""}`} className={authInput} placeholder="e.g. I need the cost and KPI reports" />
      </Field>
      {/* Bots fill every field; people never see this one. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <FormError>{state.error}</FormError>
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Sending…" : "Request access"}
      </button>
    </form>
  );
}
