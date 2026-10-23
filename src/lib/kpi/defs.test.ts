import { describe, expect, it } from "vitest";
import { KPIS, fmtKpi, kpiStatus, workingDays } from "./defs";

describe("KPI rules", () => {
  it("status: within 3% green, 3–10% amber, beyond red; direction matters", () => {
    expect(kpiStatus(0.44, 0.45, "up")).toBe("green");
    expect(kpiStatus(0.42, 0.45, "up")).toBe("amber");
    expect(kpiStatus(0.38, 0.45, "up")).toBe("red");
    expect(kpiStatus(32, 30, "down")).toBe("amber");
    expect(kpiStatus(45, 30, "down")).toBe("red");
    expect(kpiStatus(20, 30, "down")).toBe("green");
    expect(kpiStatus(0, 0, "down")).toBe("green");
    expect(kpiStatus(120, 0, "down")).toBe("red");
    expect(kpiStatus(null, 30, "down")).toBe("none");
    expect(kpiStatus(30, null, "down")).toBe("none");
  });
  it("working days and formats", () => {
    expect(workingDays("2026-09")).toBe(22);
    expect(workingDays("2026-02")).toBe(20);
    expect(fmtKpi(0.123, "pct", 1)).toBe("12.3%");
    expect(fmtKpi(null, "money")).toBe("—");
  });
  it("every KPI has a unique id, a formula and a source", () => {
    expect(new Set(KPIS.map((k) => k.id)).size).toBe(KPIS.length);
    for (const k of KPIS) expect(k.formula && k.source).toBeTruthy();
  });
});
