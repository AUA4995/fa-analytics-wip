import { describe, expect, it } from "vitest";
import { ageBucket, anonName, balanceByMonth, cashBridge, classify, fyOf, gaugeTone, pnlByMonth, ratios } from "./calc";

const pnl = (month: string, rev: number) => [
  { month, accountId: "r", accountName: "Fulfilment fees", section: "Income", amount: rev, type: "REVENUE" },
  { month, accountId: "c", accountName: "Wages - warehouse", section: "Less Cost of Sales", amount: rev * 0.5, type: "DIRECTCOSTS" },
  { month, accountId: "o", accountName: "Rent", section: "Less Operating Expenses", amount: rev * 0.3, type: "OVERHEADS" },
  { month, accountId: "d", accountName: "Depreciation", section: "Less Operating Expenses", amount: 1000, type: "DEPRECIATN" },
  { month, accountId: "i", accountName: "Interest Expense", section: "Less Operating Expenses", amount: 500, type: "EXPENSE" },
];

describe("finance calculations", () => {
  it("classifies accounts by Xero type, then section", () => {
    expect(classify({ accountName: "Interest Income", section: "Other Income", type: "OTHERINCOME" })).toBe("other");
    expect(classify({ accountName: "Loan interest", section: "Less Operating Expenses", type: "EXPENSE" })).toBe("interest");
    expect(classify({ accountName: "Freight", section: "Less Cost of Sales" })).toBe("cos");
    expect(classify({ accountName: "Storage", section: "Trading Income" })).toBe("revenue");
  });
  it("P&L by month: gross, EBITDA and net", () => {
    const [m] = pnlByMonth(pnl("2026-09", 100000));
    expect(m).toMatchObject({ revenue: 100000, cos: 50000, gross: 50000, overheads: 30000, ebitda: 20000, dep: 1000, interest: 500, net: 18500 });
    expect(fyOf("2026-09")).toBe("FY27");
    expect(fyOf("2026-06")).toBe("FY26");
  });
  it("bank ratios need 12 months; debt service = principal + interest", () => {
    const months = pnlByMonth(Array.from({ length: 12 }, (_, i) => pnl(`2026-${String(i + 1).padStart(2, "0")}`, 100000)).flat());
    const bal = balanceByMonth([
      { month: "2026-12", accountName: "Business Account", section: "Bank", amount: 50000 },
      { month: "2026-12", accountName: "Accounts Receivable", section: "Current Assets", amount: 220000 },
      { month: "2026-12", accountName: "Accounts Payable", section: "Current Liabilities", amount: 110000 },
      { month: "2026-12", accountName: "GST", section: "Current Liabilities", amount: 20000 },
      { month: "2026-12", accountName: "Equipment loan", section: "Non-current Liabilities", amount: 300000 },
    ])[0];
    expect(bal).toMatchObject({ cash: 50000, receivables: 220000, payables: 110000, currentAssets: 270000, currentLiabilities: 130000, debt: 300000 });
    const r = ratios(months, bal, { balance: 300000, principal12: 60000 });
    expect(r.dscr).toBeCloseTo(240000 / 66000, 4);
    expect(r.debtToEbitda).toBeCloseTo(1.25, 4);
    expect(r.debtorDays).toBeCloseTo((200000 / 1200000) * 365, 4);
    expect(r.currentRatio).toBeCloseTo(270000 / 130000, 4);
    expect(ratios(months.slice(0, 6), bal, null).dscr).toBeNull();
    expect(gaugeTone("dscr", r.dscr)).toBe("green");
    expect(gaugeTone("dscr", 1.3)).toBe("amber");
    expect(gaugeTone("current", null)).toBe("grey");
  });
  it("cash bridge always lands on Xero's closing cash", () => {
    const [m] = pnlByMonth(pnl("2026-09", 100000));
    const open = { month: "2026-08", cash: 40000, receivables: 0, payables: 0, currentAssets: 140000, currentLiabilities: 60000, fixedAssets: 200000, debt: 100000, currentDebt: 0 };
    const close = { ...open, month: "2026-09", cash: 51000, currentAssets: 161000, fixedAssets: 204000, debt: 95000 };
    const steps = cashBridge(m, open, close);
    const sum = steps.filter((s) => s.kind === "step").reduce((a, s) => a + s.value, 0);
    expect(open.cash + sum).toBeCloseTo(close.cash, 6);
    expect(steps.find((s) => s.label === "Capex")!.value).toBe(-5000);
    expect(steps.find((s) => s.label === "Loan principal")!.value).toBe(-5000);
  });
  it("ageing buckets and hidden names", () => {
    const t = new Date("2026-10-23T00:00:00Z");
    expect([null, "2026-10-30", "2026-10-10", "2026-09-10", "2026-08-01", "2026-05-01"].map((d) => ageBucket(d ? new Date(d + "T00:00:00Z") : null, t))).toEqual([0, 0, 1, 2, 3, 4]);
    expect([0, 1, 25, 26].map(anonName)).toEqual(["Client A", "Client B", "Client Z", "Client AA"]);
  });
});
