/**
 * NSW public holidays (Batch 2 items 5 and 9) — a small static list, checked against nsw.gov.au/about-nsw/public-holidays
 * on 22/10/2026. Bank Holiday (first Monday in August) is not a declared public holiday, so it is not in the list.
 * Add the next years here before the end of 2027 (years outside the list fall back to the fixed-date holidays only).
 */
import { type ISODate, addDays, dayOfWeek } from "./dates";

export const NSW_PUBLIC_HOLIDAYS: Readonly<Record<ISODate, string>> = {
  // 2026
  "2026-01-01": "New Year's Day",
  "2026-01-26": "Australia Day",
  "2026-04-03": "Good Friday",
  "2026-04-04": "Easter Saturday",
  "2026-04-05": "Easter Sunday",
  "2026-04-06": "Easter Monday",
  "2026-04-25": "Anzac Day",
  "2026-04-27": "Additional day (Anzac Day)",
  "2026-06-08": "King's Birthday",
  "2026-10-05": "Labour Day",
  "2026-12-25": "Christmas Day",
  "2026-12-26": "Boxing Day",
  "2026-12-28": "Additional day (Boxing Day)",
  // 2027
  "2027-01-01": "New Year's Day",
  "2027-01-26": "Australia Day",
  "2027-03-26": "Good Friday",
  "2027-03-27": "Easter Saturday",
  "2027-03-28": "Easter Sunday",
  "2027-03-29": "Easter Monday",
  "2027-04-25": "Anzac Day",
  "2027-04-26": "Additional day (Anzac Day)",
  "2027-06-14": "King's Birthday",
  "2027-10-04": "Labour Day",
  "2027-12-25": "Christmas Day",
  "2027-12-26": "Boxing Day",
  "2027-12-27": "Additional day (Christmas Day)",
  "2027-12-28": "Additional day (Boxing Day)",
};

const LISTED_YEARS = new Set(Object.keys(NSW_PUBLIC_HOLIDAYS).map((d) => d.slice(0, 4)));
const FIXED: Record<string, string> = { "01-01": "New Year's Day", "01-26": "Australia Day", "04-25": "Anzac Day", "12-25": "Christmas Day", "12-26": "Boxing Day" };

/** Holiday name, or null. Years not in the list only know the fixed-date holidays. */
export function publicHolidayName(iso: ISODate): string | null {
  if (NSW_PUBLIC_HOLIDAYS[iso]) return NSW_PUBLIC_HOLIDAYS[iso];
  if (LISTED_YEARS.has(iso.slice(0, 4))) return null;
  return FIXED[iso.slice(5)] ?? null;
}

export function isPublicHoliday(iso: ISODate): boolean {
  return publicHolidayName(iso) !== null;
}

export function isWeekend(iso: ISODate): boolean {
  const d = dayOfWeek(iso);
  return d === 0 || d === 6;
}

/** Mon–Fri and not an NSW public holiday. */
export function isWorkingDay(iso: ISODate): boolean {
  return !isWeekend(iso) && !isPublicHoliday(iso);
}

/** The first working day on or after the date. */
export function workingDayOnOrAfter(iso: ISODate): ISODate {
  let d = iso;
  for (let i = 0; i < 14 && !isWorkingDay(d); i++) d = addDays(d, 1);
  return d;
}

/** The date `n` working days after `iso` (n = 0 → the date itself). */
export function addWorkingDays(iso: ISODate, n: number): ISODate {
  let d = iso;
  for (let left = n; left > 0; ) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) left--;
  }
  return d;
}
