import { prisma } from "@/lib/db";
import { dateEvents, type ThomaxRecord } from "./shape";
import { tableDef } from "./tables";

/**
 * Operations → Order lookup: exact match on the lookup fields chosen per table (order numbers, consignment
 * numbers, references …), across every copied Thomax table. Then every date in the matching rows becomes a
 * timeline, oldest first.
 */

export const LOOKUP_MAX_ROWS = 200;

export interface LookupRow {
  id: string;
  table: string;
  label: string;
  matchedOn: string[];
  data: ThomaxRecord;
  /** Fields in Thomax order (the database stores JSON keys in its own order) */
  entries: Array<[string, unknown]>;
}

export interface LookupResult {
  term: string;
  rows: LookupRow[];
  truncated: boolean;
  timeline: Array<{ at: Date; table: string; field: string; rowId: string }>;
  /** Other lookup values found in the matching rows (e.g. the consignment number of an order) */
  related: Array<{ table: string; field: string; value: string }>;
}

export function normaliseTerm(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 100);
}

export async function lookup(raw: string): Promise<LookupResult | null> {
  const term = normaliseTerm(raw);
  if (term.length < 2) return null;
  const refs = await prisma.thomaxRef.findMany({ where: { value: term }, select: { rowId: true, field: true }, take: LOOKUP_MAX_ROWS * 4 });
  const fieldsByRow = new Map<string, string[]>();
  for (const r of refs) fieldsByRow.set(String(r.rowId), [...(fieldsByRow.get(String(r.rowId)) ?? []), r.field]);
  const ids = [...fieldsByRow.keys()].slice(0, LOOKUP_MAX_ROWS).map((x) => BigInt(x));
  const found = ids.length ? await prisma.thomaxRow.findMany({ where: { id: { in: ids } }, select: { id: true, table: true, data: true }, orderBy: [{ table: "asc" }, { at: "asc" }] }) : [];
  const meta = await prisma.thomaxTable.findMany({ select: { name: true, lookupFields: true, fields: true } });
  const tables = new Map(meta.map((t) => [t.name, t.lookupFields]));
  const order = new Map(meta.map((t) => [t.name, Array.isArray(t.fields) ? (t.fields as string[]) : []]));
  const ordered = (table: string, d: ThomaxRecord): Array<[string, unknown]> => {
    const o = order.get(table) ?? [];
    const rank = (k: string) => (o.includes(k) ? o.indexOf(k) : o.length);
    return Object.entries(d).sort((a, b) => rank(a[0]) - rank(b[0]));
  };
  const rows: LookupRow[] = found.map((f) => ({ id: String(f.id), table: f.table, label: tableDef(f.table)?.label ?? f.table, matchedOn: fieldsByRow.get(String(f.id)) ?? [], data: f.data as ThomaxRecord, entries: ordered(f.table, f.data as ThomaxRecord) }));
  const timeline = rows.flatMap((r) => dateEvents(r.data).map((e) => ({ ...e, table: r.table, rowId: r.id }))).sort((a, b) => a.at.getTime() - b.at.getTime());
  const relatedSeen = new Set<string>();
  const related: LookupResult["related"] = [];
  for (const r of rows) {
    for (const f of tables.get(r.table) ?? []) {
      const v = r.data[f];
      if (v === null || v === undefined || typeof v === "object") continue;
      const value = String(v).trim();
      if (value.length < 2 || normaliseTerm(value) === term || relatedSeen.has(`${f}|${value}`)) continue;
      relatedSeen.add(`${f}|${value}`);
      related.push({ table: r.table, field: f, value });
    }
  }
  return { term, rows, truncated: fieldsByRow.size > LOOKUP_MAX_ROWS, timeline, related: related.slice(0, 40) };
}

/** Thomax times (Sydney wall-clock on the UTC scale, see parseThomaxDate) as DD/MM/YYYY HH:MM. */
export function showThomaxTime(d: Date): string {
  const iso = d.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}
