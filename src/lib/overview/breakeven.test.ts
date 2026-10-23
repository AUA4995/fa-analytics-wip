import { describe, expect, it } from "vitest";
import { breakEven } from "./breakeven";

const m = (rev: number) => ({ month: "2026-09", revenue: rev, other: 0, cos: rev * 0.5, gross: rev * 0.5, overheads: 150000, ebitda: 0, dep: 0, interest: 5000, tax: 0, net: 0 });
describe("break-even (provisional split)", () => {
  it("fixed ÷ contribution margin, and in orders", () => {
    const b = breakEven([m(400000), m(400000), m(400000)], 8000)!;
    expect(b.cmPct).toBeCloseTo(0.5);
    expect(b.beRevenue).toBeCloseTo(310000);
    expect(b.headroom).toBeCloseTo(90000);
    expect(b.beOrders).toBeCloseTo(6200);
  });
  it("no data → null; no orders → no order figure", () => {
    expect(breakEven([], 100)).toBeNull();
    expect(breakEven([m(400000)], null)!.beOrders).toBeNull();
  });
});
