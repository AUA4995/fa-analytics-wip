import { prisma } from "@/lib/db";
import { getConnection } from "./auth";
import { xeroDateTime, xeroDateToISO, xeroGet, xeroPages } from "./client";

/**
 * Read-only Xero sync for Analytics (brief §11): chart of accounts, contacts, sales invoices and credit notes line by
 * line, profit & loss by month by account, and AU Payroll (employees, pay runs, payslips). Nothing is ever written to
 * Xero. Incremental runs use If-Modified-Since; P&L re-reads the last 3 months (24 on a full run).
 */

export interface XeroSyncStats {
  accounts: number;
  contacts: number;
  sales: number;
  saleLines: number;
  pnlMonths: number;
  pnlRows: number;
  bills?: number;
  balanceMonths?: number;
  employees: number;
  payRuns: number;
  payslips: number;
  payrollSkipped?: string;
  durationMs: number;
}

/** Sales history starts here on a full run (FA's Thomax history also starts in 2021). */
export const SALES_FROM = "2021-01-01";

export async function runXeroSync(kind: "FULL" | "INCREMENTAL", startedBy: string | null = null): Promise<XeroSyncStats> {
  const conn = await getConnection();
  if (!conn) throw new Error("Xero isn't connected — Settings → Company → Connect Xero.");
  const running = await prisma.sourceRun.findFirst({ where: { source: "xero", status: "RUNNING", startedAt: { gt: new Date(Date.now() - 2 * 3600_000) } } });
  if (running) throw new Error("A Xero sync is already running.");
  const run = await prisma.sourceRun.create({ data: { source: "xero", label: kind === "FULL" ? "full" : "incremental", startedBy } });
  const t0 = Date.now();
  const since = kind === "INCREMENTAL" && conn.lastSyncAt ? new Date(conn.lastSyncAt.getTime() - 10 * 60_000) : undefined;
  const stats: XeroSyncStats = { accounts: 0, contacts: 0, sales: 0, saleLines: 0, pnlMonths: 0, pnlRows: 0, employees: 0, payRuns: 0, payslips: 0, durationMs: 0 };
  try {
    stats.accounts = await syncAccounts();
    stats.contacts = await syncContacts(since);
    const s = await syncSales(since);
    stats.sales = s.sales;
    stats.saleLines = s.lines;
    const p = await syncPnl(kind === "FULL" ? 24 : 3);
    stats.pnlMonths = p.months;
    stats.pnlRows = p.rows;
    stats.bills = await syncBills(since);
    stats.balanceMonths = await syncBalance(kind === "FULL" ? 24 : 3);
    const pay = await syncPayroll().catch((err: unknown) => ({ skipped: err instanceof Error ? err.message : String(err) }));
    if ("skipped" in pay) stats.payrollSkipped = pay.skipped;
    else Object.assign(stats, pay);
    stats.durationMs = Date.now() - t0;
    await prisma.xeroConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), ...(kind === "FULL" ? { lastFullSyncAt: new Date() } : {}) } });
    await prisma.sourceRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), stats: stats as never } });
    return stats;
  } catch (err) {
    await prisma.sourceRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: err instanceof Error ? err.message : String(err), stats: stats as never } });
    throw err;
  }
}

interface XAccount {
  AccountID: string;
  Code?: string;
  Name: string;
  Type: string;
  Class?: string;
  Status?: string;
  TaxType?: string;
}
async function syncAccounts(): Promise<number> {
  const body = await xeroGet<{ Accounts?: XAccount[] }>("/Accounts");
  for (const a of body.Accounts ?? []) {
    const data = { code: a.Code ?? null, name: a.Name, type: a.Type, class: a.Class ?? null, status: a.Status ?? null, taxType: a.TaxType ?? null };
    await prisma.xeroAccount.upsert({ where: { xeroId: a.AccountID }, update: data, create: { xeroId: a.AccountID, ...data } });
    // Expense and income accounts appear in Settings → Cost pools & mapping (unmapped / to decide), so nothing is forgotten
    const side = ["EXPENSE", "DIRECTCOSTS", "OVERHEADS"].includes(a.Type) ? "EXPENSE" : ["REVENUE", "SALES", "OTHERINCOME"].includes(a.Type) ? "INCOME" : null;
    if (a.Code && side) {
      await prisma.xeroAccountMap.upsert({ where: { accountCode: a.Code }, update: { accountName: a.Name, side }, create: { accountCode: a.Code, accountName: a.Name, side } });
    }
  }
  return body.Accounts?.length ?? 0;
}

interface XContact {
  ContactID: string;
  Name: string;
  EmailAddress?: string;
  IsCustomer?: boolean;
  IsSupplier?: boolean;
  ContactStatus?: string;
}
async function syncContacts(since?: Date): Promise<number> {
  let n = 0;
  for await (const page of xeroPages<XContact>("/Contacts", "Contacts", { modifiedSince: since, params: { includeArchived: "true" } })) {
    for (const c of page) {
      const data = { name: c.Name, email: c.EmailAddress || null, isCustomer: !!c.IsCustomer, isSupplier: !!c.IsSupplier, status: c.ContactStatus ?? null };
      await prisma.xeroContact.upsert({ where: { xeroId: c.ContactID }, update: data, create: { xeroId: c.ContactID, ...data } });
      n++;
    }
  }
  return n;
}

interface XLine {
  Description?: string;
  ItemCode?: string;
  AccountCode?: string;
  Quantity?: number;
  UnitAmount?: number;
  LineAmount?: number;
}
interface XSale {
  InvoiceID?: string;
  CreditNoteID?: string;
  InvoiceNumber?: string;
  CreditNoteNumber?: string;
  Reference?: string;
  Contact: { ContactID: string };
  Date?: string;
  DateString?: string;
  Status: string;
  Total?: number;
  SubTotal?: number;
  AmountDue?: number;
  DueDate?: string;
  DueDateString?: string;
  LineAmountTypes?: string;
  LineItems?: XLine[];
}

/** Line amounts ex GST: Xero gives LineAmount inclusive when LineAmountTypes = Inclusive. */
export function exGst(line: XLine, lineAmountTypes: string | undefined, taxRate = 0.1): number {
  const amt = line.LineAmount ?? 0;
  return lineAmountTypes === "Inclusive" ? Math.round((amt / (1 + taxRate)) * 100) / 100 : amt;
}

async function syncSales(since?: Date): Promise<{ sales: number; lines: number }> {
  let sales = 0;
  let lines = 0;
  const where = since ? undefined : `Date >= DateTime(${SALES_FROM.replace(/-/g, ",")})`;
  const save = async (x: XSale, kind: "INVOICE" | "CREDIT") => {
    const id = (kind === "INVOICE" ? x.InvoiceID : x.CreditNoteID)!;
    const date = xeroDateToISO(x.DateString ?? x.Date) ?? SALES_FROM;
    const sign = kind === "CREDIT" ? -1 : 1;
    const data = {
      kind,
      number: (kind === "INVOICE" ? x.InvoiceNumber : x.CreditNoteNumber) ?? null,
      reference: x.Reference ?? null,
      contactId: x.Contact.ContactID,
      date: new Date(date + "T00:00:00Z"),
      status: x.Status,
      total: sign * (x.SubTotal ?? x.Total ?? 0),
      dueDate: dueOf(x),
      amountDue: kind === "INVOICE" && ["AUTHORISED", "SUBMITTED"].includes(x.Status) ? (x.AmountDue ?? 0) : 0,
    };
    await prisma.$transaction([
      prisma.xeroSale.upsert({ where: { xeroId: id }, update: data, create: { xeroId: id, ...data } }),
      prisma.xeroSaleLine.deleteMany({ where: { saleId: id } }),
      prisma.xeroSaleLine.createMany({
        data: (x.LineItems ?? []).map((l) => ({
          saleId: id,
          description: l.Description ?? null,
          itemCode: l.ItemCode ?? null,
          accountCode: l.AccountCode ?? null,
          quantity: l.Quantity ?? null,
          unitAmount: l.UnitAmount ?? null,
          amount: sign * exGst(l, x.LineAmountTypes),
        })),
      }),
    ]);
    sales++;
    lines += x.LineItems?.length ?? 0;
    for (const l of x.LineItems ?? []) if (l.ItemCode) items.add(l.ItemCode);
  };
  const items = new Set<string>();
  const saveItems = async () => {
    for (const code of items) await prisma.xeroItemMap.upsert({ where: { itemCode: code }, update: {}, create: { itemCode: code } });
  };
  for await (const page of xeroPages<XSale>("/Invoices", "Invoices", { modifiedSince: since, params: { where: `Type=="ACCREC"${where ? ` AND ${where}` : ""}` } })) for (const x of page) await save(x, "INVOICE");
  for await (const page of xeroPages<XSale>("/CreditNotes", "CreditNotes", { modifiedSince: since, params: { where: `Type=="ACCRECCREDIT"${where ? ` AND ${where}` : ""}` } })) for (const x of page) await save(x, "CREDIT");
  // Item codes on invoice lines appear in Settings → Cost pools & mapping, to map to services (billed per service)
  await saveItems();
  return { sales, lines };
}

function dueOf(x: XSale): Date | null {
  const d = xeroDateToISO(x.DueDateString ?? x.DueDate);
  return d ? new Date(d + "T00:00:00Z") : null;
}

/** Supplier bills (ACCPAY), read-only: creditor days, aged payables and supplier unit prices (savings). */
async function syncBills(since?: Date): Promise<number> {
  let n = 0;
  const where = since ? "" : ` AND Date >= DateTime(${SALES_FROM.replace(/-/g, ",")})`;
  for await (const page of xeroPages<XSale>("/Invoices", "Invoices", { modifiedSince: since, params: { where: `Type=="ACCPAY"${where}` } }))
    for (const x of page) {
      const id = x.InvoiceID!;
      if (x.Status === "DELETED" || x.Status === "VOIDED") {
        await prisma.xeroBill.deleteMany({ where: { xeroId: id } });
        continue;
      }
      const data = {
        number: x.InvoiceNumber ?? null,
        reference: x.Reference ?? null,
        contactId: x.Contact.ContactID,
        date: new Date((xeroDateToISO(x.DateString ?? x.Date) ?? SALES_FROM) + "T00:00:00Z"),
        dueDate: dueOf(x),
        status: x.Status,
        total: x.SubTotal ?? x.Total ?? 0,
        amountDue: ["AUTHORISED", "SUBMITTED"].includes(x.Status) ? (x.AmountDue ?? 0) : 0,
      };
      await prisma.$transaction([
        prisma.xeroBill.upsert({ where: { xeroId: id }, update: data, create: { xeroId: id, ...data } }),
        prisma.xeroBillLine.deleteMany({ where: { billId: id } }),
        prisma.xeroBillLine.createMany({ data: (x.LineItems ?? []).map((l) => ({ billId: id, description: l.Description ?? null, itemCode: l.ItemCode ?? null, accountCode: l.AccountCode ?? null, quantity: l.Quantity ?? null, unitAmount: l.UnitAmount ?? null, amount: exGst(l, x.LineAmountTypes) })) }),
      ]);
      n++;
    }
  return n;
}

// ---------- Profit & loss by month ----------

interface XReportCell {
  Value?: string;
  Attributes?: Array<{ Id: string; Value: string }>;
}
interface XReportRow {
  RowType: string;
  Title?: string;
  Cells?: XReportCell[];
  Rows?: XReportRow[];
}
interface XReport {
  Reports?: Array<{ Rows?: XReportRow[] }>;
}

export interface PnlRow {
  month: string;
  accountId: string;
  accountName: string;
  section: string;
  amount: number;
}

/**
 * Xero P&L with periods/timeframe=MONTH: the header row lists months newest first ("30 Sep 26", "31 Aug 26", …);
 * account rows carry the account ID in Cells[0].Attributes. Summary rows (no account) are skipped.
 */
export function parsePnl(report: XReport): PnlRow[] {
  const rows = report.Reports?.[0]?.Rows ?? [];
  const header = rows.find((r) => r.RowType === "Header");
  const months = (header?.Cells ?? []).slice(1).map((c) => monthOf(c.Value ?? ""));
  const out: PnlRow[] = [];
  for (const sec of rows.filter((r) => r.RowType === "Section")) {
    for (const r of sec.Rows ?? []) {
      if (r.RowType !== "Row") continue;
      const first = r.Cells?.[0];
      const accountId = first?.Attributes?.find((a) => a.Id === "account")?.Value;
      if (!accountId) continue;
      (r.Cells ?? []).slice(1).forEach((c, i) => {
        const m = months[i];
        if (!m) return;
        const v = Number((c.Value ?? "0").replace(/,/g, ""));
        out.push({ month: m, accountId, accountName: first?.Value ?? "", section: sec.Title ?? "", amount: Number.isFinite(v) ? v : 0 });
      });
    }
  }
  return out;
}

const MON = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" } as Record<string, string>;
/** "30 Sep 26" / "Sep 2026" / "2026-09-30" → "2026-09" */
export function monthOf(label: string): string | null {
  const iso = label.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const m = label.match(/([A-Z][a-z]{2})\w*\s+'?(\d{2,4})$/);
  if (!m || !MON[m[1]]) return null;
  const y = m[2].length === 2 ? `20${m[2]}` : m[2];
  return `${y}-${MON[m[1]]}`;
}

async function syncPnl(monthsBack: number): Promise<{ months: number; rows: number }> {
  const accounts = new Map((await prisma.xeroAccount.findMany({ select: { xeroId: true, code: true } })).map((a) => [a.xeroId, a.code]));
  const now = new Date();
  let months = 0;
  let rows = 0;
  // Xero allows up to 11 comparison periods → 12 months per call
  for (let back = 0; back < monthsBack; back += 12) {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    const periods = Math.min(11, monthsBack - back - 1);
    const rep = await xeroGet<XReport>("/Reports/ProfitAndLoss", { params: { fromDate: start.toISOString().slice(0, 10), toDate: end.toISOString().slice(0, 10), periods, timeframe: "MONTH", standardLayout: "true" } });
    const parsed = parsePnl(rep);
    const seenMonths = new Set(parsed.map((p) => p.month));
    for (const m of seenMonths) await prisma.xeroPnl.deleteMany({ where: { month: m } });
    if (parsed.length) await prisma.xeroPnl.createMany({ data: parsed.map((p) => ({ ...p, accountCode: accounts.get(p.accountId) ?? null })) });
    months += seenMonths.size;
    rows += parsed.length;
  }
  return { months, rows };
}

/** Balance sheet at each month end (12 per call), parsed like the P&L. */
async function syncBalance(monthsBack: number): Promise<number> {
  const accounts = new Map((await prisma.xeroAccount.findMany({ select: { xeroId: true, code: true } })).map((a) => [a.xeroId, a.code]));
  const now = new Date();
  let months = 0;
  for (let back = 0; back < monthsBack; back += 12) {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0));
    const periods = Math.min(11, monthsBack - back - 1);
    const rep = await xeroGet<XReport>("/Reports/BalanceSheet", { params: { date: end.toISOString().slice(0, 10), periods, timeframe: "MONTH", standardLayout: "true" } });
    const parsed = parsePnl(rep);
    const seen = new Set(parsed.map((p) => p.month));
    for (const m of seen) await prisma.xeroBalance.deleteMany({ where: { month: m } });
    if (parsed.length) await prisma.xeroBalance.createMany({ data: parsed.map((p) => ({ ...p, accountCode: accounts.get(p.accountId) ?? null })) });
    months += seen.size;
  }
  return months;
}

// ---------- AU Payroll ----------

interface XEmployee {
  EmployeeID: string;
  FirstName: string;
  LastName: string;
  Status?: string;
  StartDate?: string;
  TerminationDate?: string;
}
interface XPayRun {
  PayRunID: string;
  PayRunPeriodStartDate: string;
  PayRunPeriodEndDate: string;
  PaymentDate: string;
  PayRunStatus: string;
  Payslips?: Array<{ PayslipID: string; EmployeeID: string; Wages?: number; Super?: number }>;
}
interface XPayslip {
  Payslip?: { EarningsLines?: Array<{ NumberOfUnits?: number; EarningsRateID?: string }>; TimesheetEarningsLines?: Array<{ NumberOfUnits?: number; EarningsRateID?: string }> };
}
export interface XPayItems {
  PayItems?: { EarningsRates?: Array<{ EarningsRateID: string; EarningsType?: string; Name?: string; RateType?: string; TypeOfUnits?: string }> };
}

/**
 * Which earnings rates are paid by the hour and which are overtime (batch 6). Hours: units are hours ("Hours", or a
 * multiple of the ordinary rate). Overtime: Xero type OVERTIMEEARNINGS or "overtime"/"O/T" in the name, and by the hour.
 * Allowances (km, meals) and fixed amounts are never hours.
 */
export function classifyRates(items: XPayItems | null): { hourly: Set<string>; overtime: Set<string> } | null {
  if (!items) return null;
  const hourly = new Set<string>();
  const overtime = new Set<string>();
  for (const r of items.PayItems?.EarningsRates ?? []) {
    // "Type of units" is free text in Xero: Hours, Hrs, Hr, H
    const isHours = /hour|^\s*h(r|rs)?\.?\s*$/i.test(r.TypeOfUnits ?? "") || (!r.TypeOfUnits && r.RateType === "MULTIPLE");
    if (!isHours) continue;
    hourly.add(r.EarningsRateID);
    if (r.EarningsType === "OVERTIMEEARNINGS" || /overtime|\bo\/?t\b/i.test(r.Name ?? "")) overtime.add(r.EarningsRateID);
  }
  return { hourly, overtime };
}

type PayLine = { NumberOfUnits?: number; EarningsRateID?: string };
/** Paid hours and overtime hours of one payslip; overtime null when it can't be told (no overtime rate in Xero). */
export function payslipHours(lines: PayLine[], rates: ReturnType<typeof classifyRates>): { hours: number; overtimeHours: number | null } {
  const sum = (ls: PayLine[]) => ls.reduce((a, l) => a + (l.NumberOfUnits ?? 0), 0);
  // Pay items unreadable, or no ordinary hourly rate recognised: hours unknown (0 = "no data" in the KPIs), never a guess
  if (!rates || ![...rates.hourly].some((id) => !rates.overtime.has(id))) return { hours: 0, overtimeHours: null };
  const hours = sum(lines.filter((l) => l.EarningsRateID && rates.hourly.has(l.EarningsRateID)));
  const overtimeHours = rates.overtime.size ? sum(lines.filter((l) => l.EarningsRateID && rates.overtime.has(l.EarningsRateID))) : null;
  return { hours, overtimeHours };
}

async function syncPayroll(): Promise<{ employees: number; payRuns: number; payslips: number; payrollNote?: string }> {
  const conn = await getConnection();
  if (!/payroll\.payruns/.test(conn?.scopes ?? "")) throw new Error("Payroll permission not granted — reconnect Xero (Settings → Company)");
  let employees = 0;
  for await (const page of xeroPages<XEmployee>("/Employees", "Employees", { api: "payroll" })) {
    for (const e of page) {
      const d = (s?: string) => (xeroDateToISO(s) ? new Date(xeroDateToISO(s) + "T00:00:00Z") : null);
      const data = { firstName: e.FirstName, lastName: e.LastName, status: e.Status ?? null, startDate: d(e.StartDate), endDate: d(e.TerminationDate) };
      await prisma.payrollEmployee.upsert({ where: { xeroId: e.EmployeeID }, update: data, create: { xeroId: e.EmployeeID, ...data } });
      employees++;
    }
  }
  let payRuns = 0;
  let payslips = 0;
  // Overtime (batch 6): earnings rates whose type is overtime; their hours are kept per payslip
  let payrollNote: string | undefined;
  const items = await xeroGet<XPayItems>("/PayItems", { api: "payroll" }).catch((err: unknown) => {
    const status = /\((\d{3})\)/.exec(err instanceof Error ? err.message : "")?.[1];
    payrollNote =
      status === "401" || status === "403"
        ? "Xero refused access to pay items — check that the Xero user who connected has payroll admin access, then reconnect Xero (Settings → Company) and allow payroll settings; until then paid hours and overtime show no data"
        : "Xero pay items couldn't be read this time — paid hours and overtime show no data until the next sync";
    return null;
  });
  const rates = classifyRates(items);
  if (rates && ![...rates.hourly].some((id) => !rates.overtime.has(id))) payrollNote = "No hourly earnings rate found in Xero (type of units Hours) — paid hours and overtime show no data";
  else if (rates && !rates.overtime.size) payrollNote = "No overtime earnings rate found in Xero (type Overtime, or “overtime” in the name) — overtime shows no data";
  const overtimeRates = rates && rates.overtime.size ? rates.overtime : null;
  const known = new Map((await prisma.payRun.findMany({ select: { xeroId: true, status: true } })).map((r) => [r.xeroId, r.status]));
  // Posted runs never change — except to read overtime on payslips stored before it was kept
  const needsOvertime = new Set(overtimeRates ? (await prisma.payslip.findMany({ where: { overtimeHours: null }, select: { payRunId: true }, distinct: ["payRunId"] })).map((x) => x.payRunId) : []);
  for await (const page of xeroPages<XPayRun>("/PayRuns", "PayRuns", { api: "payroll" })) {
    for (const r of page) {
      if (known.get(r.PayRunID) === "POSTED" && !needsOvertime.has(r.PayRunID)) continue; // posted runs never change
      const detail = (await xeroGet<{ PayRuns?: XPayRun[] }>(`/PayRuns/${r.PayRunID}`, { api: "payroll" })).PayRuns?.[0] ?? r;
      const dd = (s: string) => new Date((xeroDateToISO(s) ?? xeroDateTime(s)?.toISOString().slice(0, 10) ?? "1970-01-01") + "T00:00:00Z");
      const data = { periodStart: dd(detail.PayRunPeriodStartDate), periodEnd: dd(detail.PayRunPeriodEndDate), paymentDate: dd(detail.PaymentDate), status: detail.PayRunStatus };
      await prisma.payRun.upsert({ where: { xeroId: r.PayRunID }, update: data, create: { xeroId: r.PayRunID, ...data } });
      payRuns++;
      if (detail.PayRunStatus !== "POSTED") continue;
      for (const s of detail.Payslips ?? []) {
        const slip = await xeroGet<XPayslip>(`/Payslip/${s.PayslipID}`, { api: "payroll" });
        const lines = [...(slip.Payslip?.EarningsLines ?? []), ...(slip.Payslip?.TimesheetEarningsLines ?? [])];
        const { hours, overtimeHours } = payslipHours(lines, rates);
        const data2 = { payRunId: r.PayRunID, employeeId: s.EmployeeID, gross: s.Wages ?? 0, super: s.Super ?? 0, hours, overtimeHours };
        await prisma.payslip.upsert({ where: { xeroId: s.PayslipID }, update: data2, create: { xeroId: s.PayslipID, ...data2 } });
        payslips++;
      }
    }
  }
  return { employees, payRuns, payslips, ...(payrollNote ? { payrollNote } : {}) };
}
