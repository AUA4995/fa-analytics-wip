/**
 * Operations calculations over the Thomax copy (batch 5, 17/11/2026). Pure — no database (tested in calc.test.ts).
 *
 * Times from Thomax have no time zone; they are Sydney wall-clock and are kept as such (a Date whose UTC parts are the
 * Sydney local time), so "before 14:00" and "same day" compare wall-clock values directly.
 *
 * SLA rules agreed with Asal:
 *   Dispatch (B2C): an order created before the cut-off (14:00) on a working day ships that day; after the cut-off or on a
 *                   non-working day → by the end of the next working day.
 *   Dispatch (B2B): 48 hours more (two working days after the B2C due day).
 *   Receiving:      received within 48 hours of arriving.
 * Working days: Monday–Friday, minus the public holidays listed in Operations → Setup.
 */

export interface OpsRules {
  /** Hour of the cut-off, 0–23 (default 14) */
  cutoffHour: number;
  /** Extra working days for B2B (default 2 = 48 h) */
  b2bExtraDays: number;
  /** Receiving target in hours (default 48) */
  receivingHours: number;
  /** Public holidays, YYYY-MM-DD */
  holidays: string[];
}

export const DEFAULT_RULES: OpsRules = { cutoffHour: 14, b2bExtraDays: 2, receivingHours: 48, holidays: [] };

const DAY = 86_400_000;

export const ymdUtc = (d: Date) => d.toISOString().slice(0, 10);

export function isWorkday(d: Date, holidays: ReadonlySet<string>): boolean {
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !holidays.has(ymdUtc(d));
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** The n-th working day after `d`'s day (n = 0 → `d`'s day itself if it is a working day, else the next one). */
export function workdayFrom(d: Date, n: number, holidays: ReadonlySet<string>): Date {
  let day = startOfDay(d);
  while (!isWorkday(day, holidays)) day = new Date(day.getTime() + DAY);
  for (let i = 0; i < n; i++) {
    day = new Date(day.getTime() + DAY);
    while (!isWorkday(day, holidays)) day = new Date(day.getTime() + DAY);
  }
  return day;
}

/** End of the day the order is due (exclusive bound: the start of the following day). */
export function dispatchDue(created: Date, b2b: boolean, rules: OpsRules, holidays: ReadonlySet<string> = new Set(rules.holidays)): Date {
  const sameDay = isWorkday(created, holidays) && created.getUTCHours() < rules.cutoffHour;
  const base = sameDay ? startOfDay(created) : workdayFrom(new Date(startOfDay(created).getTime() + DAY), 0, holidays);
  const due = b2b ? workdayFrom(base, rules.b2bExtraDays, holidays) : base;
  return new Date(due.getTime() + DAY);
}

export function receivingDue(arrived: Date, rules: OpsRules): Date {
  return new Date(arrived.getTime() + rules.receivingHours * 3_600_000);
}

export type SlaState = "MET" | "LATE" | "OPEN" | "OVERDUE";

export function slaState(due: Date, done: Date | null, now: Date): SlaState {
  if (done) return done < due ? "MET" : "LATE";
  return now < due ? "OPEN" : "OVERDUE";
}

export interface SlaCount {
  total: number;
  met: number;
  late: number;
  open: number;
  overdue: number;
}

export const emptyCount = (): SlaCount => ({ total: 0, met: 0, late: 0, open: 0, overdue: 0 });

export function addState(c: SlaCount, s: SlaState): void {
  c.total++;
  if (s === "MET") c.met++;
  else if (s === "LATE") c.late++;
  else if (s === "OPEN") c.open++;
  else c.overdue++;
}

/** Met ÷ (met + late + overdue): open items aren't due yet, so they don't count either way. null when nothing is due. */
export function metPct(c: SlaCount): number | null {
  const due = c.met + c.late + c.overdue;
  return due ? c.met / due : null;
}

/** Monday (UTC parts) of the week containing d. */
export function mondayOf(d: Date): Date {
  const s = startOfDay(d);
  const wd = (s.getUTCDay() + 6) % 7;
  return new Date(s.getTime() - wd * DAY);
}

/**
 * Next-days outlook: for each of the next `days` days, the average count on the same weekday over the last `weeks` weeks.
 * Only weekdays with at least `minWeeks` weeks of history get a figure; otherwise null ("not enough history").
 * Days are whole days before `today` (today is not complete yet).
 */
export function sameWeekdayOutlook(daily: ReadonlyMap<string, number>, today: Date, opts: { days?: number; weeks?: number; minWeeks?: number; firstDay?: Date | null } = {}): Array<{ day: Date; value: number | null; basis: number }> {
  const days = opts.days ?? 7;
  const weeks = opts.weeks ?? 8;
  const minWeeks = opts.minWeeks ?? 4;
  const t0 = startOfDay(today);
  const out: Array<{ day: Date; value: number | null; basis: number }> = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(t0.getTime() + i * DAY);
    const vals: number[] = [];
    for (let w = 1; w <= weeks; w++) {
      const past = new Date(day.getTime() - w * 7 * DAY);
      if (past >= t0) continue;
      if (opts.firstDay && past < startOfDay(opts.firstDay)) continue;
      vals.push(daily.get(ymdUtc(past)) ?? 0);
    }
    out.push({ day, value: vals.length >= minWeeks ? vals.reduce((a, b) => a + b, 0) / vals.length : null, basis: vals.length });
  }
  return out;
}

/** Holidays text ("2026-12-25, 26/12/2026") → sorted YYYY-MM-DD list; bad entries are returned separately. */
export function parseHolidays(text: string): { dates: string[]; bad: string[] } {
  const dates = new Set<string>();
  const bad: string[] = [];
  for (const raw of text.split(/[\s,;]+/).filter(Boolean)) {
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    let y: number, mo: number, d: number;
    if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
    else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw))) [d, mo, y] = [+m[1], +m[2], +m[3]];
    else {
      bad.push(raw);
      continue;
    }
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
      bad.push(raw);
      continue;
    }
    dates.add(ymdUtc(dt));
  }
  return { dates: [...dates].sort(), bad };
}

export type PeriodKey = "day" | "week" | "month" | "quarter" | "year" | "custom";
export const PERIODS: ReadonlyArray<readonly [PeriodKey, string]> = [
  ["day", "Today"],
  ["week", "This week"],
  ["month", "This month"],
  ["quarter", "This quarter"],
  ["year", "Financial year"],
  ["custom", "Custom"],
];

/** [from, to) for a period around `now` (wall-clock Sydney). Year = Australian financial year (1 Jul). Custom range max 400 days. */
export function periodRange(key: PeriodKey, now: Date, custom?: { from?: string; to?: string }): { from: Date; to: Date; label: string } {
  const t = startOfDay(now);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const fmt = (d: Date) => d.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const mk = (from: Date, to: Date) => ({ from, to, label: `${fmt(from)} – ${fmt(new Date(to.getTime() - DAY))}` });
  switch (key) {
    case "day":
      return mk(t, new Date(t.getTime() + DAY));
    case "week": {
      const mon = mondayOf(t);
      return mk(mon, new Date(mon.getTime() + 7 * DAY));
    }
    case "month":
      return mk(new Date(Date.UTC(y, m, 1)), new Date(Date.UTC(y, m + 1, 1)));
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return mk(new Date(Date.UTC(y, q, 1)), new Date(Date.UTC(y, q + 3, 1)));
    }
    case "year": {
      const fy = m >= 6 ? y : y - 1;
      return mk(new Date(Date.UTC(fy, 6, 1)), new Date(Date.UTC(fy + 1, 6, 1)));
    }
    case "custom": {
      const p = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? new Date(`${s}T00:00:00Z`) : null);
      let from = p(custom?.from) ?? new Date(t.getTime() - 29 * DAY);
      let to = p(custom?.to) ?? t;
      if (to < from) [from, to] = [to, from];
      if (to.getTime() - from.getTime() > 400 * DAY) from = new Date(to.getTime() - 400 * DAY);
      return mk(from, new Date(to.getTime() + DAY));
    }
  }
}

export function parsePeriod(v: unknown): PeriodKey {
  return PERIODS.some(([k]) => k === v) ? (v as PeriodKey) : "month";
}

/** "Now" as Sydney wall-clock (a Date whose UTC parts are the Sydney local time), to compare with Thomax times. */
export function sydneyWallNow(now = new Date()): Date {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, Number(x.value)]),
  );
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

/** Wall-clock date/time for tables: 17/11/2026 14:05 */
export function showWall(d: Date | null): string {
  if (!d) return "—";
  return `${d.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })} ${d.toISOString().slice(11, 16)}`;
}
