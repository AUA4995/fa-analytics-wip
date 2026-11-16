import { describe, expect, it } from "vitest";
import { SOURCES, sourceDef } from "./registry";

describe("not-connected sources", () => {
  it("every source says what it reads, what depends on it, what's used until then and what's needed", () => {
    expect(SOURCES.map((s) => s.key)).toEqual(["hub", "clm", "sales", "siena", "dyspach", "logiwa"]);
    for (const s of SOURCES) {
      expect(s.reads.length).toBeGreaterThan(10);
      expect(s.needs.length).toBeGreaterThan(10);
      expect(s.affects.length).toBeGreaterThan(0);
      for (const a of s.affects) expect(a.until).not.toBe("");
    }
    expect(sourceDef("clm").name).toMatch(/CLM/);
    expect(() => sourceDef("nope" as never)).toThrow();
  });
  it("HR data never includes staff names (CAR numbers and status only)", () => {
    expect(sourceDef("siena").reads).toMatch(/no staff names/);
  });
});
