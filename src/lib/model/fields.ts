/**
 * Editable value specs (pure, shared by server and client). Every editable value in Settings and in the details panels
 * is described by a FieldSpec, parsed with parseFieldValue and shown with formatFieldValue — so a value edited in a
 * panel and the same value in Settings behave identically (brief §4 "synced").
 */

export type FieldKind = "text" | "number" | "int" | "money" | "pct" | "bool" | "select" | "date" | "list" | "drivers";

export interface FieldSpec {
  label: string;
  kind: FieldKind;
  /** select: [value, label] */
  options?: ReadonlyArray<readonly [string, string]>;
  /** Bounds in display units (pct: 0–100) */
  min?: number;
  max?: number;
  /** Empty allowed (stored as null / []) */
  optional?: boolean;
  hint?: string;
  /** Decimal places shown (number / money) */
  dp?: number;
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

const num = (s: string) => Number(s.replace(/[$,%\s]/g, ""));

/** Parse what a person typed into the stored value. pct is typed as 85 (or 85%) and stored as 0.85. */
export function parseFieldValue(spec: FieldSpec, raw: string | boolean | null | undefined): ParseResult {
  if (spec.kind === "bool") {
    if (typeof raw === "boolean") return { ok: true, value: raw };
    const v = String(raw ?? "").toLowerCase();
    if (["true", "yes", "1", "on"].includes(v)) return { ok: true, value: true };
    if (["false", "no", "0", "off", ""].includes(v)) return { ok: true, value: false };
    return { ok: false, error: "Yes or no" };
  }
  const s = String(raw ?? "").trim();
  if (spec.kind === "list") {
    const items = s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
    if (!items.length && !spec.optional) return { ok: false, error: `${spec.label} is required` };
    return { ok: true, value: Array.from(new Set(items)) };
  }
  if (spec.kind === "drivers") {
    // "equip=1, software=1" → { equip: 1, software: 1 }
    const out: Record<string, number> = {};
    for (const part of s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) {
      const m = part.match(/^([a-z0-9_]+)\s*[=:]\s*([0-9.]+)$/i);
      if (!m) return { ok: false, error: `Write each driver as name=number, e.g. equip=1 ("${part}")` };
      out[m[1]] = Number(m[2]);
    }
    return { ok: true, value: out };
  }
  if (!s) return spec.optional ? { ok: true, value: null } : { ok: false, error: `${spec.label} is required` };
  switch (spec.kind) {
    case "text":
      if (s.length > 300) return { ok: false, error: "Too long (300 characters max)" };
      return { ok: true, value: s };
    case "select":
      if (!spec.options?.some(([v]) => v === s)) return { ok: false, error: `Choose one of: ${spec.options?.map(([, l]) => l).join(", ")}` };
      return { ok: true, value: s };
    case "date": {
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) ?? null;
      const iso = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(iso + "T00:00:00Z"))) return { ok: false, error: "Use DD/MM/YYYY" };
      return { ok: true, value: iso };
    }
    default: {
      const n = num(s);
      if (!Number.isFinite(n)) return { ok: false, error: `${spec.label} must be a number` };
      if (spec.kind === "int" && !Number.isInteger(n)) return { ok: false, error: `${spec.label} must be a whole number` };
      if (spec.min != null && n < spec.min) return { ok: false, error: `${spec.label} can't be below ${spec.min}${spec.kind === "pct" ? "%" : ""}` };
      if (spec.max != null && n > spec.max) return { ok: false, error: `${spec.label} can't be above ${spec.max}${spec.kind === "pct" ? "%" : ""}` };
      return { ok: true, value: spec.kind === "pct" ? Math.round(n * 100) / 10000 : n };
    }
  }
}

/** Stored value → text for display (AUD 2 dp, %, DD/MM/YYYY). */
export function formatFieldValue(spec: FieldSpec, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (spec.kind) {
    case "bool":
      return v ? "Yes" : "No";
    case "pct":
      return `${trim(Number(v) * 100, 2)}%`;
    case "money":
      return Number(v).toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: spec.dp ?? 2, maximumFractionDigits: spec.dp ?? 2 });
    case "number":
      return trim(Number(v), spec.dp ?? 3);
    case "int":
      return Number(v).toLocaleString("en-AU");
    case "select":
      return spec.options?.find(([o]) => o === v)?.[1] ?? String(v);
    case "date": {
      const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y}`;
    }
    case "list":
      return Array.isArray(v) && v.length ? v.join(", ") : "—";
    case "drivers": {
      const e = Object.entries((v ?? {}) as Record<string, number>);
      return e.length ? e.map(([k, n]) => `${k}=${n}`).join(", ") : "—";
    }
    default:
      return String(v);
  }
}

/** Stored value → what goes in the input box when editing. */
export function inputFieldValue(spec: FieldSpec, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (spec.kind === "pct") return trim(Number(v) * 100, 2);
  if (spec.kind === "date") return formatFieldValue(spec, v);
  if (spec.kind === "list") return Array.isArray(v) ? v.join(", ") : "";
  if (spec.kind === "drivers") return formatFieldValue(spec, v).replace(/^—$/, "");
  if (spec.kind === "bool") return v ? "true" : "false";
  return String(v);
}

function trim(n: number, dp: number): string {
  return Number(n.toFixed(dp)).toString();
}

/** JSON-safe form of a stored value for the change log (Decimal / Date → string). */
export function logSafe(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v && typeof v === "object" && "toNumber" in (v as object) && typeof (v as { toNumber: unknown }).toNumber === "function") return (v as { toNumber: () => number }).toNumber();
  return v;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(logSafe(a)) === JSON.stringify(logSafe(b));
}
