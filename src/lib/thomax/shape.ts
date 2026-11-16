import { createHash } from "node:crypto";

/**
 * Pure helpers for the Thomax copy: query building, dates, row keys, suggestions from Explore samples.
 * No database or network here (unit-tested in shape.test.ts).
 */

export type ThomaxRecord = Record<string, unknown>;

/** Query API page size cap (help page: Limit is capped at 25,000). */
export const PAGE_LIMIT = 25_000;

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Table and field names go into the URL unquoted, so only plain identifiers are allowed. */
export function assertName(name: string, what = "name"): string {
  if (!SAFE_NAME.test(name)) throw new Error(`Invalid Thomax ${what}: "${name}"`);
  return name;
}

/** Cluster sub-domain, e.g. "e" → e.dotwms.com. Letters/digits/hyphen only, so it can't point anywhere else. */
export function assertCluster(cluster: string): string {
  const c = cluster.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(c)) throw new Error(`Invalid Thomax cluster: "${cluster}"`);
  return c;
}

/** 'value' with single quotes doubled. */
export function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** YYYY-MM-DD (UTC parts) for Where windows. */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface QueryParts {
  table: string;
  where?: string[];
  orderBy?: string;
  limit?: number;
  skip?: number;
}

export function buildQueryUrl(cluster: string, q: QueryParts): string {
  const params = new URLSearchParams();
  params.set("Table", assertName(q.table, "table"));
  if (q.where?.length) params.set("Where", q.where.join(" AND "));
  if (q.orderBy) params.set("OrderBy", assertName(q.orderBy, "field"));
  params.set("Limit", String(Math.min(Math.max(1, q.limit ?? PAGE_LIMIT), PAGE_LIMIT)));
  if (q.skip) params.set("Skip", String(q.skip));
  return `https://${assertCluster(cluster)}.dotwms.com/api/2.0/QueryAPI/?${params.toString()}`;
}

/** Where clause for one date window [from, to). */
export function windowWhere(field: string, from: Date, to: Date): string[] {
  assertName(field, "field");
  return [`${field} ge ${quote(ymd(from))}`, `${field} lt ${quote(ymd(to))}`];
}

/** Month windows from `from` (inclusive) up to `until` (exclusive), each [start, nextStart). */
export function monthWindows(from: Date, until: Date): Array<{ from: Date; to: Date }> {
  const out: Array<{ from: Date; to: Date }> = [];
  let s = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (s < until) {
    const next = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1));
    const e = next < until ? next : until;
    out.push({ from: s, to: e });
    s = e;
  }
  return out;
}

/**
 * Thomax date values as returned in JSON. Handles ISO ("2026-06-01T10:00:00", with or without zone),
 * "2026-06-01 10:00:00" and "/Date(1717200000000)/". Anything else → null. Zone-less values are read as UTC
 * wall-clock (only used for ordering and windows; displayed as stored).
 */
export function parseThomaxDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string") return null;
  const s = v.trim();
  const ms = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(s);
  if (ms) return new Date(Number(ms[1]));
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,7}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", se = "0", frac = "0", zone] = m;
  const msPart = Number(frac.slice(0, 3).padEnd(3, "0"));
  if (!zone) {
    const t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se, msPart);
    return Number.isNaN(t) ? null : new Date(t);
  }
  const t = Date.parse(`${y}-${mo}-${d}T${h.padStart(2, "0")}:${mi}:${se}.${String(msPart).padStart(3, "0")}${zone === "Z" ? "Z" : zone.length === 5 ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone}`);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Stable JSON (keys sorted) so the same row always hashes the same. */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(",")}}`;
}

export function rowHash(row: ThomaxRecord): string {
  return createHash("sha256").update(stableJson(row)).digest("hex");
}

/** Row key from the chosen key fields ("|" joined); whole-row hash when none are chosen (MASTER only). */
export function rowKey(row: ThomaxRecord, keyFields: readonly string[]): string {
  if (!keyFields.length) return `h:${rowHash(row)}`;
  return keyFields.map((f) => (row[f] === null || row[f] === undefined ? "" : String(row[f]))).join("|");
}

/** Values for the lookup index: trimmed, upper-cased, 2–100 chars, de-duplicated. */
export function lookupValues(row: ThomaxRecord, fields: readonly string[]): Array<{ field: string; value: string }> {
  const out: Array<{ field: string; value: string }> = [];
  const seen = new Set<string>();
  for (const f of fields) {
    const raw = row[f];
    if (raw === null || raw === undefined || typeof raw === "object") continue;
    const value = String(raw).trim().toUpperCase();
    if (value.length < 2 || value.length > 100 || seen.has(`${f}|${value}`)) continue;
    seen.add(`${f}|${value}`);
    out.push({ field: f, value });
  }
  return out;
}

/** Field names in first-seen order across the sample rows. */
export function fieldsOf(rows: readonly ThomaxRecord[]): string[] {
  const out: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!out.includes(k)) out.push(k);
  return out;
}

function dateLike(rows: readonly ThomaxRecord[], f: string): boolean {
  const vals = rows.map((r) => r[f]).filter((v) => v !== null && v !== undefined && v !== "");
  return vals.length > 0 && vals.every((v) => parseThomaxDate(v) !== null);
}

/** Suggested date field: a create/insert time first, else the first date-like field. */
export function suggestDateField(fields: readonly string[], rows: readonly ThomaxRecord[]): string | null {
  const dates = fields.filter((f) => /(time|date|dt|stamp)$/i.test(f) || dateLike(rows, f)).filter((f) => !rows.length || dateLike(rows, f));
  const pref = [/create/i, /insert/i, /added/i, /^date$/i, /start/i];
  for (const p of pref) {
    const hit = dates.find((f) => p.test(f));
    if (hit) return hit;
  }
  return dates[0] ?? null;
}

/**
 * Suggested key fields: "<TABLE>ID", "ID", or a single *ID field unique in the sample; for line tables
 * (name ends in a digit) the parent ID plus a line/sequence field. Always shown as a suggestion to confirm.
 */
export function suggestKeyFields(table: string, fields: readonly string[], rows: readonly ThomaxRecord[]): string[] {
  const has = (f: string) => fields.find((x) => x.toLowerCase() === f.toLowerCase());
  const unique = (fs: string[]) => {
    if (!rows.length) return true;
    const seen = new Set(rows.map((r) => fs.map((f) => String(r[f] ?? "")).join("|")));
    return seen.size === rows.length;
  };
  const isLine = /\d$/.test(table);
  const lineField = fields.find((f) => /(line(no|num(ber)?)?|seq(uence)?(no)?|lineid)$/i.test(f) && !/time|date/i.test(f));
  const own = has(`${table}ID`) ?? has(`${table.replace(/\d+$/, "")}${table.match(/\d+$/)?.[0] ?? ""}ID`) ?? has("ID") ?? has("RecordID") ?? has("RowID");
  if (own && unique([own]) && !isLine) return [own];
  const ids = fields.filter((f) => /id$/i.test(f) && !/tenant|warehouse|user|carrier|item/i.test(f));
  if (isLine && lineField) {
    const parent = ids.find((f) => f !== lineField);
    if (parent && unique([parent, lineField])) return [parent, lineField];
  }
  if (own && unique([own])) return [own];
  const single = ids.find((f) => unique([f]));
  return single ? [single] : [];
}

/** Suggested lookup fields: order / consignment / tracking / reference numbers. */
export function suggestLookupFields(fields: readonly string[]): string[] {
  return fields.filter((f) => /(order|consign|connote|tracking|reference|^ref|ref$|ponumber|^po$|asn|jobno|jobnumber|barcode|sscc|article)/i.test(f) && !/(time|date|type|status|count|qty)$/i.test(f)).slice(0, 8);
}

/** Every field in a row whose value is a date → timeline events. */
export function dateEvents(row: ThomaxRecord): Array<{ field: string; at: Date }> {
  const out: Array<{ field: string; at: Date }> = [];
  for (const [k, v] of Object.entries(row)) {
    if (typeof v !== "string" || v.length < 10) continue;
    const at = parseThomaxDate(v);
    if (at && at.getUTCFullYear() > 1990) out.push({ field: k, at });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
