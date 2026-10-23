"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { resetBranding, saveBranding, type BrandingActionState } from "./branding-actions";

export interface BrandingFormProps {
  colours: { accentColour: string; primaryColour: string; textColour: string };
  logos: { dark: string; light: string; mark: string };
  uploaded: { dark: boolean; light: boolean; mark: boolean };
  defaults: { accentColour: string; primaryColour: string; textColour: string; logos: { dark: string; light: string; mark: string } };
}

// Live preview writes the raw brand colours; light/dark tints are derived from them in globals.css.
const VARS = { accentColour: "--brand-accent", primaryColour: "--brand-blue", textColour: "--brand-ink" } as const;
type ColourKey = keyof typeof VARS;
const COLOUR_ROWS: Array<[ColourKey, string]> = [
  ["accentColour", "Dark accents (lead cards, selected states, email header)"],
  ["primaryColour", "Primary (buttons, links, highlights)"],
  ["textColour", "Text"],
];

function setLive(c: Partial<Record<ColourKey, string>>) {
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(c) as Array<[ColourKey, string]>) root.setProperty(VARS[k], v);
}
function clearLive() {
  const root = document.documentElement.style;
  for (const v of Object.values(VARS)) root.removeProperty(v);
}

/** Settings → Branding: logos for dark/light backgrounds, menu icon, three colours, live preview, Reset to FA brand. */
export function BrandingForm({ colours, logos, uploaded, defaults }: BrandingFormProps) {
  const router = useRouter();
  const [resetMsg, setResetMsg] = useState<BrandingActionState | null>(null);
  const [resetting, startReset] = useTransition();
  const [c, setC] = useState(colours);
  const [preview, setPreview] = useState<Record<"dark" | "light" | "mark", string | null>>({ dark: null, light: null, mark: null });
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(async (prev: BrandingActionState, fd: FormData) => {
    const r = await saveBranding(prev, fd);
    setResetMsg(null);
    if (r.ok) {
      // Saved values now come from the server-rendered brand tokens.
      clearLive();
      setPreview({ dark: null, light: null, mark: null });
      setFormKey((k) => k + 1);
    }
    return r;
  }, { ok: false, message: "" } as BrandingActionState);

  // Colours apply live across the app while editing; the saved values take over after Save / leaving the page.
  useEffect(() => () => clearLive(), []);

  const change = (k: ColourKey, v: string) => {
    setC((prev) => ({ ...prev, [k]: v }));
    setLive({ [k]: v });
  };
  const pick = (k: "dark" | "light" | "mark", f: File | undefined) => setPreview((p) => ({ ...p, [k]: f ? URL.createObjectURL(f) : null }));
  const msg = resetMsg ?? (state.message ? state : null);

  const logoBlock = (k: "dark" | "light" | "mark", field: string, label: string, isUploaded: boolean) => (
    <div>
      <div className="small muted">{label}</div>
      <div className={"logobox" + (k === "dark" ? " dark" : "")} style={k === "mark" ? { justifyContent: "flex-start" } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- uploaded artwork / local preview */}
        <img src={preview[k] ?? logos[k]} alt={label} style={k === "mark" ? { height: 40 } : undefined} />
      </div>
      <label className="btn">
        Upload logo…
        <input type="file" name={field} accept="image/svg+xml,image/png,image/jpeg" hidden onChange={(e) => pick(k, e.target.files?.[0])} />
      </label>
      {isUploaded && (
        <label className="meta" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
          <input type="checkbox" name={`clear_${field}`} /> Use the FA default
        </label>
      )}
      {state.errors?.[field] && <div className="msg-err">{state.errors[field]}</div>}
    </div>
  );

  return (
    <form action={action} key={formKey}>
      <div className="brandgrid">
        {logoBlock("dark", "logoDark", "Logo on dark background (email header)", uploaded.dark)}
        {logoBlock("light", "logoLight", "Logo on light background (menu, print, PDFs)", uploaded.light)}
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          {COLOUR_ROWS.map(([k, label]) => (
            <label className="colorrow" key={k}>
              <input type="color" name={k} value={c[k]} onChange={(e) => change(k, e.target.value.toUpperCase())} aria-label={label} />
              <span>{label}</span>
              <span className="mono">{c[k].toUpperCase()}</span>
            </label>
          ))}
          {(state.errors?.accentColour || state.errors?.primaryColour || state.errors?.textColour) && (
            <div className="msg-err">{state.errors.accentColour ?? state.errors.primaryColour ?? state.errors.textColour}</div>
          )}
        </div>
      </div>

      <div className="brandgrid" style={{ marginTop: 16 }}>
        {logoBlock("mark", "logoMark", "Menu icon (collapsed menu)", uploaded.mark)}
        <div>
          <div className="small muted">Preview</div>
          <div className="logobox" style={{ display: "grid", gap: 8, alignItems: "start", background: "var(--app-bg)" }}>
            <div className="kpi lead" style={{ padding: "10px 12px" }}>
              <div className="l">Pay run Fri</div>
              <div className="v" style={{ fontSize: 20 }}>$12,345.67</div>
              <div className="s">3 bills · 1 overdue</div>
            </div>
            <div className="row">
              <span className="btn primary">Primary button</span>
              <a className="ref" href="#" onClick={(e) => e.preventDefault()}>
                AC-6017
              </a>
              <span style={{ color: "var(--ink)" }}>Body text</span>
            </div>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button type="submit" className="btn primary" disabled={pending}>
          {pending ? "Saving…" : "Save branding"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={resetting}
          onClick={() =>
            startReset(async () => {
              const r = await resetBranding();
              setResetMsg(r);
              if (r.ok) {
                clearLive();
                setC({ accentColour: defaults.accentColour, primaryColour: defaults.primaryColour, textColour: defaults.textColour });
                setPreview({ dark: null, light: null, mark: null });
                setFormKey((k) => k + 1);
                router.refresh();
              }
            })
          }
        >
          Reset to FA brand
        </button>
        {msg && <span className={msg.ok ? "msg-ok" : "msg-err"}>{msg.message}</span>}
      </div>
      <p className="meta" style={{ margin: "10px 0 0" }}>
        SVG works best in the app (sharp at any size). Email apps such as Outlook and Gmail do not show SVG, so for the email header logo upload a PNG — the FA default already is one.
        Status colours (red, amber, green) stay fixed so warnings always look like warnings.
      </p>
    </form>
  );
}
