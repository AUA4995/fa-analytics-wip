import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJson, groundedNumber, numberInText, numbersIn, parseStrict } from "./json";

describe("AI JSON parsing", () => {
  it("extracts JSON from plain, fenced and chatty replies", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure! Here it is: {"a":{"b":3}} hope that helps')).toEqual({ a: { b: 3 } });
    expect(() => extractJson("no json here")).toThrow(/No JSON/);
  });
  it("parses strictly against the schema with a readable reason", () => {
    const s = z.object({ category: z.enum(["x", "y"]), confidence: z.number().min(0).max(1) });
    expect(parseStrict('{"category":"x","confidence":0.9}', s)).toEqual({ category: "x", confidence: 0.9 });
    expect(() => parseStrict('{"category":"z","confidence":2}', s)).toThrow(/category.*confidence|schema/);
    expect(() => parseStrict("{oops", s)).toThrow(/Not valid JSON/);
  });
  it("keeps numbers only when they are written in the source", () => {
    const src = "Invoice BL-8840 for $4,312.55 — please credit 4 pallets (28 billed, 24 used). Total 1388.69";
    expect(numberInText(4312.55, src)).toBe(true);
    expect(numberInText(1388.69, src)).toBe(true);
    expect(numberInText(4, src)).toBe(true);
    expect(numberInText(412.5, src)).toBe(false);
    expect(numberInText(43, src)).toBe(false);
    expect(numberInText(12.55, src)).toBe(false);
    expect(groundedNumber(999, src)).toBeNull();
    expect(groundedNumber(null, src)).toBeNull();
    expect(numberInText(300, "weekly minimum $300.00 top-up")).toBe(true);
    expect(numbersIn("Owed $12,300.50 across 4 clients, 80% current")).toEqual([12300.5, 4, 80]);
  });
});
