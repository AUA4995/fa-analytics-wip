import { describe, expect, it } from "vitest";
import { exGst, monthOf, parsePnl } from "./sync";

describe("Xero P&L by month", () => {
  it("reads months from the header and one row per account per month, skipping totals", () => {
    const report = {
      Reports: [
        {
          Rows: [
            { RowType: "Header", Cells: [{ Value: "" }, { Value: "30 Sep 26" }, { Value: "31 Aug 26" }] },
            {
              RowType: "Section",
              Title: "Income",
              Rows: [
                { RowType: "Row", Cells: [{ Value: "Storage", Attributes: [{ Id: "account", Value: "acc-1" }] }, { Value: "1,250.50" }, { Value: "1000.00" }] },
                { RowType: "SummaryRow", Cells: [{ Value: "Total Income" }, { Value: "1250.50" }, { Value: "1000.00" }] },
              ],
            },
            {
              RowType: "Section",
              Title: "Less Operating Expenses",
              Rows: [{ RowType: "Row", Cells: [{ Value: "Rent", Attributes: [{ Id: "account", Value: "acc-2" }] }, { Value: "8000" }, { Value: "" }] }],
            },
          ],
        },
      ],
    };
    expect(parsePnl(report)).toEqual([
      { month: "2026-09", accountId: "acc-1", accountName: "Storage", section: "Income", amount: 1250.5 },
      { month: "2026-08", accountId: "acc-1", accountName: "Storage", section: "Income", amount: 1000 },
      { month: "2026-09", accountId: "acc-2", accountName: "Rent", section: "Less Operating Expenses", amount: 8000 },
      { month: "2026-08", accountId: "acc-2", accountName: "Rent", section: "Less Operating Expenses", amount: 0 },
    ]);
  });
  it("month labels", () => {
    expect(monthOf("30 Sep 26")).toBe("2026-09");
    expect(monthOf("Sep 2026")).toBe("2026-09");
    expect(monthOf("2026-09-30T00:00:00")).toBe("2026-09");
    expect(monthOf("Total")).toBeNull();
  });
  it("line amounts are ex GST", () => {
    expect(exGst({ LineAmount: 110 }, "Inclusive")).toBe(100);
    expect(exGst({ LineAmount: 100 }, "Exclusive")).toBe(100);
  });
});
