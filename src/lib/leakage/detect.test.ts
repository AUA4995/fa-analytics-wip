import { describe, expect, it } from "vitest";
import { compareService, isoWeek, weekMonday, weeklyMinimumFindings } from "./detect";

describe("leakage detection", () => {
  it("under-billing: volume × rate vs billed, tolerance respected, working shows the numbers", () => {
    const f = compareService({ clientId: "c", month: "2026-09", code: "PCK-UNIT", name: "Pick", unit: "unit", qty: 1000, rate: 0.45, billed: 400, invoices: ["INV-1", "INV-2"], tolerance: 5 });
    expect(f).toMatchObject({ expected: 450, billed: 400, gap: 50, key: "UNDER_BILLING|c|PCK-UNIT|2026-09" });
    expect(f!.working).toContain("1,000 units (WMS) × $0.45 (rate) = $450.00");
    expect(f!.working).toContain("INV-1, INV-2");
    expect(compareService({ clientId: "c", month: "2026-09", code: "X", name: "X", unit: "unit", qty: 10, rate: 1, billed: 6, invoices: [], tolerance: 5 })).toBeNull();
  });
  it("ISO weeks and their Mondays", () => {
    expect(isoWeek(new Date("2026-09-07T00:00:00Z"))).toBe("2026-W37");
    expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(weekMonday("2026-W37")).toBe("2026-09-07");
    expect(weekMonday("2026-W01")).toBe("2025-12-29");
  });
  it("weekly minimum: week totals under the minimum without a top-up, after the levy period", () => {
    const fs = weeklyMinimumFindings({
      clientId: "c",
      minimum: 300,
      levyUntil: "2026-09-06",
      tolerance: 5,
      invoices: [
        { number: "INV-0", date: "2026-09-03", total: 10, hasTopUp: false }, // in the levy period
        { number: "INV-1", date: "2026-09-08", total: 210, hasTopUp: false },
        { number: "INV-2", date: "2026-09-15", total: 140, hasTopUp: true },
        { number: "INV-3", date: "2026-09-22", total: 298, hasTopUp: false }, // within tolerance
      ],
    });
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ period: "2026-W37", billed: 210, gap: 90 });
    expect(fs[0].working).toContain("top-up $90.00");
  });
});
