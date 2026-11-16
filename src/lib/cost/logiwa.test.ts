import { describe, expect, it } from "vitest";
import { contractYear, creditsForOrder, project } from "./logiwa";

describe("Logiwa credits", () => {
  it("one credit per order up to 25 unique lines, then one more per 25", () => {
    expect(creditsForOrder(0, 25)).toBe(1);
    expect(creditsForOrder(1, 25)).toBe(1);
    expect(creditsForOrder(25, 25)).toBe(1);
    expect(creditsForOrder(26, 25)).toBe(2);
    expect(creditsForOrder(51, 25)).toBe(3);
  });
  it("contract year from the start month; last 12 months when not set", () => {
    const now = new Date("2026-11-16T00:00:00Z");
    expect(contractYear(7, now)).toMatchObject({ label: "2026-07 → 2027-06" });
    expect(contractYear(12, now).from.toISOString().slice(0, 7)).toBe("2025-12");
    expect(contractYear(null, now).from.toISOString().slice(0, 7)).toBe("2025-11");
  });
  it("projects the year and the credits over the plan", () => {
    expect(project(800_000, 70_000)).toEqual({ projectedYear: 840_000, projectedOver: 40_000 });
    expect(project(800_000, 60_000)).toEqual({ projectedYear: 720_000, projectedOver: 0 });
    expect(project(800_000, null)).toEqual({ projectedYear: null, projectedOver: null });
  });
});
