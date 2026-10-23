"use client";

import { useActionState } from "react";
import { authButton, authButtonPlain, BackupCodes, CodeInput, CopyBox, FormError, FormNotice, RememberDevice } from "@/components/auth/fields";
import { cancelLogin, confirmTwoFactorSetup, finishTwoFactorSetup, verifyLoginCode, type CodeFormState } from "./two-factor-actions";

export function VerifyCodeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifyLoginCode, {} as CodeFormState);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fa-grey-dark">6-digit code</span>
          <CodeInput allowBackup />
          <span className="mt-1 block text-xs text-muted">From your authenticator app. Lost your phone? Enter one of your backup codes instead.</span>
        </label>
        <RememberDevice />
        <FormError>{state.error}</FormError>
        <button type="submit" disabled={pending} className={authButton}>
          {pending ? "Checking…" : "Sign in"}
        </button>
      </form>
      <form action={cancelLogin}>
        <button type="submit" className="text-xs text-fa-blue hover:underline">
          Use a different account
        </button>
      </form>
    </div>
  );
}

/**
 * Set-up: scan the QR code (or type the key), confirm with a code, then the 10 backup codes are shown once.
 * `done` = set-up confirmed on this session but not finished (e.g. the page was reloaded after the codes were shown).
 */
export function SetupTwoFactorForm({ next, qrPath, qrDim, secretGrouped, uri, done }: { next: string; qrPath: string; qrDim: number; secretGrouped: string; uri: string; done: boolean }) {
  const [state, action, pending] = useActionState(confirmTwoFactorSetup, {} as CodeFormState);
  if (state.codes) {
    return (
      <div className="space-y-4">
        <FormNotice>Two-step sign-in is on.</FormNotice>
        <div className="text-sm text-fa-grey-dark">
          <p className="mb-2 font-medium">Your 10 backup codes</p>
          <p className="mb-3 text-muted">
            Each code works once, if you can&apos;t use your phone. Copy them into a password manager or print them now — they won&apos;t be shown
            again. You can make a new set in Settings → Account.
          </p>
          <BackupCodes codes={state.codes} />
        </div>
        <form action={finishTwoFactorSetup}>
          <input type="hidden" name="next" value={state.next ?? next} />
          <button type="submit" className={authButton}>
            I&apos;ve saved them — continue
          </button>
        </form>
      </div>
    );
  }
  if (done) {
    return (
      <div className="space-y-4">
        <FormNotice>Two-step sign-in is set up for this account.</FormNotice>
        <form action={finishTwoFactorSetup}>
          <input type="hidden" name="next" value={next} />
          <button type="submit" className={authButton}>
            Continue
          </button>
        </form>
      </div>
    );
  }
  return (
    <div className="space-y-5 text-sm">
      <ol className="list-decimal space-y-4 pl-5 text-fa-grey-dark">
        <li>
          Install <strong>Microsoft Authenticator</strong> or <strong>Google Authenticator</strong> on your phone (free).
        </li>
        <li>
          In the app, add an account and scan this QR code.
          <div className="mt-3 flex justify-center sm:justify-start">
            <svg viewBox={`0 0 ${qrDim} ${qrDim}`} width={200} height={200} role="img" aria-label="QR code for your authenticator app" shapeRendering="crispEdges" className="rounded border border-border">
              <rect width="100%" height="100%" fill="#fff" />
              <path d={qrPath} fill="#000" />
            </svg>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-fa-blue">Can&apos;t scan? Type the key instead</summary>
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted">Choose “Enter a setup key” (time-based) and type:</p>
              <CopyBox text={secretGrouped} label="Copy key" />
              <p className="text-xs text-muted">Or open this link on the phone that has the app:</p>
              <CopyBox text={uri} label="Copy link" />
            </div>
          </details>
        </li>
        <li>Enter the 6-digit code the app shows for FA Analytics.</li>
      </ol>
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <CodeInput />
        <RememberDevice />
        <FormError>{state.error}</FormError>
        <button type="submit" disabled={pending} className={authButton}>
          {pending ? "Checking…" : "Turn on two-step sign-in"}
        </button>
      </form>
      <form action={cancelLogin}>
        <button type="submit" className={authButtonPlain}>
          Cancel and sign out
        </button>
      </form>
    </div>
  );
}
