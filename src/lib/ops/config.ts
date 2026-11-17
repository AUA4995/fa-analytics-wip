import { prisma } from "@/lib/db";
import { assertName } from "@/lib/thomax/shape";
import { THOMAX_TABLE_NAMES } from "@/lib/thomax/tables";
import { DEFAULT_RULES, parseHolidays, type OpsRules } from "./calc";

/**
 * Operations setup (batch 5): which Thomax table and which of its fields mean "client", "created", "done" … for each
 * flow. Thomax field names are only known after Explore, so they are chosen here by an admin, never guessed in code.
 * Stored in Setting "ops:config".
 */

export type FlowKey = "dispatch" | "receiving" | "expected";
export type RoleKey = "tenant" | "created" | "done" | "ref" | "type" | "warehouse";

export interface Flow {
  table: string;
  roles: Partial<Record<RoleKey, string>>;
}

export interface OpsConfig {
  flows: Record<FlowKey, Flow>;
  /** Dispatch: field values that mean a B2B order (matched case-insensitively on the "type" field) */
  b2bValues: string[];
  rules: OpsRules;
}

export const FLOW_INFO: Record<FlowKey, { title: string; defaultTable: string; roles: ReadonlyArray<readonly [RoleKey, string, boolean]> }> = {
  dispatch: {
    title: "Orders (dispatch)",
    defaultTable: "PCK",
    roles: [
      ["tenant", "Client (tenant) field", true],
      ["created", "Order created / released", true],
      ["done", "Shipped / completed", true],
      ["ref", "Order number", false],
      ["type", "Order type (to tell B2B)", false],
      ["warehouse", "Warehouse", false],
    ],
  },
  receiving: {
    title: "Receipts (receiving)",
    defaultTable: "RCP",
    roles: [
      ["tenant", "Client (tenant) field", true],
      ["created", "Arrived", true],
      ["done", "Received / put away", true],
      ["ref", "Receipt number", false],
      ["type", "Receipt type (unit / carton / pallet / container)", false],
      ["warehouse", "Warehouse", false],
    ],
  },
  expected: {
    title: "Expected deliveries (ASN)",
    defaultTable: "RCPE",
    roles: [
      ["tenant", "Client (tenant) field", true],
      ["created", "Expected date (ETA)", true],
      ["ref", "ASN / reference", false],
      ["type", "Receipt type", false],
      ["warehouse", "Warehouse", false],
    ],
  },
};

export const FLOW_KEYS: FlowKey[] = ["dispatch", "receiving", "expected"];

export function defaultConfig(): OpsConfig {
  return {
    flows: { dispatch: { table: "PCK", roles: {} }, receiving: { table: "RCP", roles: {} }, expected: { table: "RCPE", roles: {} } },
    b2bValues: [],
    rules: { ...DEFAULT_RULES },
  };
}

const KEY = "ops:config";

function clean(raw: unknown): OpsConfig {
  const d = defaultConfig();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Partial<OpsConfig>;
  for (const k of FLOW_KEYS) {
    const f = o.flows?.[k];
    if (f && typeof f.table === "string" && THOMAX_TABLE_NAMES.includes(f.table)) {
      const roles: Partial<Record<RoleKey, string>> = {};
      for (const [r] of FLOW_INFO[k].roles) {
        const v = f.roles?.[r];
        if (typeof v === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v)) roles[r] = v;
      }
      d.flows[k] = { table: f.table, roles };
    }
  }
  if (Array.isArray(o.b2bValues)) d.b2bValues = o.b2bValues.filter((v): v is string => typeof v === "string").slice(0, 20);
  const r = o.rules;
  if (r) {
    if (Number.isInteger(r.cutoffHour) && r.cutoffHour >= 0 && r.cutoffHour <= 23) d.rules.cutoffHour = r.cutoffHour;
    if (Number.isInteger(r.b2bExtraDays) && r.b2bExtraDays >= 0 && r.b2bExtraDays <= 10) d.rules.b2bExtraDays = r.b2bExtraDays;
    if (Number.isFinite(r.receivingHours) && r.receivingHours > 0 && r.receivingHours <= 720) d.rules.receivingHours = r.receivingHours;
    if (Array.isArray(r.holidays)) d.rules.holidays = parseHolidays(r.holidays.join(",")).dates;
  }
  return d;
}

export async function getOpsConfig(): Promise<OpsConfig> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } }).catch(() => null);
  return clean(row?.value);
}

/** Is every required field of a flow chosen? */
export function flowReady(cfg: OpsConfig, k: FlowKey): boolean {
  return FLOW_INFO[k].roles.every(([r, , req]) => !req || !!cfg.flows[k].roles[r]);
}

export interface ConfigInput {
  flows: Record<FlowKey, { table: string; roles: Partial<Record<RoleKey, string>> }>;
  b2bValues: string;
  cutoffHour: string;
  b2bExtraDays: string;
  receivingHours: string;
  holidays: string;
}

/** Validates against the fields Explore found; throws plain-words errors. */
export async function saveOpsConfig(input: ConfigInput): Promise<OpsConfig> {
  const tables = await prisma.thomaxTable.findMany({ select: { name: true, fields: true } });
  const fieldsOf = (t: string) => {
    const f = tables.find((x) => x.name === t)?.fields;
    return Array.isArray(f) ? (f as string[]) : [];
  };
  const out = defaultConfig();
  for (const k of FLOW_KEYS) {
    const f = input.flows[k];
    if (!f || !THOMAX_TABLE_NAMES.includes(f.table)) throw new Error(`${FLOW_INFO[k].title}: choose a Thomax table.`);
    const known = fieldsOf(f.table);
    const roles: Partial<Record<RoleKey, string>> = {};
    for (const [r, label] of FLOW_INFO[k].roles) {
      const v = (f.roles[r] ?? "").trim();
      if (!v) continue;
      assertName(v, "field");
      if (!known.includes(v)) throw new Error(`${FLOW_INFO[k].title}: "${v}" isn't a field of ${f.table} (${label}). Run Explore on Data sources → WMS first.`);
      roles[r] = v;
    }
    out.flows[k] = { table: f.table, roles };
  }
  out.b2bValues = input.b2bValues
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  const int = (s: string, lo: number, hi: number, what: string) => {
    const n = Number(s);
    if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${what} must be between ${lo} and ${hi}.`);
    return n;
  };
  out.rules.cutoffHour = Math.round(int(input.cutoffHour, 0, 23, "Cut-off hour"));
  out.rules.b2bExtraDays = Math.round(int(input.b2bExtraDays, 0, 10, "B2B extra working days"));
  out.rules.receivingHours = int(input.receivingHours, 1, 720, "Receiving target (hours)");
  const h = parseHolidays(input.holidays);
  if (h.bad.length) throw new Error(`Public holidays: can't read ${h.bad.slice(0, 3).join(", ")} — use 25/12/2026 or 2026-12-25.`);
  out.rules.holidays = h.dates;
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: out as never }, update: { value: out as never } });
  return out;
}
