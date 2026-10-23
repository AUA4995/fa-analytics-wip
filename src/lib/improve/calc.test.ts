import { describe, expect, it } from "vitest";
import { calcSaving, proposeBlocks, proposeSteps, stepState, suggestPeople } from "./calc";

describe("improvements", () => {
  it("proposes blocks from what changes, prefilled where the app knows the figure", () => {
    const b = proposeBlocks(["process", "materials", "supplier"], { ordersPerMonth: 9000, costPerMinute: 0.62, supplierPrice: 0.31, supplierQty: 12000 });
    expect(b.map((x) => x.kind)).toEqual(["minutes", "price", "materials"]);
    expect(b[0].inputs).toMatchObject({ volume: 9000, costPerMinute: 0.62, before: null });
    expect(b[1].inputs).toMatchObject({ before: 0.31, qty: 12000 });
  });
  it("saving per month, payback, and missing inputs never guessed", () => {
    const r = calcSaving([
      { kind: "minutes", inputs: { before: 2.2, after: 1.6, volume: 9000, costPerMinute: 0.6 } },
      { kind: "price", inputs: { before: 0.31, after: 0.22, qty: 12000 } },
      { kind: "materials", inputs: { before: 0.4, after: null, orders: 9000 } },
      { kind: "investment", inputs: { amount: 12000 } },
    ]);
    expect(r.monthly).toBeCloseTo(0.6 * 9000 * 0.6 + 0.09 * 12000, 6);
    expect(r.paybackMonths).toBeCloseTo(12000 / r.monthly!, 6);
    expect(r.missing).toEqual(["Materials per order: Materials $ per order after"]);
    expect(r.lines[0].working).toContain("(2.2 − 1.6 min) × 9,000");
    expect(calcSaving([]).monthly).toBeNull();
  });
  it("standard plan has a 'measure after' step; people suggested by position", () => {
    expect(proposeSteps("workflow", "Packing").some((s) => s.kind === "measure_after")).toBe(true);
    const staff = [
      { name: "Paul", position: "Operations Manager", site: "smi", pool: "admin" },
      { name: "Neil", position: "Warehouse Manager", site: "smi", pool: "floor" },
      { name: "Ana", position: "Packer", site: "smi", pool: "floor" },
      { name: "Bo", position: "Packer", site: "par", pool: "floor" },
      { name: "Cy", position: "Picker", site: "smi", pool: "floor" },
    ];
    expect(suggestPeople(staff, "workflow", "Packing", "Automated (CMC)")).toEqual(["Paul", "Neil", "Ana"]);
  });
  it("late steps", () => {
    const t = new Date("2026-10-23T00:00:00Z");
    expect(stepState({ status: "IN_PROGRESS", due: new Date("2026-10-20T00:00:00Z") }, t)).toBe("late");
    expect(stepState({ status: "DONE", due: new Date("2026-10-20T00:00:00Z") }, t)).toBe("done");
    expect(stepState({ status: "NOT_STARTED", due: new Date("2026-10-30T00:00:00Z") }, t)).toBe("not started");
  });
});
