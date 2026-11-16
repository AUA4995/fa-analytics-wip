import { classify, type PnlIn } from "./calc";

/**
 * Break-even by the standard cost-behaviour method (batch 3, 16/11/2026 — replaces the provisional split).
 * Every P&L account is fixed, variable, semi-variable or step:
 *   • default by section: cost of sales (incl. postage — it's re-billed with a mark-up) = variable;
 *     overheads, depreciation and interest = fixed; other income reduces fixed costs; income tax is left out
 *   • set per account in Settings → Mapping (Break-even behaviour)
 *   • semi-variable accounts are split with the high-low method over the last 12 months against revenue:
 *       variable rate b = (cost in the highest-revenue month − cost in the lowest) ÷ (highest revenue − lowest)
 *       fixed part = average cost − b × average revenue
 *   • step costs (e.g. the Logiwa plan) count as fixed until their capacity is passed (credit tracker shows that)
 *   contribution margin % = (revenue − variable) ÷ revenue; break-even revenue = fixed ÷ contribution margin %
 */

export type Behaviour = "FIXED" | "VARIABLE" | "SEMI" | "STEP";

export interface StdRow extends PnlIn {
  accountCode?: string | null;
}

export interface SemiSplit {
  account: string;
  b: number | null;
  variable: number;
  fixed: number;
  note: string;
}

export interface BreakEvenStd {
  months: number;
  revenue: number;
  variable: number;
  fixed: number;
  cmPct: number | null;
  beRevenue: number | null;
  headroom: number | null;
  revenuePerOrder: number | null;
  beOrders: number | null;
  orders: number | null;
  semi: SemiSplit[];
  /** Accounts set by hand (not by section) */
  overridden: number;
}

/**
 * @param rows   P&L rows of the last 12 months (or fewer)
 * @param avgMonths the months to average for the result (e.g. the last 3)
 * @param behaviour accountCode → behaviour set in Settings (others by section)
 */
export function breakEvenStd(rows: readonly StdRow[], avgMonths: readonly string[], behaviour: Record<string, Behaviour>, ordersPerMonth: number | null): BreakEvenStd | null {
  if (!rows.length || !avgMonths.length) return null;
  const avgSet = new Set(avgMonths);
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const revByMonth = new Map<string, number>();
  for (const r of rows) if (classify(r) === "revenue") revByMonth.set(r.month, (revByMonth.get(r.month) ?? 0) + r.amount);
  const n = avgMonths.length;
  const revenue = avgMonths.reduce((a, m) => a + (revByMonth.get(m) ?? 0), 0) / n;

  // group cost accounts
  const accounts = new Map<string, { name: string; code: string | null; line: ReturnType<typeof classify>; byMonth: Map<string, number> }>();
  for (const r of rows) {
    const line = classify(r);
    if (line === "revenue" || line === "tax") continue;
    const key = r.accountId;
    const a = accounts.get(key) ?? { name: r.accountName, code: r.accountCode ?? null, line, byMonth: new Map() };
    a.byMonth.set(r.month, (a.byMonth.get(r.month) ?? 0) + r.amount);
    accounts.set(key, a);
  }

  let variable = 0;
  let fixed = 0;
  let overridden = 0;
  const semi: SemiSplit[] = [];
  for (const a of accounts.values()) {
    const avg = avgMonths.reduce((s, m) => s + (a.byMonth.get(m) ?? 0), 0) / n;
    if (a.line === "other") {
      fixed -= avg; // other income lowers the fixed costs to cover
      continue;
    }
    const set = a.code ? behaviour[a.code] : undefined;
    if (set) overridden++;
    const b = set ?? (a.line === "cos" ? "VARIABLE" : "FIXED");
    if (b === "VARIABLE") variable += avg;
    else if (b === "FIXED" || b === "STEP") fixed += avg;
    else {
      const split = highLow(a.name, months, revByMonth, a.byMonth, revenue, avg);
      semi.push(split);
      variable += split.variable;
      fixed += split.fixed;
    }
  }
  void avgSet;
  const cmPct = revenue ? (revenue - variable) / revenue : null;
  const beRevenue = cmPct && cmPct > 0 ? fixed / cmPct : null;
  const rpo = ordersPerMonth ? revenue / ordersPerMonth : null;
  return { months: n, revenue, variable, fixed, cmPct, beRevenue, headroom: beRevenue != null ? revenue - beRevenue : null, revenuePerOrder: rpo, beOrders: beRevenue != null && rpo ? beRevenue / rpo : null, orders: ordersPerMonth, semi, overridden };
}

/** High-low split of one semi-variable account (over all months given) applied to the averages. */
export function highLow(account: string, months: readonly string[], rev: Map<string, number>, cost: Map<string, number>, avgRevenue: number, avgCost: number): SemiSplit {
  const pts = months.filter((m) => rev.has(m)).map((m) => ({ r: rev.get(m) ?? 0, c: cost.get(m) ?? 0 }));
  if (pts.length < 2) return { account, b: null, variable: 0, fixed: avgCost, note: "fewer than 2 months — treated as fixed" };
  const hi = pts.reduce((a, p) => (p.r > a.r ? p : a));
  const lo = pts.reduce((a, p) => (p.r < a.r ? p : a));
  if (hi.r === lo.r) return { account, b: null, variable: 0, fixed: avgCost, note: "revenue didn't change — treated as fixed" };
  const b = (hi.c - lo.c) / (hi.r - lo.r);
  if (b <= 0) return { account, b, variable: 0, fixed: avgCost, note: "cost didn't rise with revenue — treated as fixed" };
  const variable = Math.min(avgCost, b * avgRevenue);
  return { account, b, variable, fixed: avgCost - variable, note: b * avgRevenue > avgCost ? "variable part capped at the cost" : "high-low" };
}
