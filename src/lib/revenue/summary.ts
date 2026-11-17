/**
 * Revenue protection (batch 4, 16/11/2026) — pure sums for Mark's weekly figure. No database here.
 *   case result = amountBefore − amountAfter (positive = protected, negative = a loss); null while either is missing
 *   protected = cost avoided + leakage recovered (cases + Leakage log) + losses (negative)
 * Improvement savings are a monthly rate, shown beside it, never added to one-off amounts.
 */

export type CaseKind = "COST_AVOIDED" | "LOSS" | "RECOVERED";
export const CASE_KINDS: ReadonlyArray<readonly [CaseKind, string]> = [
  ["COST_AVOIDED", "Cost avoided"],
  ["LOSS", "Loss (not prevented)"],
  ["RECOVERED", "Recovered"],
];

export interface CaseIn {
  date: Date;
  kind: string;
  amountBefore: number | null;
  amountAfter: number | null;
  pending: string | null;
  status: string;
}

export function caseResult(c: Pick<CaseIn, "amountBefore" | "amountAfter">): number | null {
  if (c.amountBefore == null || c.amountAfter == null) return null;
  return Math.round((c.amountBefore - c.amountAfter) * 100) / 100;
}

export interface Summary {
  avoided: number;
  losses: number;
  recoveredCases: number;
  recoveredLeakage: number;
  protectedNet: number;
  cases: number;
  /** Cases counted with figures still to confirm */
  provisional: number;
  /** Cases with no result yet (a figure missing) */
  noResult: number;
  /** Leakage marked recovered with no recovered amount — not counted (no amount is assumed) */
  recoveredNoAmount: number;
}

/** A provisional case: still open with parts to confirm, so its result is a limit, not the final figure. */
export const isProvisional = (c: Pick<CaseIn, "pending" | "status">) => !!(c.pending && c.pending.trim() && c.status !== "CLOSED");

export function summarise(cases: readonly CaseIn[], recoveredLeakage: number, from: Date, to: Date, recoveredNoAmount = 0): Summary {
  const inRange = cases.filter((c) => c.date >= from && c.date < to);
  const s: Summary = { avoided: 0, losses: 0, recoveredCases: 0, recoveredLeakage: Math.round(recoveredLeakage * 100) / 100, protectedNet: 0, cases: inRange.length, provisional: 0, noResult: 0, recoveredNoAmount };
  for (const c of inRange) {
    const r = caseResult(c);
    if (r == null) {
      s.noResult++;
      continue;
    }
    if (isProvisional(c)) s.provisional++;
    if (c.kind === "LOSS") s.losses += Math.min(0, r);
    // Recovered = missed − still missed; a negative result is a data error (refused on save), never counted as a gain
    else if (c.kind === "RECOVERED") s.recoveredCases += Math.max(0, r);
    else s.avoided += r;
  }
  s.protectedNet = Math.round((s.avoided + s.recoveredCases + s.recoveredLeakage + s.losses) * 100) / 100;
  return s;
}

/** Periods Mark looks at: this week (Mon–Sun, Sydney), this month, this financial year (July–June). */
export function periods(now: Date): Record<"week" | "month" | "fy", { from: Date; to: Date; label: string }> {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now).map((p) => [p.type, p.value]));
  const today = Date.UTC(+parts.year, +parts.month - 1, +parts.day);
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  const mon = today - dow * 86_400_000;
  const y = +parts.year;
  const m = +parts.month;
  const fyStart = m >= 7 ? y : y - 1;
  const d = (t: number) => new Date(t);
  return {
    week: { from: d(mon), to: d(mon + 7 * 86_400_000), label: `week of ${new Date(mon).toISOString().slice(0, 10).split("-").reverse().join("/")}` },
    month: { from: d(Date.UTC(y, m - 1, 1)), to: d(Date.UTC(y, m, 1)), label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }) },
    fy: { from: d(Date.UTC(fyStart, 6, 1)), to: d(Date.UTC(fyStart + 1, 6, 1)), label: `FY${String(fyStart + 1).slice(2)}` },
  };
}
