/** Subset of Xero Accounting API JSON shapes used by the sync (all read-only). */

export interface XeroContactJson {
  ContactID: string;
  ContactStatus?: "ACTIVE" | "ARCHIVED" | "GDPRREQUEST";
  Name: string;
  EmailAddress?: string;
  IsSupplier?: boolean;
  IsCustomer?: boolean;
  ContactGroups?: Array<{ ContactGroupID: string; Name: string }>;
  UpdatedDateUTC?: string;
  PaymentTerms?: XeroContactTermsJson["PaymentTerms"];
  SalesDefaultAccountCode?: string;
  PurchasesDefaultAccountCode?: string;
}

export interface XeroLineItemJson {
  LineItemID?: string;
  Description?: string;
  Quantity?: number;
  UnitAmount?: number;
  LineAmount?: number;
  AccountCode?: string;
  TaxType?: string;
  TaxAmount?: number;
  /** Xero inventory item code (when the line uses an item) */
  ItemCode?: string;
}

export interface XeroPaymentSummaryJson {
  PaymentID: string;
  Date?: string;
  Amount?: number;
  Reference?: string;
  IsReconciled?: boolean;
  HasAccount?: boolean;
}

export interface XeroInvoiceJson {
  InvoiceID: string;
  Type: "ACCREC" | "ACCPAY";
  InvoiceNumber?: string;
  Reference?: string;
  Contact: { ContactID: string; Name?: string };
  Date?: string;
  DateString?: string;
  DueDate?: string;
  DueDateString?: string;
  Status: "DRAFT" | "SUBMITTED" | "AUTHORISED" | "PAID" | "VOIDED" | "DELETED";
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  AmountDue?: number;
  AmountPaid?: number;
  AmountCredited?: number;
  CurrencyCode?: string;
  SentToContact?: boolean;
  PlannedPaymentDate?: string;
  ExpectedPaymentDate?: string;
  UpdatedDateUTC?: string;
  /** A file (PDF, CSV …) is attached to the invoice in Xero */
  HasAttachments?: boolean;
  LineItems?: XeroLineItemJson[];
  Payments?: XeroPaymentSummaryJson[];
}

// ---------- R1-ar additions ----------

export type XeroTermsType = "DAYSAFTERBILLDATE" | "DAYSAFTERBILLMONTH" | "OFCURRENTMONTH" | "OFFOLLOWINGMONTH";

export interface XeroPaymentTermJson {
  Day?: number;
  Type?: XeroTermsType;
}

/** Extra Contact fields used by Receivables / Contacts and rules. */
export interface XeroContactTermsJson {
  /** Contact.PaymentTerms — Sales (what the client gets) and Bills (what FA gets from a supplier) */
  PaymentTerms?: { Sales?: XeroPaymentTermJson; Bills?: XeroPaymentTermJson };
  SalesDefaultAccountCode?: string;
  PurchasesDefaultAccountCode?: string;
}

export interface XeroCreditNoteAllocationJson {
  AllocationID?: string;
  Amount?: number;
  Date?: string;
  Invoice?: { InvoiceID?: string; InvoiceNumber?: string };
}

export interface XeroCreditNoteJson {
  CreditNoteID: string;
  CreditNoteNumber?: string;
  Type: "ACCRECCREDIT" | "ACCPAYCREDIT";
  Reference?: string;
  Contact: { ContactID: string; Name?: string };
  Date?: string;
  DateString?: string;
  Status: "DRAFT" | "SUBMITTED" | "AUTHORISED" | "PAID" | "VOIDED" | "DELETED";
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  RemainingCredit?: number;
  CurrencyCode?: string;
  SentToContact?: boolean;
  UpdatedDateUTC?: string;
  LineItems?: XeroLineItemJson[];
  Allocations?: XeroCreditNoteAllocationJson[];
}

export interface XeroAccountJson {
  AccountID: string;
  Code?: string;
  Name: string;
  Type: string;
  Class?: string;
  Status?: string;
  TaxType?: string;
}
