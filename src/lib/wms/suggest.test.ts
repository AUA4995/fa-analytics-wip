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
  it("masks every alphabet and digit system, and hides column names that look like data", async () => {
    const { looksLikeHeader } = await import("./suggest");
    for (const v of ["王小明", "Иван Петров", "José Ñúñez, 12 Rue Élysée", "４５６７", "Müller"]) expect(shapeOf(v)).toMatch(/^[A9 \-_/.:,@#()+&?]*$/);
    expect(shapeOf("José Ñúñez")).toBe("AAAA AAAAA");
    for (const h of ["Order No", "Address 2", "Created (AEST)", "Qty", "SKU", "Tenant_ID"]) expect(looksLikeHeader(h), h).toBe(true);
    for (const h of ["John Smith 12 George St 2000", "jane@x.com", "2026-06-01", "SO-12345", "Иван", "12 High St"]) expect(looksLikeHeader(h), h).toBe(false);
    const c = columnShapes(["jane@x.com", "Qty"], [["a@b.c", "3"]]);
    expect(c[0].name).toBe("(hidden: AAAA@A.AAA)");
    expect(JSON.stringify(c)).not.toMatch(/jane/);
  });
  it("keeps only known fields and real columns, each column once", () => {
    expect(cleanSuggestion({ mapping: { orderRef: 0, date: 0, tenant: 7, units: "2", bogus: 1 } }, "ORDERS", 3)).toMatchObject({ orderRef: 0, date: null, tenant: null, units: null });
    expect(cleanSuggestion(null, "ORDERS", 3)).toMatchObject({ orderRef: null });
  });
});
