"use client";

import { useEffect, useRef, useState } from "react";
import { touchSessionAction } from "@/app/session-actions";

/**
 * Inactivity: the server locks the session after `idleMinutes` without a request. Typing or clicking on a page
 * doesn't reach the server by itself, so real interaction is reported every few minutes; 2 minutes before the lock a
 * warning offers "Stay signed in". When the time is up, the page reloads and the server asks for the code.
 */
export function IdleWarning({ idleMinutes }: { idleMinutes: number }) {
  const last = useRef(0);
  const lastPing = useRef(0);
  const [warn, setWarn] = useState(false);
  useEffect(() => {
    last.current = Date.now();
    lastPing.current = Date.now();
    const onActivity = () => {
      last.current = Date.now();
      if (Date.now() - lastPing.current > 5 * 60_000) {
        lastPing.current = Date.now();
        void touchSessionAction();
      }
    };
    const events = ["keydown", "pointerdown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const t = setInterval(() => {
      const idle = Date.now() - last.current;
      if (idle >= idleMinutes * 60_000) window.location.reload();
      else setWarn(idle >= (idleMinutes - 2) * 60_000);
    }, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(t);
    };
  }, [idleMinutes]);
  if (!warn) return null;
  return (
    <div className="idle-warn" role="alertdialog" aria-label="Signing out soon">
      <span>You&apos;ll be signed out in about 2 minutes because there&apos;s been no activity.</span>
      <button
        type="button"
        className="btn primary"
        onClick={async () => {
          last.current = Date.now();
          lastPing.current = Date.now();
          setWarn(false);
          if (!(await touchSessionAction())) window.location.reload();
        }}
      >
        Stay signed in
      </button>
    </div>
  );
}
