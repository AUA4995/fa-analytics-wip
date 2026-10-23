"use client";

import { useState, type ReactNode } from "react";

/** Shared bits for the sign-in pages (same look as the original login form). */

export const authInput =
  "w-full rounded border border-border bg-card px-3 py-2 text-sm text-fa-charcoal outline-none focus:border-fa-blue focus:ring-2 focus:ring-fa-blue-light";
export const authButton = "w-full rounded bg-fa-solid px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60";
export const authButtonPlain = "w-full rounded border border-border bg-card px-4 py-2 text-sm font-medium text-fa-charcoal hover:bg-surface disabled:opacity-60";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-fa-grey-dark">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded bg-red-50 p-2 text-sm text-red-800" role="alert">
      {children}
    </p>
  );
}

export function FormNotice({ tone = "green", children }: { tone?: "green" | "amber" | "blue"; children: ReactNode }) {
  const cls = tone === "green" ? "bg-green-50 text-green-800" : tone === "amber" ? "bg-amber-50 text-amber-900" : "bg-blue-50 text-fa-charcoal";
  return (
    <div className={"rounded p-3 text-sm " + cls} role="status">
      {children}
    </div>
  );
}

/** 6-digit code (or backup code) input — numeric keypad on phones, one-time-code autofill. */
export function CodeInput({ allowBackup = false, autoFocus = true }: { allowBackup?: boolean; autoFocus?: boolean }) {
  return (
    <input
      name="code"
      required
      autoFocus={autoFocus}
      autoComplete="one-time-code"
      inputMode={allowBackup ? "text" : "numeric"}
      pattern={allowBackup ? undefined : "[0-9 ]{6,7}"}
      maxLength={allowBackup ? 12 : 7}
      placeholder={allowBackup ? "123456 or backup code" : "123456"}
      className={authInput + " font-mono tracking-widest"}
      aria-label={allowBackup ? "6-digit code or backup code" : "6-digit code"}
    />
  );
}

export function RememberDevice() {
  return (
    <label className="flex items-start gap-2 text-sm text-fa-grey-dark">
      <input type="checkbox" name="remember" className="mt-0.5" />
      <span>Don&apos;t ask again on this device for 8 hours</span>
    </label>
  );
}

/** Shows text with a Copy button (backup codes, one-time links). */
export function CopyBox({ text, label = "Copy", mono = true }: { text: string; label?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-start gap-2">
      <code className={"min-w-0 flex-1 break-all rounded border border-border bg-card px-2 py-1.5 text-sm text-fa-charcoal " + (mono ? "font-mono" : "")}>{text}</code>
      <button
        type="button"
        className="rounded border border-border bg-card px-3 py-1.5 text-sm text-fa-charcoal hover:bg-surface"
        onClick={async () => {
          try {
            await navigator.clipboard?.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : label}
      </button>
    </div>
  );
}

/** The 10 backup codes in two columns + Copy all. */
export function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <ol className="grid grid-cols-2 gap-x-6 gap-y-1 rounded border border-border bg-surface p-3 font-mono text-sm text-fa-charcoal" aria-label="Backup codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <button
        type="button"
        className={authButtonPlain}
        onClick={async () => {
          try {
            await navigator.clipboard?.writeText(codes.join("\n"));
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied — paste them somewhere safe" : "Copy all codes"}
      </button>
    </div>
  );
}
