/**
 * Improvements & savings (brief §9a) — pure parts: categories, the saving building blocks, the standard project plan.
 * Saving = cost no longer spent (not leakage). Every block shows its working; payback = investment ÷ monthly saving.
 */

export const DEFAULT_CATEGORIES: Array<{ key: string; name: string; subs: string[] }> = [
  { key: "workflow", name: "Workflow", subs: ["Receiving", "Storage", "Picking", "Packing", "Returns", "Dispatch", "CSR", "Admin", "Accounts", "General"] },
  { key: "suppliers", name: "Suppliers", subs: ["Packaging", "Freight", "Consumables", "Equipment hire", "Services", "General"] },
  { key: "space", name: "Space", subs: ["Racking", "Layout", "Floor stacking", "Second site", "General"] },
  { key: "labour", name: "Labour", subs: ["Rostering", "Agency", "Overtime", "Training", "General"] },
  { key: "equipment", name: "Equipment & automation", subs: ["CMC", "Forklifts", "Scanners", "Software", "General"] },
];
/** Detail where it exists, e.g. Packing → Manual / Automated (CMC) / later Flow wrap */
export const DETAILS: Record<string, string[]> = { Packing: ["Manual", "Automated (CMC)", "Flow wrap (later)"], Picking: ["Single-SKU", "Multi-SKU", "B2B"] };

export const CHANGES: Array<[string, string]> = [
  ["process", "Process & time"],
  ["supplier", "Supplier & price"],
  ["materials", "Materials"],
  ["equipment", "Equipment"],
  ["space", "Space"],
  ["people", "People & rosters"],
];

export const STAGES: Array<[string, string, "idea" | "initiative"]> = [
  ["IDEA", "Idea", "idea"],
  ["PARKED", "Parked", "idea"],
  ["REJECTED", "Rejected", "idea"],
  ["APPROVED", "Approved", "initiative"],
  ["IN_PROGRESS", "In progress", "initiative"],
  ["DONE", "Done", "initiative"],
  ["VERIFIED", "Verified", "initiative"],
];
export const isInitiative = (stage: string) => STAGES.find((s) => s[0] === stage)?.[2] === "initiative";
export const SAVING_TYPES: Array<[string, string, string]> = [
  ["HARD", "Hard saving", "cost that leaves the P&L"],
  ["AVOIDANCE", "Cost avoidance", "a cost increase that doesn't happen"],
  ["SOFT", "Soft (capacity freed)", "time or space freed, not yet cash"],
];

export type BlockKind = "minutes" | "price" | "materials" | "space" | "investment";
export interface CalcBlock {
  kind: BlockKind;
  label?: string;
  inputs: Record<string, number | null>;
}
export const BLOCK_SPEC: Record<BlockKind, { title: string; fields: Array<[string, string]> }> = {
  minutes: { title: "Time saved", fields: [["before", "Minutes per unit before"], ["after", "Minutes per unit after"], ["volume", "Units (orders) per month"], ["costPerMinute", "Labour cost per minute $"]] },
  price: { title: "Supplier price", fields: [["before", "Unit price before $"], ["after", "Unit price after $"], ["qty", "Quantity per month"]] },
  materials: { title: "Materials per order", fields: [["before", "Materials $ per order before"], ["after", "Materials $ per order after"], ["orders", "Orders per month"]] },
  space: { title: "Space", fields: [["before", "Pallet positions before"], ["after", "Pallet positions after"], ["costPerPosition", "Cost per position per month $"]] },
  investment: { title: "Investment (one-off)", fields: [["amount", "One-off cost $"]] },
};

/** Which blocks fit the "what changes" choices (the proposal; Asal edits/confirms). */
export function proposeBlocks(changes: string[], prefill: { ordersPerMonth?: number | null; costPerMinute?: number | null; costPerPosition?: number | null; supplierPrice?: number | null; supplierQty?: number | null }): CalcBlock[] {
  const out: CalcBlock[] = [];
  const has = (c: string) => changes.includes(c);
  if (has("process") || has("people") || has("equipment")) out.push({ kind: "minutes", inputs: { before: null, after: null, volume: prefill.ordersPerMonth ?? null, costPerMinute: prefill.costPerMinute ?? null } });
  if (has("supplier")) out.push({ kind: "price", inputs: { before: prefill.supplierPrice ?? null, after: null, qty: prefill.supplierQty ?? null } });
  if (has("materials")) out.push({ kind: "materials", inputs: { before: null, after: null, orders: prefill.ordersPerMonth ?? null } });
  if (has("space")) out.push({ kind: "space", inputs: { before: null, after: null, costPerPosition: prefill.costPerPosition ?? null } });
  if (has("equipment")) out.push({ kind: "investment", inputs: { amount: null } });
  return out;
}

export interface CalcResult {
  monthly: number | null;
  investment: number;
  paybackMonths: number | null;
  lines: Array<{ title: string; working: string; monthly: number | null }>;
  missing: string[];
}
const m$ = (v: number) => v.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });
const n = (v: number) => v.toLocaleString("en-AU", { maximumFractionDigits: 2 });

/** Saving per month from the blocks. A block with a missing input is listed as missing (no guessing). */
export function calcSaving(blocks: CalcBlock[]): CalcResult {
  const lines: CalcResult["lines"] = [];
  const missing: string[] = [];
  let investment = 0;
  for (const b of blocks) {
    const spec = BLOCK_SPEC[b.kind];
    const i = b.inputs;
    const miss = spec.fields.filter(([k]) => i[k] == null || !Number.isFinite(i[k] as number)).map(([, l]) => l);
    if (b.kind === "investment") {
      if (miss.length) missing.push(`${spec.title}: ${miss.join(", ")}`);
      else investment += i.amount!;
      continue;
    }
    if (miss.length) {
      missing.push(`${spec.title}: ${miss.join(", ")}`);
      lines.push({ title: b.label || spec.title, working: "inputs missing", monthly: null });
      continue;
    }
    let v = 0;
    let w = "";
    if (b.kind === "minutes") {
      v = (i.before! - i.after!) * i.volume! * i.costPerMinute!;
      w = `(${n(i.before!)} − ${n(i.after!)} min) × ${n(i.volume!)} × ${m$(i.costPerMinute!)}/min`;
    } else if (b.kind === "price") {
      v = (i.before! - i.after!) * i.qty!;
      w = `(${m$(i.before!)} − ${m$(i.after!)}) × ${n(i.qty!)}`;
    } else if (b.kind === "materials") {
      v = (i.before! - i.after!) * i.orders!;
      w = `(${m$(i.before!)} − ${m$(i.after!)}) × ${n(i.orders!)} orders`;
    } else {
      v = (i.before! - i.after!) * i.costPerPosition!;
      w = `(${n(i.before!)} − ${n(i.after!)} positions) × ${m$(i.costPerPosition!)}`;
    }
    lines.push({ title: b.label || spec.title, working: `${w} = ${m$(v)} / month`, monthly: v });
  }
  const done = lines.filter((l) => l.monthly != null);
  const monthly = done.length ? done.reduce((a, l) => a + l.monthly!, 0) : null;
  return { monthly, investment, paybackMonths: monthly && monthly > 0 && investment ? investment / monthly : null, lines, missing };
}

/** Standard project plan by category (Claude's proposal; editable). Weeks from the start date. */
export function proposeSteps(category: string, sub: string | null): Array<{ name: string; weeks: [number, number]; kind?: string }> {
  if (sub === "Packing" || category === "suppliers")
    return [
      { name: "Measure before", weeks: [0, 2], kind: "measure_before" },
      { name: "Order / new supply", weeks: [1, 3] },
      { name: "Trial", weeks: [3, 5] },
      { name: "Training", weeks: [4, 6] },
      { name: "Roll-out", weeks: [6, 8] },
      { name: "Embed & check", weeks: [8, 12] },
      { name: "Measure after & recalculate", weeks: [12, 14], kind: "measure_after" },
      { name: "Report", weeks: [14, 15] },
    ];
  if (category === "equipment")
    return [
      { name: "Measure before", weeks: [0, 2], kind: "measure_before" },
      { name: "Quotes & business case", weeks: [1, 4] },
      { name: "Approve & order", weeks: [4, 6] },
      { name: "Install & test", weeks: [8, 12] },
      { name: "Training", weeks: [11, 13] },
      { name: "Go live", weeks: [13, 14] },
      { name: "Measure after & recalculate", weeks: [18, 20], kind: "measure_after" },
      { name: "Report", weeks: [20, 21] },
    ];
  return [
    { name: "Measure before", weeks: [0, 2], kind: "measure_before" },
    { name: "Plan the change", weeks: [1, 3] },
    { name: "Trial", weeks: [3, 5] },
    { name: "Roll-out", weeks: [5, 8] },
    { name: "Embed & check", weeks: [8, 11] },
    { name: "Measure after & recalculate", weeks: [11, 13], kind: "measure_after" },
    { name: "Report", weeks: [13, 14] },
  ];
}

/** Participants suggested from Staff by category and position (Asal edits). */
export function suggestPeople(staff: Array<{ name: string; position: string | null; site: string; pool: string }>, category: string, sub: string | null, detail: string | null): string[] {
  const pos = (s: { position: string | null }) => (s.position ?? "").toLowerCase();
  const out = new Set<string>();
  for (const s of staff) {
    if (/operations manager|ops manager/.test(pos(s))) out.add(s.name);
    if (/warehouse manager|site manager|supervisor/.test(pos(s))) out.add(s.name);
    if (sub === "Packing" && /pack/.test(pos(s)) && (!detail?.includes("CMC") || s.site === "smi")) out.add(s.name);
    if (sub === "Picking" && /pick/.test(pos(s))) out.add(s.name);
    if (category === "suppliers" && /procure|purchas|buyer/.test(pos(s))) out.add(s.name);
    if ((sub === "Accounts" || sub === "Admin") && /account|admin|finance/.test(pos(s))) out.add(s.name);
    if (sub === "CSR" && /csr|customer/.test(pos(s))) out.add(s.name);
  }
  return [...out];
}

export type StepState = "not started" | "in progress" | "done" | "late";
export function stepState(s: { status: string; due: Date | null }, today: Date): StepState {
  if (s.status === "DONE") return "done";
  if (s.due && s.due.getTime() < today.getTime() - 86400000 + 1) return "late";
  return s.status === "IN_PROGRESS" ? "in progress" : "not started";
}
