import { describe, expect, it } from "vitest";
import { formatFieldValue, inputFieldValue, parseFieldValue, sameValue, type FieldSpec } from "./fields";
import { ENTITY_FIELDS, RULES } from "./specs";
import { parseCsv } from "./csv";

const pct: FieldSpec = { label: "Utilisation", kind: "pct", min: 10, max: 100 };

describe("editable values", () => {
  it("percent is typed as 85 and stored as 0.85, with bounds", () => {
    expect(parseFieldValue(pct, "85")).toEqual({ ok: true, value: 0.85 });
    expect(parseFieldValue(pct, "85%")).toEqual({ ok: true, value: 0.85 });
    expect(parseFieldValue(RULES.payrollTaxRate, "5.45")).toEqual({ ok: true, value: 0.0545 });
    expect(parseFieldValue(pct, "120")).toMatchObject({ ok: false });
    expect(parseFieldValue(pct, "")).toMatchObject({ ok: false });
    expect(formatFieldValue(pct, 0.85)).toBe("85%");
    expect(inputFieldValue(pct, 0.0545)).toBe("5.45");
  });
  it("money, int, dates (DD/MM/YYYY), lists, selects and drivers", () => {
    expect(parseFieldValue({ label: "Rent", kind: "money" }, "$12,500.50")).toEqual({ ok: true, value: 12500.5 });
    expect(formatFieldValue({ label: "Rent", kind: "money" }, 300)).toBe("$300.00");
    expect(parseFieldValue({ label: "B2B", kind: "int" }, "20.5")).toMatchObject({ ok: false });
    expect(parseFieldValue({ label: "D", kind: "date" }, "31/05/2027")).toEqual({ ok: true, value: "2027-05-31" });
    expect(parseFieldValue({ label: "D", kind: "date" }, "31/02/20x7")).toMatchObject({ ok: false });
    expect(formatFieldValue({ label: "D", kind: "date" }, new Date("2027-05-31T00:00:00Z"))).toBe("31/05/2027");
    expect(parseFieldValue({ label: "Codes", kind: "list", optional: true }, "SYD01, SYD02, SYD01")).toEqual({ ok: true, value: ["SYD01", "SYD02"] });
    expect(parseFieldValue(ENTITY_FIELDS.client.status, "PAUSED")).toMatchObject({ ok: false });
    expect(parseFieldValue(ENTITY_FIELDS.service.overheads, "equip=1, automation_cmc=0.5")).toEqual({ ok: true, value: { equip: 1, automation_cmc: 0.5 } });
    expect(parseFieldValue(ENTITY_FIELDS.service.overheads, "equip one")).toMatchObject({ ok: false });
    expect(parseFieldValue({ label: "x", kind: "number", optional: true }, "")).toEqual({ ok: true, value: null });
  });
  it("compares Decimal-like values with plain numbers", () => {
    expect(sameValue({ toNumber: () => 0.85 }, 0.85)).toBe(true);
    expect(sameValue(["a"], ["a"])).toBe(true);
    expect(sameValue(1, 2)).toBe(false);
  });
  it("rule defaults are the brief's numbers", () => {
    expect(RULES.marginFloor.default).toBe(0.15);
    expect(RULES.tolerance.default).toBe(5);
    expect(RULES.weeklyMinimum.default).toBe(300);
    expect(RULES.b2bUnits.default).toBe(20);
    expect(RULES.superRate.default).toBe(0.12);
    expect(RULES.payrollTaxRate.default).toBe(0.0545);
    expect(RULES.workersCompRate.default).toBeNull();
  });
});

describe("CSV", () => {
  it("parses quotes, doubled quotes, CRLF and tabs", () => {
    expect(parseCsv('code,name\r\nPCK-UNIT,"Pick, per unit"\r\nX,"say ""hi"""\n')).toEqual([["code", "name"], ["PCK-UNIT", "Pick, per unit"], ["X", 'say "hi"']]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});
