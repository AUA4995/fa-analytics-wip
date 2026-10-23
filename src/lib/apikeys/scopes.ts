/** Scopes for keys we give out (brief §12). Read-only by default; pay by person is never available through a key. */
export const SCOPES: Array<{ key: string; label: string; detail: string; write?: boolean; internal?: boolean }> = [
  { key: "volumes:read", label: "Orders and volumes", detail: "Orders, units and SKUs per client per month (WMS)" },
  { key: "kpi:read", label: "KPIs", detail: "KPI values and targets, by month and site" },
  { key: "leakage:read", label: "Leakage", detail: "Open and recovered leakage findings", internal: true },
  { key: "costs:read", label: "Costs and margins", detail: "Base cost per order and margin per client — internal figures", internal: true },
  { key: "finance:read", label: "Finance summary", detail: "Company P&L by month and bank ratios (no pay by person)", internal: true },
  { key: "improve:read", label: "Improvements", detail: "Ideas and initiatives with savings" },
  { key: "tasks:write", label: "Create tasks", detail: "Another app can add a follow-up task (logged with the key's name)", write: true },
];
export const SCOPE_KEYS = SCOPES.map((s) => s.key);
