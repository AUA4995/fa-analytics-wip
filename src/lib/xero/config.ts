/**
 * Xero OAuth 2.0 configuration — READ-ONLY scopes only (brief §3 rule 4).
 * No write scope may ever be added here.
 */

export const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
export const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

/**
 * Granular read-only scopes. Xero apps created on/after 2 March 2026 cannot request the old broad
 * scopes (accounting.transactions[.read], accounting.reports.read). Override with XERO_SCOPES
 * (space-separated) if an older app needs something else — still validated as read-only.
 */
export const DEFAULT_XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  // Accounting (granular, read-only): invoices and bills, payments, contacts, chart of accounts, bank and journals
  "accounting.invoices.read",
  "accounting.payments.read",
  "accounting.contacts.read",
  "accounting.settings.read",
  "accounting.banktransactions.read",
  "accounting.manualjournals.read",
  "accounting.attachments.read", // original supplier invoices on bills (read by Claude)
  "accounting.budgets.read",
  // Reports for Finance and the bank pack
  "accounting.reports.profitandloss.read",
  "accounting.reports.balancesheet.read",
  "accounting.reports.aged.read",
  "accounting.reports.trialbalance.read",
  "accounting.reports.banksummary.read",
  "accounting.reports.taxreports.read",
  // AU Payroll (labour cost: pay, hours, super)
  "payroll.employees.read",
  "payroll.payruns.read",
  "payroll.payslip.read",
  "payroll.timesheets.read",
  "payroll.settings.read",
] as const;

/** The stored connection can read attachments (granted when Xero was connected after the scope was added). */
export function canReadAttachments(scopes: string | null | undefined): boolean {
  return /(^|\s)accounting\.attachments(\.read)?(\s|$)/.test(scopes ?? "");
}

export const XERO_SCOPES: readonly string[] = (process.env.XERO_SCOPES ?? "").trim()
  ? (process.env.XERO_SCOPES as string).trim().split(/\s+/)
  : DEFAULT_XERO_SCOPES;

export function assertReadOnlyScopes(scopes: readonly string[] = XERO_SCOPES): void {
  const writable = scopes.filter((s) => /^(accounting|payroll|files|assets|projects|finance|bankfeeds|paymentservices)\./.test(s) && !s.endsWith(".read"));
  if (writable.length) throw new Error(`Xero write scopes are not allowed: ${writable.join(", ")}`);
}

export function xeroEnv() {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI ?? `${process.env.APP_URL ?? "http://localhost:3000"}/api/xero/callback`;
  if (!clientId || !clientSecret) {
    throw new Error("XERO_CLIENT_ID / XERO_CLIENT_SECRET are not set — see .env.example");
  }
  return { clientId, clientSecret, redirectUri };
}

export function isXeroConfigured(): boolean {
  return !!(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}
