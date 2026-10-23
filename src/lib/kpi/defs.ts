/**
 * KPI definitions (brief §9). Pure: no database. A KPI without a data source is listed with what it needs — never a
 * made-up number. Targets are rules (`kpi_<id>`) edited in Settings → Rules.
 */

export type KpiGroup = "operations" | "people" | "finance" | "warehouse" | "quality";
export type KpiUnit = "num" | "money" | "pct" | "days" | "x";

export interface KpiDef {
  id: string;
  group: KpiGroup;
  label: string;
  unit: KpiUnit;
  dp?: number;
  better: "up" | "down";
  /** Has a Smithfield / Parramatta split */
  bySite?: boolean;
  /** Has a per-client split */
  byClient?: boolean;
  formula: string;
  source: string;
  /** Set when the data isn't available yet */
  needs?: string;
  defaultTarget: number | null;
}

export const GROUPS: Array<[KpiGroup, string]> = [
  ["operations", "Operations"],
  ["people", "People"],
  ["finance", "Finance"],
  ["warehouse", "Warehouse"],
  ["quality", "Quality & clients"],
];

export const KPIS: KpiDef[] = [
  { id: "ordersPerDay", group: "operations", label: "Orders per working day", unit: "num", better: "up", bySite: true, byClient: true, formula: "Orders shipped ÷ working days (Mon–Fri) in the month", source: "WMS orders", defaultTarget: null },
  { id: "cutoff", group: "operations", label: "Dispatched before cut-off", unit: "pct", better: "up", formula: "Orders dispatched before the courier cut-off ÷ orders", source: "WMS dispatch times", needs: "WMS dispatch timestamps (Thomax API)", defaultTarget: 0.98 },
  { id: "dockToStock", group: "operations", label: "Dock-to-stock", unit: "days", dp: 1, better: "down", formula: "Average time from receipt to put-away", source: "WMS receipts", needs: "WMS receipt and put-away times (Thomax API)", defaultTarget: 1 },
  { id: "returns48", group: "operations", label: "Returns processed in 48 h", unit: "pct", better: "up", formula: "Returns processed within 48 hours ÷ returns", source: "WMS returns", needs: "WMS returns with timestamps (Thomax API)", defaultTarget: 0.95 },

  { id: "unitsPerHour", group: "people", label: "Units picked per floor hour", unit: "num", dp: 1, better: "up", bySite: true, formula: "Units on shipped orders ÷ paid floor hours", source: "WMS orders + Xero Payroll hours (floor staff)", defaultTarget: null },
  { id: "ordersPerHour", group: "people", label: "Orders per labour hour", unit: "num", dp: 2, better: "up", bySite: true, formula: "Orders ÷ paid floor hours", source: "WMS orders + Xero Payroll hours (floor staff)", defaultTarget: null },
  { id: "labourPerOrder", group: "people", label: "Labour cost per order", unit: "money", dp: 2, better: "down", bySite: true, formula: "Floor pay (gross + super + payroll tax) ÷ orders", source: "Xero Payroll + WMS orders", defaultTarget: null },
  { id: "overtime", group: "people", label: "Overtime share", unit: "pct", better: "down", formula: "Overtime hours ÷ paid hours", source: "Xero Payroll earnings lines", needs: "overtime earnings lines from Xero Payroll (next payroll read)", defaultTarget: 0.05 },

  { id: "grossMargin", group: "finance", label: "Gross margin", unit: "pct", dp: 1, better: "up", formula: "(Revenue − cost of services) ÷ revenue", source: "Xero P&L", defaultTarget: 0.45 },
  { id: "costPerOrder", group: "finance", label: "Full cost per order", unit: "money", dp: 2, better: "down", formula: "(Cost of services + overheads) ÷ orders", source: "Xero P&L + WMS orders", defaultTarget: null },
  { id: "revenuePerOrder", group: "finance", label: "Revenue per order", unit: "money", dp: 2, better: "up", formula: "Revenue ÷ orders", source: "Xero P&L + WMS orders", defaultTarget: null },
  { id: "leakage", group: "finance", label: "Leakage found (open)", unit: "money", better: "down", formula: "Under-billing and missed minimums still open for the month", source: "Leakage", defaultTarget: 0 },
  { id: "debtorDays", group: "finance", label: "Debtor days", unit: "days", better: "down", formula: "Receivables (ex GST) ÷ last-12-month revenue × 365", source: "Xero balance sheet + P&L", defaultTarget: 30 },
  { id: "creditNotes", group: "finance", label: "Credit notes", unit: "pct", dp: 1, better: "down", formula: "Credit notes ÷ invoiced (ex GST)", source: "Xero sales", defaultTarget: 0.01 },

  { id: "palletsUsed", group: "warehouse", label: "Pallet positions used", unit: "pct", better: "up", bySite: true, formula: "Average pallets stored (pallet-weeks ÷ weeks) ÷ pallet positions", source: "WMS storage charges + Settings → Sites", defaultTarget: 0.85 },
  { id: "revenuePerPosition", group: "warehouse", label: "Revenue per pallet position", unit: "money", better: "up", formula: "Monthly revenue ÷ pallet positions (both sites)", source: "Xero P&L + Settings → Sites", defaultTarget: null },
  { id: "slowStock", group: "warehouse", label: "Slow stock (90+ days)", unit: "pct", better: "down", formula: "Pallets with no movement for 90+ days ÷ pallets", source: "WMS stock ageing", needs: "WMS stock-on-hand with last movement (Thomax API)", defaultTarget: 0.1 },

  { id: "mispick", group: "quality", label: "Mis-pick rate", unit: "pct", dp: 2, better: "down", formula: "Mis-picks reported ÷ orders", source: "Front tags / WMS", needs: "a mis-pick tag in Front or WMS error codes", defaultTarget: 0.001 },
  { id: "damage", group: "quality", label: "Damage rate", unit: "pct", dp: 2, better: "down", formula: "Damage claims ÷ orders", source: "Front tags / claims", needs: "a damage tag in Front or a claims log", defaultTarget: 0.001 },
  { id: "stockAccuracy", group: "quality", label: "Stock accuracy", unit: "pct", dp: 1, better: "up", formula: "Locations counted correct ÷ counted", source: "WMS cycle counts", needs: "WMS cycle-count results (Thomax API)", defaultTarget: 0.995 },
  { id: "ticketsPer100", group: "quality", label: "Tickets per 100 orders", unit: "num", dp: 2, better: "down", byClient: true, formula: "Front conversations with the client ÷ orders × 100", source: "Front + WMS orders", defaultTarget: null },
  { id: "top5Share", group: "quality", label: "Top-5 client share", unit: "pct", dp: 1, better: "down", formula: "Revenue from the 5 largest clients ÷ revenue, last 12 months", source: "Xero sales", defaultTarget: 0.5 },
  { id: "orderGrowth", group: "quality", label: "Order growth vs last year", unit: "pct", dp: 1, better: "up", byClient: true, formula: "Orders this month ÷ same month last year − 1", source: "WMS orders", defaultTarget: 0.05 },
];

export type KpiStatus = "green" | "amber" | "red" | "none";

/** On target (or within 3%) = green; 3–10% off = amber; more = red. No target or no value = none. */
export function kpiStatus(v: number | null, target: number | null, better: "up" | "down"): KpiStatus {
  if (v == null || target == null) return "none";
  if (target === 0) return better === "down" ? (v <= 0 ? "green" : "red") : v >= 0 ? "green" : "red";
  const gap = better === "up" ? (target - v) / Math.abs(target) : (v - target) / Math.abs(target);
  return gap <= 0.03 ? "green" : gap <= 0.1 ? "amber" : "red";
}

export function fmtKpi(v: number | null | undefined, unit: KpiUnit, dp?: number): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "pct") return `${(v * 100).toFixed(dp ?? 0)}%`;
  if (unit === "money") return v.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: dp ?? 0, maximumFractionDigits: dp ?? 0 });
  if (unit === "days") return `${v.toFixed(dp ?? 0)} d`;
  if (unit === "x") return `${v.toFixed(dp ?? 2)}×`;
  return v.toLocaleString("en-AU", { minimumFractionDigits: dp ?? 0, maximumFractionDigits: dp ?? 0 });
}

/** Mon–Fri days in a month ("2026-09"). */
export function workingDays(month: string): number {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= days; d++) {
    const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}
