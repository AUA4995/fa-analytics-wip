"use client";

import { useActionState } from "react";
import { login, setupFirstAdmin, type AuthFormState } from "./actions";

const input =
  "w-full rounded border border-border bg-card px-3 py-2 text-sm text-fa-charcoal outline-none focus:border-fa-blue focus:ring-2 focus:ring-fa-blue-light";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, {} as AuthFormState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fa-grey-dark">Email</span>
        <input name="email" type="email" autoComplete="username" required autoFocus defaultValue={state.email} key={`e-${state.email ?? ""}`} className={input} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 flex items-baseline justify-between font-medium text-fa-grey-dark">
          Password
          <a href="/forgot-password" className="text-xs font-normal">
            Forgot password?
          </a>
        </span>
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      {state.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded bg-fa-solid px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupFirstAdmin, {} as AuthFormState);
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fa-grey-dark">Your name</span>
        <input name="name" required autoFocus defaultValue={state.name} key={`n-${state.name ?? ""}`} className={input} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fa-grey-dark">Email</span>
        <input name="email" type="email" autoComplete="username" required defaultValue={state.email} key={`e-${state.email ?? ""}`} className={input} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fa-grey-dark">Password (10+ characters)</span>
        <input name="password" type="password" autoComplete="new-password" minLength={10} required className={input} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fa-grey-dark">Confirm password</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={10} required className={input} />
      </label>
      {state.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded bg-fa-solid px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60">
        {pending ? "Creating…" : "Create owner account"}
      </button>
    </form>
  );
}
