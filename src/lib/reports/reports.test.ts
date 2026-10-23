import { describe, expect, it } from "vitest";
import { periodRange, previous, seasonalForecast } from "./data";
import { businessDayOfMonth, isDue, sydneyParts } from "./send";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("report periods", () => {
  it("last complete week / month / quarter / year", () => {
    const now = d("2026-10-22"); // Thursday
    expect(periodRange("WEEK", now)).toMatchObject({ from: d("2026-10-12"), to: d("2026-10-19") });
    expect(periodRange("MONTH", now)).toMatchObject({ from: d("2026-09-01"), to: d("2026-10-01"), label: "September 2026" });
    const q = periodRange("QUARTER", now);
    expect(q).toMatchObject({ from: d("2026-07-01"), to: d("2026-10-01") });
    expect(q.label).toMatch(/^Q1 FY27/);
    expect(periodRange("YEAR", now)).toMatchObject({ from: d("2025-10-01"), to: d("2026-10-01") });
    expect(previous("QUARTER", q)).toMatchObject({ from: d("2026-04-01"), to: d("2026-07-01") });
  });
  it("forecast needs 24 full months and is never made up", () => {
    expect(seasonalForecast(Array(23).fill(100), 3)).toBeNull();
    expect(seasonalForecast([0, ...Array(23).fill(100)], 3)).toBeNull();
    const s = [...Array(12).fill(100), ...Array(12).fill(110)];
    s[12] = 220; // a peak month last year
    const f = seasonalForecast(s, 2)!;
    const g = s.slice(12).reduce((a, b) => a + b, 0) / 1200;
    expect(f[0].value).toBe(Math.round(220 * g));
    expect(f[0].low).toBeLessThan(f[0].value);
    expect(f[1].value).toBe(Math.round(110 * g));
  });
});

describe("report schedule", () => {
  it("business days and due dates", () => {
    expect(businessDayOfMonth(d("2026-11-02"))).toBe(1); // Mon 2 Nov (1 Nov is Sunday)
    expect(isDue("MONTHLY", d("2026-11-02"))).toBe(true);
    expect(isDue("MONTHLY", d("2026-11-01"))).toBe(false); // Sunday
    expect(isDue("WEEKLY", d("2026-10-26"))).toBe(true);
    expect(isDue("WEEKLY", d("2026-10-27"))).toBe(false);
    expect(isDue("QUARTERLY", d("2027-01-07"))).toBe(true); // 5th business day of January
    expect(isDue("QUARTERLY", d("2026-11-06"))).toBe(false); // not a quarter month
    expect(isDue("OFF", d("2026-11-02"))).toBe(false);
  });
  it("Sydney day and hour", () => {
    expect(sydneyParts(new Date("2026-10-22T21:30:00Z"))).toMatchObject({ ymd: "2026-10-23", hour: 8 }); // AEDT +11
    expect(sydneyParts(new Date("2026-06-30T23:00:00Z"))).toMatchObject({ ymd: "2026-07-01", hour: 9 }); // AEST +10
  });
});

describe("PDF text", () => {
  it("swaps symbols the built-in fonts can't draw", async () => {
    const { pdfSafe } = await import("./pdf");
    expect(pdfSafe("▲ 30.6% vs previous · ≤ 20 units")).toBe("+30.6% vs previous · <= 20 units");
    expect(pdfSafe("▼ 2.1% — ok")).toBe("-2.1% — ok");
  });
});
