import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, dispatchDue, metPct, mondayOf, parseHolidays, periodRange, receivingDue, sameWeekdayOutlook, slaState, sydneyWallNow, workdayFrom, ymdUtc } from "./calc";

const w = (s: string) => new Date(`${s}Z`); // wall-clock helper
const rules = { ...DEFAULT_RULES };

describe("dispatch due (cut-off 14:00, B2B +2 working days)", () => {
  it("before cut-off on a working day → end of that day", () => {
    expect(dispatchDue(w("2026-11-17T13:59:00"), false, rules).toISOString()).toBe("2026-11-18T00:00:00.000Z");
  });
  it("at or after cut-off → end of the next working day", () => {
    expect(dispatchDue(w("2026-11-17T14:00:00"), false, rules).toISOString()).toBe("2026-11-19T00:00:00.000Z");
  });
  it("Friday after cut-off → Monday", () => {
    expect(dispatchDue(w("2026-11-20T15:00:00"), false, rules).toISOString()).toBe("2026-11-24T00:00:00.000Z");
  });
  it("Saturday morning → Monday", () => {
    expect(dispatchDue(w("2026-11-21T09:00:00"), false, rules).toISOString()).toBe("2026-11-24T00:00:00.000Z");
  });
  it("public holiday is skipped", () => {
    const r = { ...rules, holidays: ["2026-12-25"] };
    // Thu 24/12 after cut-off → Fri 25/12 is a holiday → Mon 28/12
    expect(dispatchDue(w("2026-12-24T16:00:00"), false, r).toISOString()).toBe("2026-12-29T00:00:00.000Z");
  });
  it("B2B adds two working days", () => {
    // Thu before cut-off → base Thu → +2 working days = Mon
    expect(dispatchDue(w("2026-11-19T10:00:00"), true, rules).toISOString()).toBe("2026-11-24T00:00:00.000Z");
  });
});

describe("states and percentages", () => {
  const due = w("2026-11-18T00:00:00");
  it("met / late / open / overdue", () => {
    expect(slaState(due, w("2026-11-17T23:00:00"), w("2026-11-20T00:00:00"))).toBe("MET");
    expect(slaState(due, w("2026-11-18T00:00:00"), w("2026-11-20T00:00:00"))).toBe("LATE");
    expect(slaState(due, null, w("2026-11-17T20:00:00"))).toBe("OPEN");
    expect(slaState(due, null, w("2026-11-18T00:00:01"))).toBe("OVERDUE");
  });
  it("open items don't count; nothing due → null", () => {
    expect(metPct({ total: 5, met: 3, late: 1, open: 0, overdue: 1 })).toBe(0.6);
    expect(metPct({ total: 2, met: 0, late: 0, open: 2, overdue: 0 })).toBeNull();
  });
  it("receiving due is arrived + target hours", () => {
    expect(receivingDue(w("2026-11-17T10:00:00"), rules).toISOString()).toBe("2026-11-19T10:00:00.000Z");
  });
});

describe("days and periods", () => {
  it("workdayFrom skips weekends", () => {
    expect(ymdUtc(workdayFrom(w("2026-11-21T00:00:00"), 0, new Set()))).toBe("2026-11-23");
    expect(ymdUtc(workdayFrom(w("2026-11-20T00:00:00"), 1, new Set()))).toBe("2026-11-23");
  });
  it("Monday of the week", () => {
    expect(ymdUtc(mondayOf(w("2026-11-22T23:00:00")))).toBe("2026-11-16");
    expect(ymdUtc(mondayOf(w("2026-11-16T00:00:00")))).toBe("2026-11-16");
  });
  it("financial year runs 1 Jul – 30 Jun", () => {
    const r = periodRange("year", w("2026-11-17T10:00:00"));
    expect([ymdUtc(r.from), ymdUtc(r.to)]).toEqual(["2026-07-01", "2027-07-01"]);
    const r2 = periodRange("year", w("2026-06-30T10:00:00"));
    expect(ymdUtc(r2.from)).toBe("2025-07-01");
  });
  it("custom range is inclusive, swapped if reversed, capped at 400 days", () => {
    const r = periodRange("custom", w("2026-11-17T10:00:00"), { from: "2026-11-10", to: "2026-11-01" });
    expect([ymdUtc(r.from), ymdUtc(r.to)]).toEqual(["2026-11-01", "2026-11-11"]);
    const r2 = periodRange("custom", w("2026-11-17T10:00:00"), { from: "2020-01-01", to: "2026-11-01" });
    expect((r2.to.getTime() - r2.from.getTime()) / 86_400_000).toBe(401);
    const r3 = periodRange("custom", w("2026-11-17T10:00:00"), { from: "nonsense" });
    expect(ymdUtc(r3.from)).toBe("2026-10-19");
  });
  it("holidays parse both formats and report bad ones", () => {
    expect(parseHolidays("25/12/2026, 2026-12-26 31/02/2026 x")).toEqual({ dates: ["2026-12-25", "2026-12-26"], bad: ["31/02/2026", "x"] });
  });
  it("Sydney wall-clock now (AEDT, UTC+11 in November)", () => {
    expect(sydneyWallNow(new Date("2026-11-17T03:30:00Z")).toISOString()).toBe("2026-11-17T14:30:00.000Z");
  });
});

describe("same-weekday outlook", () => {
  const today = w("2026-11-17T10:00:00");
  it("averages the same weekday over 8 weeks", () => {
    const daily = new Map<string, number>();
    for (let k = 1; k <= 8; k++) daily.set(ymdUtc(new Date(Date.UTC(2026, 10, 17 - 7 * k))), 10 * k);
    const o = sameWeekdayOutlook(daily, today);
    expect(o[0].value).toBe(45);
    expect(o[0].basis).toBe(8);
  });
  it("not enough history → null", () => {
    const o = sameWeekdayOutlook(new Map(), today, { firstDay: w("2026-11-01T00:00:00") });
    expect(o[0].value).toBeNull();
  });
});
