import { describe, expect, it } from "vitest";
import { classifyRates, payslipHours, type XPayItems } from "./sync";

const items: XPayItems = {
  PayItems: {
    EarningsRates: [
      { EarningsRateID: "ord", Name: "Ordinary Hours", EarningsType: "ORDINARYTIMEEARNINGS", RateType: "RATEPERUNIT", TypeOfUnits: "Hours" },
      { EarningsRateID: "ot", Name: "Overtime 1.5x", EarningsType: "ORDINARYTIMEEARNINGS", RateType: "MULTIPLE" },
      { EarningsRateID: "km", Name: "Car allowance", EarningsType: "ALLOWANCE", RateType: "RATEPERUNIT", TypeOfUnits: "km" },
      { EarningsRateID: "bonus", Name: "Bonus", EarningsType: "ORDINARYTIMEEARNINGS", RateType: "FIXEDAMOUNT" },
    ],
  },
};
const lines = [
  { EarningsRateID: "ord", NumberOfUnits: 30 },
  { EarningsRateID: "ot", NumberOfUnits: 6 },
  { EarningsRateID: "km", NumberOfUnits: 120 },
  { EarningsRateID: "bonus", NumberOfUnits: 1 },
];

describe("payroll hours (batch 6)", () => {
  it("counts only hourly lines; allowances and fixed amounts are not hours", () => {
    expect(payslipHours(lines, classifyRates(items))).toEqual({ hours: 36, overtimeHours: 6 });
  });
  it("overtime is found by Xero type or by name", () => {
    const r = classifyRates(items)!;
    expect([...r.overtime]).toEqual(["ot"]);
  });
  it("no overtime rate in Xero → overtime unknown (no data), never 0", () => {
    const noOt: XPayItems = { PayItems: { EarningsRates: items.PayItems!.EarningsRates!.filter((x) => x.EarningsRateID !== "ot") } };
    expect(payslipHours([{ EarningsRateID: "ord", NumberOfUnits: 38 }], classifyRates(noOt))).toEqual({ hours: 38, overtimeHours: null });
  });
  it("pay items unreadable → hours and overtime unknown, never allowance units", () => {
    expect(payslipHours(lines, classifyRates(null))).toEqual({ hours: 0, overtimeHours: null });
  });
  it("free-text units: Hrs / Hr count as hours; no ordinary hourly rate → unknown, not 100% overtime", () => {
    const hrs: XPayItems = { PayItems: { EarningsRates: [{ EarningsRateID: "ord", Name: "Ordinary", RateType: "RATEPERUNIT", TypeOfUnits: "Hrs" }, { EarningsRateID: "ot", Name: "Overtime", RateType: "MULTIPLE" }] } };
    expect(payslipHours([{ EarningsRateID: "ord", NumberOfUnits: 30 }, { EarningsRateID: "ot", NumberOfUnits: 6 }], classifyRates(hrs))).toEqual({ hours: 36, overtimeHours: 6 });
    const none: XPayItems = { PayItems: { EarningsRates: [{ EarningsRateID: "ord", Name: "Ordinary", RateType: "RATEPERUNIT" }, { EarningsRateID: "ot", Name: "Overtime", RateType: "MULTIPLE" }] } };
    expect(payslipHours([{ EarningsRateID: "ord", NumberOfUnits: 30 }, { EarningsRateID: "ot", NumberOfUnits: 6 }], classifyRates(none))).toEqual({ hours: 0, overtimeHours: null });
  });
});
