/**
 * Light / dark look (22/10/2026). Each person picks their own in Settings: follow the device ("system", stored as
 * null), always light, or always dark. The root layout writes `data-theme` on <html> only for light/dark; with no
 * attribute the CSS follows the device (prefers-color-scheme). Pure: no DB, no React.
 */

export type ThemePref = "system" | "light" | "dark";

export const THEME_PREFS: ReadonlyArray<{ key: ThemePref; label: string; hint: string }> = [
  { key: "system", label: "Same as device", hint: "Light by day, dark at night — follows your computer or phone" },
  { key: "light", label: "Light", hint: "Always light" },
  { key: "dark", label: "Dark", hint: "Always dark" },
];

/** A stored or submitted value → a valid preference (anything unknown = follow the device). */
export function parseTheme(value: unknown): ThemePref {
  return value === "light" || value === "dark" ? value : "system";
}

/** Value to store on the user (null = follow the device). */
export function themeToStore(pref: ThemePref): string | null {
  return pref === "system" ? null : pref;
}

/** `data-theme` for <html>: only set when the person chose light or dark. */
export function themeAttr(stored: string | null | undefined): "light" | "dark" | undefined {
  const p = parseTheme(stored);
  return p === "system" ? undefined : p;
}
