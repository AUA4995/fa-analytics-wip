/**
 * Date-only helpers.
 *
 * Xero gives us calendar dates (no time). To avoid timezone/DST surprises we work
 * with ISO date strings ("YYYY-MM-DD") and do all arithmetic in UTC.
 */

export type ISODate = string; // "YYYY-MM-DD"

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const d = toDate(value);
  return !Number.isNaN(d.getTime()) && fromDate(d) === value;
}

/** ISO date → Date at UTC midnight */
export function toDate(iso: ISODate): Date {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Date → ISO date using the UTC calendar fields */
export function fromDate(d: Date): ISODate {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDate(d);
}

/** 0 = Sunday … 5 = Friday, 6 = Saturday */
export function dayOfWeek(iso: ISODate): number {
  return toDate(iso).getUTCDay();
}

export const FRIDAY = 5;

export function isFriday(iso: ISODate): boolean {
  return dayOfWeek(iso) === FRIDAY;
}

/** The Friday on or before the given date (same day if it is a Friday). */
export function fridayOnOrBefore(iso: ISODate): ISODate {
  const diff = (dayOfWeek(iso) - FRIDAY + 7) % 7;
  return addDays(iso, -diff);
}

/** The Friday on or after the given date (same day if it is a Friday). */
export function fridayOnOrAfter(iso: ISODate): ISODate {
  const diff = (FRIDAY - dayOfWeek(iso) + 7) % 7;
  return addDays(iso, diff);
}

/** Last calendar day of the month containing the given date. */
export function endOfMonth(iso: ISODate): ISODate {
  const d = toDate(iso);
  const eom = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return fromDate(eom);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: ISODate, to: ISODate): number {
  const ms = toDate(to).getTime() - toDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Today's calendar date in a given IANA timezone (default Australia/Sydney). */
export function todayInTimezone(timeZone = "Australia/Sydney", now = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Format for people: DD/MM/YYYY (Australian convention). */
export function formatAU(iso: ISODate | null | undefined): string {
  if (!iso) return "—";
  const m = ISO_RE.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Format with weekday, e.g. "Fri 23/10/2026". */
export function formatAUWithDay(iso: ISODate | null | undefined): string {
  if (!iso) return "—";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${names[dayOfWeek(iso)]} ${formatAU(iso)}`;
}
