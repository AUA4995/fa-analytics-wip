/**
 * Finance (brief §9b) — pure calculations from Xero P&L / balance sheet rows. No database here, so it is tested
 * on its own. Missing data stays null ("no data yet"); nothing is estimated except the labelled forecast.
 */

export type Line = "revenue" | "other" | "cos" | "overheads" | "dep" | "interest" | "tax";
export const LINE_LABEL: Record<Line, string> = { revenue: "Revenue", other: "Other income", cos: "Cost of services", overheads: "Overheads", dep: "Depreciation & amortisation", interest: "Interest", tax: "Income tax" };

export interface PnlIn {
  month: string;
  accountId: string;
  accountName: string;
  section: string;
  amount: number;
  /** Xero account type (REVENUE, SALES, OTHERINCOME, DIRECTCOSTS, EXPENSE, OVERHEADS, DEPRECIATN …) */
  type?: string | null;
}

/** Which P&L line an account belongs to: Xero account type first, the report section as a fallback. */
export function classify(r: { accountName: string; section: string; type?: string | null }): Line {
  const t = (r.type ?? "").toUpperCase();
  const name = r.accountName.toLowerCase();
  if (t === "REVENUE" || t === "SALES") return "revenue";
  if (t === "OTHERINCOME") return "other";
  if (t === "DIRECTCOSTS") return "cos";
  if (t === "DEPRECIATN" || /depreciation|amortis|amortiz/.test(name)) return "dep";
  if (/interest/.test(name) && !/income|received/.test(name)) return "interest";
  if (/income tax/.test(name)) return "tax";
  if (t) return "overheads";
  const s = r.section.toLowerCase();
  if (/cost of sales|direct cost/.test(s)) return "cos";
  if (/other income/.test(s)) return "other";
  if (/income|revenue|sales/.test(s) && !/less/.test(s)) return "revenue";
  return "overheads";
}

export interface Month {
  month: string;
  revenue: number;
  other: number;
  cos: number;
  gross: number;
  overheads: number;
  ebitda: number;
  dep: number;
  interest: number;
  tax: number;
  net: number;
}

export function pnlByMonth(rows: PnlIn[]): Month[] {
  const m = new Map<string, Record<Line, number>>();
  for (const r of rows) {
    const o = m.get(r.month) ?? { revenue: 0, other: 0, cos: 0, overheads: 0, dep: 0, interest: 0, tax: 0 };
    o[classify(r)] += r.amount;
    m.set(r.month, o);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, o]) => {
      const gross = o.revenue - o.cos;
      const ebitda = gross + o.other - o.overheads;
      return { month, ...o, gross, ebitda, net: ebitda - o.dep - o.interest - o.tax };
    });
}

export const sumMonths = (ms: Month[]): Omit<Month, "month"> =>
  ms.reduce((a, x) => ({ revenue: a.revenue + x.revenue, other: a.other + x.other, cos: a.cos + x.cos, gross: a.gross + x.gross, overheads: a.overheads + x.overheads, ebitda: a.ebitda + x.ebitda, dep: a.dep + x.dep, interest: a.interest + x.interest, tax: a.tax + x.tax, net: a.net + x.net }), { revenue: 0, other: 0, cos: 0, gross: 0, overheads: 0, ebitda: 0, dep: 0, interest: 0, tax: 0, net: 0 });

/** Australian financial year of a month: "2026-09" → "FY27" (July–June). */
export function fyOf(month: string): string {
  const [y, mo] = month.split("-").map(Number);
  return `FY${String(mo >= 7 ? y + 1 : y).slice(2)}`;
}

export interface BalIn {
  month: string;
  accountName: string;
  section: string;
  amount: number;
}
export interface Bal {
  month: string;
  cash: number;
  receivables: number;
  payables: number;
  currentAssets: number;
  currentLiabilities: number;
  fixedAssets: number;
  /** Loans / borrowings on the balance sheet (current + non-current) */
  debt: number;
  /** The part of debt inside current liabilities (kept out of working capital) */
  currentDebt: number;
}
const DEBT = /loan|borrow|facility|hire purchase|chattel|overdraft|equipment finance/i;

export function balanceByMonth(rows: BalIn[]): Bal[] {
  const m = new Map<string, Bal>();
  for (const r of rows) {
    const b = m.get(r.month) ?? { month: r.month, cash: 0, receivables: 0, payables: 0, currentAssets: 0, currentLiabilities: 0, fixedAssets: 0, debt: 0, currentDebt: 0 };
    const s = r.section.toLowerCase();
    if (s === "bank") {
      b.cash += r.amount;
      b.currentAssets += r.amount;
    } else if (s.includes("current assets") && !s.includes("non")) {
      b.currentAssets += r.amount;
      if (/receivable/i.test(r.accountName)) b.receivables += r.amount;
    } else if (s.includes("fixed assets") || s.includes("non-current assets") || s.includes("non current assets")) b.fixedAssets += r.amount;
    else if (s.includes("current liabilities") && !s.includes("non")) {
      b.currentLiabilities += r.amount;
      if (/payable/i.test(r.accountName) && !/gst|payg|super|wage/i.test(r.accountName)) b.payables += r.amount;
      if (DEBT.test(r.accountName)) {
        b.debt += r.amount;
        b.currentDebt += r.amount;
      }
    } else if (s.includes("liabilities") && DEBT.test(r.accountName)) b.debt += r.amount;
    m.set(r.month, b);
  }
  return [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface Ratios {
  dscr: number | null;
  debtToEbitda: number | null;
  currentRatio: number | null;
  debtorDays: number | null;
  creditorDays: number | null;
  interestCover: number | null;
}

/**
 * Bank ratios on the last 12 months. Debt service = principal (debt schedule, per month × 12) + interest (P&L).
 * Debtor / creditor days take GST out of the balances (÷ 1.1) because the P&L is ex GST.
 */
export function ratios(last12: Month[], bal: Bal | null, debt: { balance: number; principal12: number } | null): Ratios {
  const t = sumMonths(last12);
  const full = last12.length >= 12;
  const service = (debt?.principal12 ?? 0) + t.interest;
  const debtBal = debt?.balance ?? bal?.debt ?? null;
  return {
    dscr: full && service > 0 ? t.ebitda / service : null,
    debtToEbitda: full && debtBal != null && t.ebitda > 0 ? debtBal / t.ebitda : null,
    currentRatio: bal && bal.currentLiabilities > 0 ? bal.currentAssets / bal.currentLiabilities : null,
    debtorDays: full && bal && t.revenue > 0 ? (bal.receivables / 1.1 / t.revenue) * 365 : null,
    creditorDays: full && bal && t.cos + t.overheads > 0 ? (bal.payables / 1.1 / (t.cos + t.overheads)) * 365 : null,
    interestCover: full && t.interest > 0 ? t.ebitda / t.interest : null,
  };
}

export interface FlowStep {
  label: string;
  value: number;
  kind: "start" | "end" | "step";
}
/**
 * Cash flow for one month from the P&L and the change in the balance sheet. "Other" (movements) is the balancing
 * figure so the bridge always lands on Xero's closing cash — shown, never hidden.
 */
export function cashBridge(m: Month, open: Bal, close: Bal): FlowStep[] {
  const wc = (b: Bal) => b.currentAssets - b.cash - (b.currentLiabilities - b.currentDebt);
  const wcOpen = wc(open);
  const wcClose = wc(close);
  const steps: FlowStep[] = [
    { label: "Opening cash", value: open.cash, kind: "start" },
    { label: "EBITDA", value: m.ebitda, kind: "step" },
    { label: "Working capital", value: -(wcClose - wcOpen), kind: "step" },
    { label: "Capex", value: -(close.fixedAssets - open.fixedAssets + m.dep), kind: "step" },
    { label: "Tax", value: -m.tax, kind: "step" },
    { label: "Loan principal", value: close.debt - open.debt, kind: "step" },
    { label: "Interest", value: -m.interest, kind: "step" },
  ];
  const moved = steps.slice(1).reduce((a, s) => a + s.value, 0);
  const other = close.cash - open.cash - moved;
  if (Math.abs(other) >= 1) steps.push({ label: "Other", value: other, kind: "step" });
  steps.push({ label: "Closing cash", value: close.cash, kind: "end" });
  return steps;
}

export const AGE_BUCKETS = ["Current", "1–30", "31–60", "61–90", "90+"] as const;
/** Days overdue → bucket index (not yet due = Current). */
export function ageBucket(due: Date | null, today: Date): number {
  if (!due) return 0;
  const d = Math.floor((today.getTime() - due.getTime()) / 86400000);
  return d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4;
}

/** "Client A", "Client B", … "Client AA" — names hidden by default in bank reporting. */
export function anonName(i: number): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Client ${s}`;
}

/** Gauge status for the bank: DSCR ≥ 1.25, debt/EBITDA < 2.5, current ratio > 1.2. */
export function gaugeTone(kind: "dscr" | "debt" | "current", v: number | null): "green" | "amber" | "red" | "grey" {
  if (v == null) return "grey";
  if (kind === "dscr") return v >= 1.5 ? "green" : v >= 1.25 ? "amber" : "red";
  if (kind === "debt") return v < 2.5 ? "green" : v < 3.5 ? "amber" : "red";
  return v > 1.2 ? "green" : v >= 1 ? "amber" : "red";
}
