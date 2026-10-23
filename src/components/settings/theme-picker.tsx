"use client";

import { useState, useTransition } from "react";
import { setTheme } from "@/lib/actions/shell";
import { THEME_PREFS, type ThemePref } from "@/lib/theme";
import "./settings.css";

/** Show the choice at once: data-theme on <html> (none = follow the device). */
function applyTheme(p: ThemePref) {
  const el = document.documentElement;
  if (p === "system") delete el.dataset.theme;
  else el.dataset.theme = p;
}

const ICON: Record<ThemePref, React.ReactNode> = {
  system: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  ),
};

/** A tiny picture of the app in that look (menu, top bar, two cards). */
function Preview({ look }: { look: ThemePref }) {
  return (
    <span className={`tp-shot tp-${look}`} aria-hidden="true">
      <span className="tp-pane tp-pane-light">
        <i className="tp-side" />
        <i className="tp-top" />
        <i className="tp-card tp-c1" />
        <i className="tp-card tp-c2" />
      </span>
      {look === "system" && (
        <span className="tp-pane tp-pane-dark">
          <i className="tp-side" />
          <i className="tp-top" />
          <i className="tp-card tp-c1" />
          <i className="tp-card tp-c2" />
        </span>
      )}
    </span>
  );
}

/** Settings: Same as device · Light · Dark. Saved for the signed-in person only; applies straight away. */
export function ThemePicker({ initial }: { initial: ThemePref }) {
  const [pref, setPref] = useState<ThemePref>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const choose = (p: ThemePref) => {
    if (p === pref) return;
    const prev = pref;
    setPref(p);
    applyTheme(p);
    setMsg(null);
    start(async () => {
      const r = await setTheme(p);
      if (r.ok) setMsg({ ok: true, text: "Saved. This changes the look for you only." });
      else {
        setPref(prev);
        applyTheme(prev);
        setMsg({ ok: false, text: "Couldn't save that. Please try again." });
      }
    });
  };

  return (
    <div className="tp">
      <div className="tp-grid" role="radiogroup" aria-label="Look of the app">
        {THEME_PREFS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={pref === t.key}
            className="tp-opt"
            onClick={() => choose(t.key)}
            disabled={pending && pref !== t.key}
          >
            <Preview look={t.key} />
            <span className="tp-label">
              {ICON[t.key]}
              <strong>{t.label}</strong>
              {pref === t.key && (
                <span className="tp-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5 10 17l9-10" />
                  </svg>
                </span>
              )}
            </span>
            <span className="tp-hint">{t.hint}</span>
          </button>
        ))}
      </div>
      <p className={"meta tp-msg" + (msg && !msg.ok ? " tp-err" : "")} role="status" aria-live="polite">
        {msg?.text ?? "Each person picks their own. Digest emails always stay light."}
      </p>
    </div>
  );
}
