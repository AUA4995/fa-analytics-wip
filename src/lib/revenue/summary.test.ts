import { describe, expect, it } from "vitest";
import { caseResult, periods, summarise, type CaseIn } from "./summary";

const c = (date: string, kind: string, before: number | null, after: number | null, pending: string | null = null, status = "OPEN"): CaseIn => ({ date: new Date(`${date}T00:00:00Z`), kind, amountBefore: before, amountAfter: after, pending, status });

describe("revenue protection sums", () => {
  it("result = before − after; nothing when a figure is missing", () => {
    expect(caseResult({ amountBefore: 4000, amountAfter: 1400 })).toBe(2600);
    expect(caseResult({ amountBefore: 1050, amountAfter: 1440 })).toBe(-390);
    expect(caseResult({ amountBefore: 4000, amountAfter: null })).toBeNull();
  });
  it("adds cost avoided, recovered (cases + leakage log) and losses; counts provisional and missing", () => {
    const cases = [
      c("2026-11-09", "COST_AVOIDED", 4000, 1400, "NZ delivery"),
      c("2026-11-10", "LOSS", 1050, 1440, "kits completed"),
      c("2026-11-11", "RECOVERED", 500, 0, null, "CLOSED"),
      c("2026-11-12", "COST_AVOIDED", null, 100),
      c("2026-10-01", "COST_AVOIDED", 9999, 0),
    ];
    const s = summarise(cases, 120.5, new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));
    expect(s).toEqual({ avoided: 2600, losses: -390, recoveredCases: 500, recoveredLeakage: 120.5, protectedNet: 2830.5, cases: 4, provisional: 2, noResult: 1 });
  });
  it("a 'loss' that came out positive isn't counted as a gain", () => {
    expect(summarise([c("2026-11-10", "LOSS", 1500, 1440)], 0, new Date("2026-11-01"), new Date("2026-12-01")).losses).toBe(0);
  });
  it("periods: Sydney week from Monday, month, financial year from July", () => {
    const p = periods(new Date("2026-11-16T01:00:00Z")); // Mon 16/11 12:00 AEDT
    expect(p.week.from.toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(p.month.from.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(p.fy.from.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(p.fy.label).toBe("FY27");
    expect(periods(new Date("2026-11-15T12:00:00Z")).week.from.toISOString().slice(0, 10)).toBe("2026-11-09"); // Sun 23:00
  });
});
