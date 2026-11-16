/**
 * Weighted tickets (batch 3, 16/11/2026). Pure — no database, no Front.
 *   score of a ticket = type weight (1–10) × duration multiplier
 *   duration multiplier = 1 + step × (weeks open − 1), capped (default +25% per extra week, up to ×3)
 * A client's weekly score is compared with the average of all clients that week.
 * Types come from Front tags (Settings → Ticket types); a conversation with no matching tag is "Unclassified".
 */

export type Department = "SUPPORT" | "ACCOUNTS" | "WAREHOUSE" | "SALES";
export const DEPARTMENTS: ReadonlyArray<readonly [Department, string]> = [
  ["SUPPORT", "Client support"],
  ["ACCOUNTS", "Accounts"],
  ["WAREHOUSE", "Warehouse"],
  ["SALES", "Sales"],
];

export interface TypeDef {
  name: string;
  department: Department;
  weight: number;
  tags: string[];
}

export const UNCLASSIFIED = "Unclassified";

/**
 * Starting list (draft — Asal edits it in Settings → Ticket types). Tags are empty until mapped to Front tags,
 * so until then every ticket counts as Unclassified.
 */
export const DEFAULT_TICKET_TYPES: TypeDef[] = [
  { name: "Order status / where is my order", department: "SUPPORT", weight: 2, tags: [] },
  { name: "Order change / address change", department: "SUPPORT", weight: 3, tags: [] },
  { name: "Stock query", department: "SUPPORT", weight: 3, tags: [] },
  { name: "Inbound / ASN booking", department: "SUPPORT", weight: 4, tags: [] },
  { name: "Returns", department: "SUPPORT", weight: 4, tags: [] },
  { name: "Urgent / same-day dispatch", department: "SUPPORT", weight: 5, tags: [] },
  { name: "Missing or wrong item", department: "SUPPORT", weight: 6, tags: [] },
  { name: "Damage claim", department: "SUPPORT", weight: 7, tags: [] },
  { name: "Special project / kitting", department: "SUPPORT", weight: 8, tags: [] },
  { name: "Integration / technical issue", department: "SUPPORT", weight: 8, tags: [] },
  { name: "Payment / remittance", department: "ACCOUNTS", weight: 2, tags: [] },
  { name: "Invoice query", department: "ACCOUNTS", weight: 4, tags: [] },
  { name: "Rate change", department: "ACCOUNTS", weight: 5, tags: [] },
  { name: "Billing dispute", department: "ACCOUNTS", weight: 8, tags: [] },
  { name: "Pickup / collection booking", department: "WAREHOUSE", weight: 3, tags: [] },
  { name: "Container booking", department: "WAREHOUSE", weight: 5, tags: [] },
  { name: "Quote / new service", department: "SALES", weight: 4, tags: [] },
  { name: UNCLASSIFIED, department: "SUPPORT", weight: 3, tags: [] },
];

export interface ScoreRules {
  /** Extra per week open after the first (0.25 = +25%) */
  weekStep: number;
  /** Highest multiplier (3 = ×3) */
  maxMultiplier: number;
}
export const DEFAULT_SCORE_RULES: ScoreRules = { weekStep: 0.25, maxMultiplier: 3 };

/** 1 for the first week (or part of it), then + step per started week, capped. */
export function durationMultiplier(weeksOpen: number, r: ScoreRules = DEFAULT_SCORE_RULES): number {
  const started = Math.max(1, Math.ceil(Math.max(0, weeksOpen) || 0));
  return Math.min(r.maxMultiplier, 1 + r.weekStep * (started - 1));
}

/** First type (in list order) whose tags the conversation carries; else Unclassified (or null if no such type). */
export function classify(tags: readonly string[], types: readonly TypeDef[]): TypeDef | null {
  const have = new Set(tags.map((t) => t.trim().toLowerCase()));
  for (const t of types) if (t.name !== UNCLASSIFIED && t.tags.some((x) => have.has(x.trim().toLowerCase()))) return t;
  return types.find((t) => t.name === UNCLASSIFIED) ?? null;
}

export interface TicketIn {
  tags: string[];
  createdAt: Date;
  /** When it was closed (archived/resolved); null = still open */
  closedAt: Date | null;
}

export interface WeekScore {
  tickets: number;
  score: number;
  supportScore: number;
  accountsScore: number;
  byType: Record<string, number>;
}

const WEEK_MS = 7 * 86_400_000;

export function scoreTickets(tickets: readonly TicketIn[], types: readonly TypeDef[], now: Date, r: ScoreRules = DEFAULT_SCORE_RULES): WeekScore {
  const out: WeekScore = { tickets: 0, score: 0, supportScore: 0, accountsScore: 0, byType: {} };
  for (const t of tickets) {
    const type = classify(t.tags, types);
    const weight = type?.weight ?? 0;
    const end = t.closedAt ?? now;
    const s = weight * durationMultiplier((end.getTime() - t.createdAt.getTime()) / WEEK_MS, r);
    out.tickets++;
    out.score += s;
    if (type?.department === "ACCOUNTS") out.accountsScore += s;
    else if (type?.department === "SUPPORT") out.supportScore += s;
    const k = type?.name ?? UNCLASSIFIED;
    out.byType[k] = (out.byType[k] ?? 0) + 1;
  }
  out.score = round2(out.score);
  out.supportScore = round2(out.supportScore);
  out.accountsScore = round2(out.accountsScore);
  return out;
}

/** Monday (YYYY-MM-DD) of the Sydney week a moment falls in. */
export function weekOf(d: Date, timeZone = "Australia/Sydney"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(d);
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  const local = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  return new Date(local.getTime() - Math.max(0, dow) * 86_400_000).toISOString().slice(0, 10);
}

/** The last `n` full weeks' Mondays (newest first), not counting the current week. */
export function lastWeeks(n: number, now = new Date()): string[] {
  const thisMon = new Date(`${weekOf(now)}T00:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) => new Date(thisMon - (i + 1) * WEEK_MS).toISOString().slice(0, 10));
}

/** Client score ÷ average of clients with tickets that week (1 = average, 2 = twice the average). */
export function vsAverage(scores: Record<string, number>): Record<string, number | null> {
  const vals = Object.values(scores).filter((v) => v > 0);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, avg ? v / avg : null]));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
