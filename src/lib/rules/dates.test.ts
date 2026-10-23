import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  endOfMonth,
  formatAU,
  formatAUWithDay,
  fridayOnOrAfter,
  fridayOnOrBefore,
  isISODate,
  todayInTimezone,
} from "./dates";

describe("dates helpers", () => {
  it("fridayOnOrBefore", () => {
    expect(fridayOnOrBefore("2026-10-16")).toBe("2026-10-16"); // Fri
    expect(fridayOnOrBefore("2026-10-17")).toBe("2026-10-16"); // Sat
    expect(fridayOnOrBefore("2026-10-20")).toBe("2026-10-16"); // Tue
    expect(fridayOnOrBefore("2026-10-22")).toBe("2026-10-16"); // Thu
    expect(fridayOnOrBefore("2026-10-23")).toBe("2026-10-23"); // Fri
  });

  it("fridayOnOrAfter", () => {
    expect(fridayOnOrAfter("2026-10-16")).toBe("2026-10-16"); // Fri
    expect(fridayOnOrAfter("2026-10-17")).toBe("2026-10-23"); // Sat
    expect(fridayOnOrAfter("2026-10-22")).toBe("2026-10-23"); // Thu
  });

  it("endOfMonth", () => {
    expect(endOfMonth("2026-10-05")).toBe("2026-10-31");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonth("2026-12-31")).toBe("2026-12-31");
  });

  it("addDays and daysBetween across month/year boundaries", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(daysBetween("2026-10-12", "2026-10-16")).toBe(4);
    expect(daysBetween("2026-10-16", "2026-10-12")).toBe(-4);
  });

  it("isISODate rejects invalid calendar dates", () => {
    expect(isISODate("2026-10-16")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("16/10/2026")).toBe(false);
    expect(isISODate("2026-10-16T00:00:00Z")).toBe(false);
    expect(isISODate(null)).toBe(false);
  });

  it("todayInTimezone uses the Sydney calendar day, not UTC", () => {
    // 2026-10-16 15:30 UTC = 2026-10-17 02:30 AEDT (UTC+11)
    const now = new Date("2026-10-16T15:30:00Z");
    expect(todayInTimezone("Australia/Sydney", now)).toBe("2026-10-17");
    expect(todayInTimezone("UTC", now)).toBe("2026-10-16");
  });

  it("formats dates the Australian way", () => {
    expect(formatAU("2026-10-16")).toBe("16/10/2026");
    expect(formatAUWithDay("2026-10-16")).toBe("Fri 16/10/2026");
    expect(formatAU(null)).toBe("—");
  });
});
