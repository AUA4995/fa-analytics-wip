/**
 * Other FA apps and outside systems Analytics will read from, but isn't connected to yet (batch 2, 16/11/2026).
 * Each entry says what Analytics expects from it and which numbers depend on it, so pages can flag
 * "not connected" instead of showing a number that looks complete. Nothing here writes anywhere.
 */

export type SourceKey = "hub" | "clm" | "sales" | "siena" | "dyspach" | "logiwa";

export interface SourceDef {
  key: SourceKey;
  name: string;
  owner: string;
  /** What Analytics will read (read-only key) */
  reads: string;
  /** Where numbers depend on it, and what is used until then */
  affects: Array<{ where: string; href: string; until: string }>;
  /** What is needed to connect it */
  needs: string;
}

export const SOURCES: ReadonlyArray<SourceDef> = [
  {
    key: "hub",
    name: "Accounts Hub",
    owner: "Asal",
    reads: "Billing calendar, payment terms, AP/AR status, cost classification. Read-only API key. (The other way round, the Hub reads missed-billing results from Analytics — decision 11/11/2026.)",
    affects: [
      { where: "SLA → billing on time", href: "/operations?section=sla", until: "not measured yet" },
      { where: "Leakage → billing calendar and payment terms per client", href: "/leakage", until: "terms entered in Settings → Clients" },
    ],
    needs: "A read-only key from the Hub (Settings → API keys) once the Hub is live.",
  },
  {
    key: "clm",
    name: "CLM (contracts & rates)",
    owner: "Asal",
    reads: "Client rates, contract and renewal dates, rate-review stages, schedule of rates.",
    affects: [
      { where: "Leakage → under-billing and rate checks", href: "/leakage", until: "rates entered in Settings → Clients" },
      { where: "Overview → renewals & reviews", href: "/", until: "renewal dates in Settings → Clients" },
      { where: "Rate review", href: "/rates", until: "reviews started in Analytics" },
    ],
    needs: "CLM's read-only API (CLM is still being built).",
  },
  {
    key: "sales",
    name: "Sales app (Marcus)",
    owner: "Marcus",
    reads: "Pipeline and new clients won, for the volume forecast and onboarding.",
    affects: [{ where: "Operations → Trends & forecast (new clients)", href: "/operations?section=trends", until: "history only" }],
    needs: "Marcus to confirm what the Sales app can share and issue a read-only key.",
  },
  {
    key: "siena",
    name: "HR platform (Siena)",
    owner: "Marcus",
    reads: "Rosters and leave (staffing), CAR numbers and status (no staff names).",
    affects: [
      { where: "KPI → People", href: "/kpi?section=people", until: "Xero Payroll hours" },
    ],
    needs: "Access to the HR app repo and a read-only key from Marcus.",
  },
  {
    key: "dyspach",
    name: "Dyspach (billing)",
    owner: "Dyspach (Pushpinder Bagga)",
    reads: "Billing rates and charges actually invoiced, for the rate checks.",
    affects: [{ where: "Leakage → rate checks", href: "/leakage?section=ratechecks", until: "Dyspach rate export files" }],
    needs: "Dyspach is building a read-only API for FA (asked 10/11/2026).",
  },
  {
    key: "logiwa",
    name: "Logiwa (new WMS)",
    owner: "FA",
    reads: "Orders, picks, receipts, stock, charges and packaging scans once Logiwa is live.",
    affects: [
      { where: "Cost & margin → packaging (precise)", href: "/cost", until: "average packaging cost per order" },
      { where: "Operations", href: "/operations", until: "the Thomax copy" },
    ],
    needs: "Logiwa API key after go-live; ask now for open orders, stock, inbound and hold data.",
  },
];

export function sourceDef(key: SourceKey): SourceDef {
  const d = SOURCES.find((s) => s.key === key);
  if (!d) throw new Error(`Unknown source ${key}`);
  return d;
}
