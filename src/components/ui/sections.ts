/**
 * Pages, their menu labels and their sub-menus (brief §12.0). Pure data + helpers so the
 * left menu, the top-bar crumb and the page SubNav always agree. Section comes from `?section=`.
 */

export type PageKey =
  | "overview"
  | "operations"
  | "cost"
  | "leakage"
  | "revenue"
  | "improve"
  | "reports"
  | "kpi"
  | "finance"
  | "tasks"
  | "data"
  | "apis"
  | "settings";

export interface PageDef {
  key: PageKey;
  label: string;
  href: string;
  /** [sectionKey, label]; the first one is the default. "overview" shows every section. */
  sections: ReadonlyArray<readonly [string, string]>;
}

/** FA Analytics menu (docs/BRIEF.md §5). */
export const PAGES: Record<PageKey, PageDef> = {
  overview: { key: "overview", label: "Overview", href: "/", sections: [] },
  operations: {
    key: "operations",
    label: "Operations",
    href: "/operations",
    sections: [["lookup", "Order lookup"], ["receiving", "Receiving"], ["sla", "SLA"], ["returns", "Returns"], ["trends", "Trends & forecast"], ["setup", "Setup"]],
  },
  cost: { key: "cost", label: "Cost & margin", href: "/cost", sections: [["base", "Base cost"], ["serve", "Cost to serve"], ["workbench", "Rate workbench"]] },
  leakage: {
    key: "leakage",
    label: "Leakage",
    href: "/leakage",
    sections: [["overview", "Overview"], ["underbilling", "Under-billing"], ["underpricing", "Under-pricing"], ["ratechecks", "Rate checks"], ["log", "Leakage log"]],
  },
  revenue: { key: "revenue", label: "Revenue protection", href: "/revenue", sections: [["overview", "Overview"], ["cases", "Cases"]] },
  improve: { key: "improve", label: "Improvements & savings", href: "/improve", sections: [["overview", "Overview"], ["ideas", "Ideas"], ["initiatives", "Initiatives"]] },
  reports: { key: "reports", label: "Reports", href: "/reports", sections: [] },
  kpi: {
    key: "kpi",
    label: "KPI",
    href: "/kpi",
    sections: [["overview", "Overview"], ["operations", "Operations"], ["people", "People"], ["finance", "Finance"], ["warehouse", "Warehouse"], ["quality", "Quality & clients"]],
  },
  finance: {
    key: "finance",
    label: "Finance",
    href: "/finance",
    sections: [["overview", "Overview"], ["pl", "P&L"], ["cash", "Cash & debt"], ["wc", "Working capital"], ["clients", "Clients"], ["bank", "Bank pack"]],
  },
  tasks: { key: "tasks", label: "Tasks", href: "/tasks", sections: [["open", "Open"], ["snoozed", "Snoozed"], ["done", "Done"]] },
  data: { key: "data", label: "Data sources", href: "/data", sections: [["wms", "WMS · volumes"], ["xero", "Accounting · Xero"], ["front", "Client service · Front"], ["contracts", "Contracts & rates"], ["ai", "AI · Claude"]] },
  apis: { key: "apis", label: "API connections", href: "/apis", sections: [["connected", "Connected to"], ["keys", "Keys we give out"]] },
  settings: {
    key: "settings",
    label: "Settings",
    href: "/settings",
    sections: [
      ["company", "Company"],
      ["users", "Users"],
      ["contacts", "Contacts & recipients"],
      ["security", "Login & security"],
      ["branding", "Branding"],
      ["rules", "Rules"],
      ["clients", "Clients"],
      ["suppliers", "Suppliers"],
      ["staff", "Staff & allocation"],
      ["services", "Services & minutes"],
      ["tickets", "Ticket types"],
      ["pools", "Cost pools & mapping"],
    ],
  },
};

/** Main menu order; Data sources, API connections and Settings sit at the bottom of the menu. */
export const MAIN_MENU: PageKey[] = ["overview", "operations", "cost", "leakage", "revenue", "improve", "reports", "kpi", "finance", "tasks"];
export const BOTTOM_MENU: PageKey[] = ["data", "apis", "settings"];

/** Which page a pathname belongs to (null for login/setup/unknown). */
export function pageForPath(pathname: string): PageKey | null {
  if (pathname === "/") return "overview";
  for (const p of Object.values(PAGES)) if (p.href !== "/" && (pathname === p.href || pathname.startsWith(p.href + "/"))) return p.key;
  return null;
}

/** Valid section for a page from a raw `?section=` value; falls back to the page's first section. */
export function parseSection(page: PageKey, raw: string | string[] | null | undefined): string {
  const secs = PAGES[page].sections;
  if (!secs.length) return "";
  const v = Array.isArray(raw) ? raw[0] : raw;
  return secs.some(([k]) => k === v) ? (v as string) : secs[0][0];
}

/** True when content tagged with any of `keys` should show for the current section ("overview" shows all). */
export function showSection(current: string, ...keys: string[]): boolean {
  return current === "overview" || current === "" || keys.includes(current);
}

/** Top-bar crumb parts: ["Leakage", "Rate checks"] or ["Overview"]. Overview adds no second part. */
export function crumbFor(page: PageKey, section: string, opts: { pageLabel?: string } = {}): [string] | [string, string] {
  const def = PAGES[page];
  const label = opts.pageLabel ?? def.label;
  if (!def.sections.length || section === "overview") return [label];
  const s = def.sections.find(([k]) => k === section);
  return s ? [label, s[1]] : [label];
}

/** Href for a section, keeping nothing else from the current query (panels close on section change). */
export function sectionHref(page: PageKey, section: string): string {
  const def = PAGES[page];
  return section === def.sections[0]?.[0] ? def.href : `${def.href}?section=${encodeURIComponent(section)}`;
}
