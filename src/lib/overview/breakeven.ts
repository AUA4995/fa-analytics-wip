import type { Month } from "@/lib/finance/calc";

/**
 * Break-even (Mark's key ask). PROVISIONAL split until agreed with Mark (brief §15): cost of services = variable
 * (moves with revenue), overheads + interest = fixed. Averages of the last `n` months of the Xero P&L.
 *   contribution margin % = (revenue − cost of services) ÷ revenue
 *   break-even revenue    = fixed costs ÷ contribution margin %
 *   break-even orders     = break-even revenue ÷ revenue per order
 */
export interface BreakEven {
  months: number;
  revenue: number;
  variable: number;
  fixed: number;
  cmPct: number | null;
  beRevenue: number | null;
  /** Revenue above break-even (negative = below) */
  headroom: number | null;
  revenuePerOrder: number | null;
  beOrders: number | null;
  orders: number | null;
}

export function breakEven(last: Month[], ordersPerMonth: number | null): BreakEven | null {
  if (!last.length) return null;
  const n = last.length;
  const avg = (f: (m: Month) => number) => last.reduce((a, m) => a + f(m), 0) / n;
  const revenue = avg((m) => m.revenue);
  const variable = avg((m) => m.cos);
  const fixed = avg((m) => m.overheads + m.interest - m.other);
  const cmPct = revenue ? (revenue - variable) / revenue : null;
  const beRevenue = cmPct && cmPct > 0 ? fixed / cmPct : null;
  const rpo = ordersPerMonth ? revenue / ordersPerMonth : null;
  return { months: n, revenue, variable, fixed, cmPct, beRevenue, headroom: beRevenue != null ? revenue - beRevenue : null, revenuePerOrder: rpo, beOrders: beRevenue != null && rpo ? beRevenue / rpo : null, orders: ordersPerMonth };
}
