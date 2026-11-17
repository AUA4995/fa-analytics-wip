import { describe, expect, it } from "vitest";
import { cleanSuggestion, columnShapes, shapeOf } from "./suggest";

describe("Claude column suggestions", () => {
  it("sends shapes, never values", () => {
    expect(shapeOf("2026-06-01")).toBe("9999-99-99");
    expect(shapeOf("Jane Smith, 12 High St")).toBe("AAAA AAAAA, 99 AAAA AA");
    const c = columnShapes(["Order", "Created"], [["SO-123", "2026-06-01"], ["SO-124", "2026-06-02"]]);
    expect(c).toEqual([
      { index: 0, name: "Order", shapes: ["AA-999"] },
      { index: 1, name: "Created", shapes: ["9999-99-99"] },
    ]);
    expect(JSON.stringify(c)).not.toMatch(/SO-123|2026/);
  });
  it("keeps only known fields and real columns, each column once", () => {
    expect(cleanSuggestion({ mapping: { orderRef: 0, date: 0, tenant: 7, units: "2", bogus: 1 } }, "ORDERS", 3)).toMatchObject({ orderRef: 0, date: null, tenant: null, units: null });
    expect(cleanSuggestion(null, "ORDERS", 3)).toMatchObject({ orderRef: null });
  });
});
