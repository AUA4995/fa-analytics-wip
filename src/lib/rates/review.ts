/** Rate review types and stages (brief §8) — shared by pages and components. */
export const TYPES = { CPI: ["Annual CPI increase", "#1f54ee"], CARRIER: ["Carrier rate pass-through", "#e2a33a"], RENEWAL: ["Contract renewal", "#1e7a3c"], ADHOC: ["Ad-hoc / below-cost", "#b42318"] } as const;
export const STAGES = ["Preparing", "Analysis", "Proposal", "Client negotiation", "Signed", "Rates in WMS & Dyspach", "Checked on first invoice"];
