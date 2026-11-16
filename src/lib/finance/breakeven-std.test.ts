import { describe, expect, it } from "vitest";
import { breakEvenStd, highLow, type StdRow } from "./breakeven-std";

const row = (month: string, accountId: string, accountName: string, section: string, amount: number, type: string, accountCode = accountId): StdRow => ({ month, accountId, accountCode, accountName, section, amount, type });
const months = ["2026-07", "2026-08", "2026-09"];
const rows: StdRow[] = months.flatMap((m, i) => [
  row(m, "200", "Fulfilment income", "Income", [100_000, 120_000, 110_000][i], "REVENUE"),
  row(m, "210", "Postage income", "Income", 20_000, "REVENUE"),
  row(m, "310", "Postage costs", "Less Cost of Sales", 16_000, "DIRECTCOSTS"),
  row(m, "400", "Rent", "Less Operating Expenses", 30_000, "OVERHEADS"),
  row(m, "410", "Electricity", "Less Operating Expenses", [5_400, 5_800, 5_600][i], "OVERHEADS"),
  row(m, "420", "Logiwa", "Less Operating Expenses", 8_000, "OVERHEADS"),
  row(m, "430", "Depreciation", "Less Operating Expenses", 2_000, "DEPRECIATN"),
  row(m, "440", "Interest received", "Other Income", 500, "OTHERINCOME"),
  row(m, "450", "Income tax", "Less Operating Expenses", 1_000, "EXPENSE"),
]);

describe("break-even, standard cost behaviour", () => {
  it("by section: cost of sales (postage) variable, overheads + depreciation fixed, other income lowers fixed, tax left out", () => {
    const be = breakEvenStd(rows, months, {}, null)!;
    expect(be.revenue).toBeCloseTo(130_000, 6); // processing + postage (marked up → revenue)
    expect(be.variable).toBeCloseTo(16_000, 6);
    expect(be.fixed).toBeCloseTo(30_000 + 5_600 + 8_000 + 2_000 - 500, 6);
    expect(be.cmPct).toBeCloseTo(114_000 / 130_000, 9);
    expect(be.beRevenue).toBeCloseTo(45_100 / (114_000 / 130_000), 6);
    expect(be.overridden).toBe(0);
  });
  it("semi-variable accounts are split by high-low against revenue; step counts as fixed", () => {
    const be = breakEvenStd(rows, months, { "410": "SEMI", "420": "STEP" }, 13_000)!;
    // electricity: highest revenue month 140k → 5,800; lowest 120k → 5,400 → b = 400 ÷ 20,000 = 0.02 per $ of revenue
    expect(be.semi[0].b).toBeCloseTo(0.02, 9);
    expect(be.semi[0].variable).toBeCloseTo(0.02 * 130_000, 6);
    expect(be.semi[0].fixed).toBeCloseTo(5_600 - 2_600, 6);
    expect(be.variable).toBeCloseTo(16_000 + 2_600, 6);
    expect(be.fixed).toBeCloseTo(30_000 + 3_000 + 8_000 + 2_000 - 500, 6);
    expect(be.overridden).toBe(2);
    expect(be.revenuePerOrder).toBeCloseTo(10, 9);
  });
  it("high-low edge cases fall back to fixed with a note", () => {
    const rev = new Map([["a", 100], ["b", 100]]);
    expect(highLow("x", ["a", "b"], rev, new Map([["a", 5], ["b", 6]]), 100, 5.5)).toMatchObject({ b: null, fixed: 5.5, note: "revenue didn't change — treated as fixed" });
    const rev2 = new Map([["a", 100], ["b", 200]]);
    expect(highLow("x", ["a", "b"], rev2, new Map([["a", 9], ["b", 5]]), 150, 7)).toMatchObject({ fixed: 7, variable: 0 });
    expect(highLow("x", ["a"], rev2, new Map([["a", 9]]), 100, 9).note).toMatch(/fewer than 2/);
  });
  it("no rows → null", () => {
    expect(breakEvenStd([], months, {}, null)).toBeNull();
  });
});
