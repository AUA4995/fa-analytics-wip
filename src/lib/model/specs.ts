import type { FieldSpec } from "./fields";

/**
 * What can be edited, per entity (pure — the client uses it to render inputs, the server to validate).
 * Rules = company-wide numbers (Setting "rule:<key>"); the rest are rows in their own tables.
 */

export const SITE_KEYS = [
  ["smi", "Smithfield"],
  ["par", "Parramatta"],
] as const;
export const SITE_OPTIONS: ReadonlyArray<readonly [string, string]> = SITE_KEYS;
export const STAFF_SITE_OPTIONS: ReadonlyArray<readonly [string, string]> = [...SITE_KEYS, ["both", "Both sites"]];

export const POOL_DRIVERS: ReadonlyArray<readonly [string, string]> = [
  ["MINUTES", "Activity minutes"],
  ["LABOUR_MINUTES", "Per labour minute"],
  ["PALLET_WEEKS", "Pallet-weeks stored"],
  ["PALLET_MOVES", "Pallet moves"],
  ["ORDERS", "Orders"],
  ["ORDERS_PACKED", "Orders packed"],
  ["MACHINE_ORDERS", "Orders through the machine"],
  ["REVENUE", "Revenue"],
  ["TICKET_SCORE", "Client share of weighted support tickets"],
  ["INVOICES_TICKETS", "Client share of invoices + accounts tickets"],
];

import { KPIS } from "@/lib/kpi/defs";

/** KPI targets live with the rules (Settings → Rules → KPI targets), key kpi_<id>. */
export const KPI_TARGET_RULES: Record<string, FieldSpec & { default: number | null }> = Object.fromEntries(
  KPIS.map((k) => [
    `kpi_${k.id}`,
    {
      label: k.label,
      kind: k.unit === "pct" ? "pct" : k.unit === "money" ? "money" : k.unit === "num" ? "number" : "number",
      optional: true,
      min: k.unit === "pct" ? 0 : undefined,
      max: k.unit === "pct" ? 100 : undefined,
      default: k.defaultTarget,
      hint: `${k.better === "up" ? "Higher" : "Lower"} is better${k.needs ? " · needs data source" : ""}`,
      dp: k.dp,
    } as FieldSpec & { default: number | null },
  ]),
);

const BASE_RULES: Record<string, FieldSpec & { default: number | null }> = {
  marginFloor: { label: "Margin floor", kind: "pct", min: 0, max: 80, default: 0.15, hint: "Below this = amber in Under-pricing and Rate review" },
  tolerance: { label: "Under-billing tolerance", kind: "money", min: 0, max: 1000, default: 5, hint: "Gaps smaller than this are ignored" },
  weeklyMinimum: { label: "Default weekly minimum", kind: "money", min: 0, max: 100000, default: 300, hint: "Postage + processing combined; per client in Clients" },
  b2bUnits: { label: "B2B threshold (units per order)", kind: "int", min: 1, max: 10000, default: 20, hint: "An order with more than this many units is B2B" },
  superRate: { label: "Superannuation", kind: "pct", min: 0, max: 30, default: 0.12 },
  payrollTaxRate: { label: "Payroll tax", kind: "pct", min: 0, max: 15, default: 0.0545, hint: "NSW rate" },
  workersCompRate: { label: "Workers comp (share of gross)", kind: "pct", min: 0, max: 20, default: null, optional: true, hint: "From the insurance policy — not set yet" },
  csrUtil: { label: "CSR labour utilisation", kind: "pct", min: 10, max: 100, default: 0.8, hint: "Estimate (practical capacity 80–85%) until measured" },
  // Batch 3 (16/11/2026)
  binSize: { label: "Bin size (pallet-equivalents)", kind: "number", min: 0.001, max: 10, dp: 3, default: null, optional: true, hint: "Rent by space type: one bin = this many pallet positions. Not set = bins left out of rent capacity" },
  baySize: { label: "Bay size (pallet-equivalents)", kind: "number", min: 0.01, max: 100, dp: 2, default: null, optional: true, hint: "One bay = this many pallet positions. Not set = bays left out" },
  accountsInvoiceShare: { label: "Accounts split: weight of invoices", kind: "pct", min: 0, max: 100, default: 0.5, hint: "Pools spread by invoices + accounts tickets: this much by invoice count, the rest by accounts ticket score (starting split — change if needed)" },
  ticketWeekStep: { label: "Ticket score: extra per week open", kind: "pct", min: 0, max: 100, default: 0.25, hint: "+25% for each started week after the first" },
  ticketMaxMultiplier: { label: "Ticket score: highest multiplier", kind: "number", min: 1, max: 10, dp: 2, default: 3, hint: "×3 at most" },
  logiwaCreditsYear: { label: "Logiwa credits per year", kind: "int", min: 0, max: 100000000, default: 800000, hint: "Plan allowance" },
  logiwaLinesPerCredit: { label: "Logiwa: order lines per credit", kind: "int", min: 1, max: 1000, default: 25, hint: "An order with up to 25 unique lines = 1 credit" },
  logiwaOverage: { label: "Logiwa overage price", kind: "pct", min: 100, max: 500, default: 1.5, hint: "Credits above the plan cost this share of the plan price (150%)" },
  logiwaYearFee: { label: "Logiwa plan fee per year ($)", kind: "money", min: 0, max: 10000000, default: null, optional: true, hint: "Plan price ÷ credits = price per credit; overage = 150% of that" },
  logiwaStartMonth: { label: "Logiwa contract year starts (month 1–12)", kind: "int", min: 1, max: 12, default: null, optional: true, hint: "For the credit tracker" },
};
export const BASE_RULE_KEYS = Object.keys(BASE_RULES);
export const RULES: Record<string, FieldSpec & { default: number | null }> = { ...BASE_RULES, ...KPI_TARGET_RULES };

export const ENTITY_FIELDS: Record<string, Record<string, FieldSpec>> = {
  tickettype: {
    name: { label: "Type", kind: "text" },
    department: { label: "Department", kind: "select", options: [["SUPPORT", "Client support"], ["ACCOUNTS", "Accounts"], ["WAREHOUSE", "Warehouse"], ["SALES", "Sales"]] },
    weight: { label: "Weight (1–10)", kind: "int", min: 1, max: 10, hint: "1 = quick, 10 = heavy" },
    tags: { label: "Front tags", kind: "list", optional: true, hint: "A conversation with any of these tags is this type" },
    active: { label: "In use", kind: "bool" },
  },
  site: {
    name: { label: "Name", kind: "text" },
    wmsCodes: { label: "WMS warehouse codes", kind: "list", optional: true, hint: "SYD02 = Smithfield, SYD01 = Parramatta" },
    owned: { label: "Owned (no rent in Xero)", kind: "bool" },
    notionalRent: { label: "Notional rent / month", kind: "money", optional: true, min: 0, hint: "Owned sites only — market rent so their clients aren't understated" },
    palletPositions: { label: "Pallet positions", kind: "int", optional: true, min: 0 },
    binPositions: { label: "Bin positions", kind: "int", optional: true, min: 0, hint: "Counted as pallet-equivalents (Rules → bin size)" },
    bayPositions: { label: "Bay positions", kind: "int", optional: true, min: 0, hint: "Counted as pallet-equivalents (Rules → bay size)" },
    labourUtil: { label: "Labour utilisation", kind: "pct", min: 10, max: 100, hint: "Share of paid floor time available for activities" },
    spaceUtil: { label: "Space utilisation", kind: "pct", optional: true, min: 0, max: 100, hint: "Pallet positions used ÷ total" },
  },
  client: {
    name: { label: "Name", kind: "text" },
    shortName: { label: "Short name", kind: "text", optional: true },
    status: { label: "Status", kind: "select", options: [["ACTIVE", "Active"], ["INACTIVE", "Inactive"], ["ONE_OFF", "One-off services"]] },
    type: { label: "Type", kind: "select", options: [["B2C", "B2C"], ["B2B", "B2B"], ["MIXED", "Mixed"]] },
    sites: { label: "Sites", kind: "list", optional: true, hint: "smi, par" },
    xeroContactId: { label: "Xero contact ID", kind: "text", optional: true },
    dyspatchCustomerId: { label: "Dyspach Customer ID (= WMS tenant ID)", kind: "text", optional: true },
    thomaxTenantId: { label: "Thomax tenant", kind: "text", optional: true },
    p3lClientId: { label: "3PLWMS client", kind: "text", optional: true },
    logiwaClientId: { label: "Logiwa client", kind: "text", optional: true },
    frontDomains: { label: "Front / email domains", kind: "list", optional: true },
    clmContractRef: { label: "CLM contract", kind: "text", optional: true },
    renewalDate: { label: "Contract renewal", kind: "date", optional: true, hint: "From CLM once connected" },
    weeklyMinimum: { label: "Weekly minimum", kind: "money", optional: true, min: 0, hint: "Empty = no weekly minimum" },
    levyUntil: { label: "Weekly minimum starts after", kind: "date", optional: true, hint: "Levy-free period end" },
    cmcShare: { label: "Orders packed on the CMC", kind: "pct", optional: true, min: 0, max: 100 },
    notes: { label: "Notes", kind: "text", optional: true },
  },
  pool: {
    name: { label: "Name", kind: "text" },
    driver: { label: "Spread by", kind: "select", options: POOL_DRIVERS },
    site: { label: "Site", kind: "select", options: SITE_OPTIONS, optional: true },
    description: { label: "Description", kind: "text", optional: true },
    capacity: { label: "Practical capacity / month", kind: "number", optional: true, min: 0, dp: 0, hint: "In its driver units, e.g. orders the CMC can wrap. Empty = fully spread over what was used" },
    active: { label: "In use", kind: "bool" },
  },
  service: {
    name: { label: "Name", kind: "text" },
    unit: { label: "Per", kind: "text", hint: "order, unit, carton, pallet, pallet-week…" },
    poolKind: { label: "Labour", kind: "select", options: [["floor", "Floor staff"], ["csr", "CSR"]], optional: true },
    minutes: { label: "Standard minutes", kind: "number", optional: true, min: 0, max: 1000, dp: 3 },
    minutesBasis: { label: "Minutes basis", kind: "select", options: [["ESTIMATE", "Estimate"], ["WMS", "WMS"], ["TIME_STUDY", "Time study"]] },
    overheads: { label: "Overhead drivers per unit", kind: "drivers", optional: true, hint: "e.g. equip=1 (one pallet move), automation_cmc=1" },
    role: { label: "Role", kind: "select", optional: true, options: [["ORDER", "One per order (counts orders)"], ["PACK_MANUAL", "Packing · manual"], ["PACK_CMC", "Packing · CMC"]], hint: "Packing services are costed per order with the client's CMC share" },
    billable: { label: "Billed to clients", kind: "bool" },
    active: { label: "In use", kind: "bool" },
  },
  xeromap: {
    accountName: { label: "Account name", kind: "text", optional: true },
    poolKey: { label: "Cost pool", kind: "text", optional: true },
    treatment: {
      label: "Treatment",
      kind: "select",
      options: [
        ["INCLUDE", "Included (cost in its pool / processing revenue)"],
        ["PAYROLL", "Wages / super — from Xero Payroll instead"],
        ["POSTAGE", "Postage & freight (re-billed with markup: revenue + variable cost)"],
        ["EXCLUDE", "Left out of cost to serve"],
        ["REBILLED", "Passed through to clients"],
      ],
    },
    behaviour: {
      label: "Break-even behaviour",
      kind: "select",
      optional: true,
      options: [
        ["FIXED", "Fixed"],
        ["VARIABLE", "Variable (moves with revenue)"],
        ["SEMI", "Semi-variable (split by high-low)"],
        ["STEP", "Step (fixed until a capacity limit, e.g. Logiwa credits)"],
      ],
      hint: "Empty = by P&L section: cost of sales variable, overheads fixed. Postage is marked up: its income counts as revenue and its cost as variable.",
    },
    note: { label: "Note", kind: "text", optional: true },
  },
  itemmap: {
    serviceCode: { label: "Standard service", kind: "text", optional: true },
    excluded: { label: "Left out (postage, freight…)", kind: "bool" },
  },
  wmsmap: {
    serviceCode: { label: "Standard service code", kind: "text" },
    note: { label: "Note", kind: "text", optional: true },
  },
  supplier: {
    name: { label: "Name", kind: "text" },
    xeroContactId: { label: "Xero contact ID", kind: "text", optional: true },
    poolKey: { label: "Cost pool", kind: "text", optional: true },
    site: { label: "Site", kind: "select", options: SITE_OPTIONS, optional: true },
    behaviour: { label: "Fixed or variable", kind: "select", options: [["FIXED", "Fixed"], ["VARIABLE", "Variable"]] },
    rebilled: { label: "Passed through to a client", kind: "bool", hint: "Rebilled costs are left out of FA cost" },
    expectedMonthly: { label: "Expected / month", kind: "money", optional: true, min: 0 },
    notes: { label: "Notes", kind: "text", optional: true },
  },
  staff: {
    name: { label: "Name", kind: "text" },
    site: { label: "Site", kind: "select", options: STAFF_SITE_OPTIONS },
    position: { label: "Position", kind: "text", optional: true },
    pool: { label: "Pool", kind: "select", options: [["floor", "Floor"], ["csr", "CSR"], ["supervisor", "Supervisor"], ["admin", "Admin"]] },
    type: { label: "Type", kind: "select", options: [["PERMANENT", "Permanent"], ["CASUAL", "Casual"], ["AGENCY", "Agency"]] },
    xeroEmployeeId: { label: "Xero Payroll ID", kind: "text", optional: true },
    thomaxCode: { label: "Thomax user code", kind: "text", optional: true },
    p3lCode: { label: "3PLWMS user code", kind: "text", optional: true },
    logiwaCode: { label: "Logiwa user code", kind: "text", optional: true },
    startDate: { label: "Start date", kind: "date", optional: true },
    endDate: { label: "End date", kind: "date", optional: true },
  },
  rate: {
    rate: { label: "Rate", kind: "money", min: 0, dp: 4, optional: true },
  },
  rule: Object.fromEntries(Object.entries(RULES).map(([k, spec]) => [k, { ...spec, default: undefined } as FieldSpec])),
};

export const ENTITY_LABELS: Record<string, string> = {
  site: "Site",
  client: "Client",
  pool: "Cost pool",
  service: "Service",
  xeromap: "Xero account mapping",
  wmsmap: "WMS code mapping",
  itemmap: "Xero item mapping",
  supplier: "Supplier",
  staff: "Staff member",
  rule: "Rule",
  allocation: "Staff allocation",
};

export function fieldSpec(entity: string, field: string): FieldSpec | null {
  return ENTITY_FIELDS[entity]?.[field] ?? null;
}
