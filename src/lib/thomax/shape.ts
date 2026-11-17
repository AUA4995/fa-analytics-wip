import { createHash } from "node:crypto";

/**
 * Pure helpers for the Thomax copy: query building, dates, row keys, suggestions from Explore samples.
 * No database or network here (unit-tested in shape.test.ts).
 */

export type ThomaxRecord = Record<string, unknown>;

/** Query API page size cap (help page: Limit is capped at 25,000). */
export const PAGE_LIMIT = 25_000;
/** Page size we ask for: smaller pages keep memory down on an office PC (review 16/11/2026). */
export const PAGE_SIZE = 10_000;

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
  if (q.orderBy) params.set("OrderBy", q.orderBy.split(",").map((f) => assertName(f.trim(), "field")).join(","));
  params.set("Limit", String(Math.min(Math.max(1, q.limit ?? PAGE_LIMIT), PAGE_LIMIT)));
  if (q.skip) params.set("Skip", String(q.skip));
  return `https://${assertCluster(cluster)}.dotwms.com/api/2.0/QueryAPI/?${params.toString()}`;
}

const ymdhms = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

/** Where clause for one window [from, to): whole days as YYYY-MM-DD, part days as YYYY-MM-DD HH:MM:SS. */
export function windowWhere(field: string, from: Date, to: Date): string[] {
  assertName(field, "field");
  const fmt = (d: Date) => (d.getTime() % 86_400_000 === 0 ? ymd(d) : ymdhms(d));
  return [`${field} ge ${quote(fmt(from))}`, `${field} lt ${quote(fmt(to))}`];
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

const SYD = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/** A real moment → Sydney wall-clock time stored as if it were UTC (the same scale as zone-less Thomax values). */
function sydneyWallClock(t: number): Date {
  const p = Object.fromEntries(SYD.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, t % 1000 < 0 ? 0 : t % 1000));
}

/**
 * Thomax date values as returned in JSON. Handles ISO ("2026-06-01T10:00:00", with or without a zone),
 * "2026-06-01 10:00:00" and "/Date(1717200000000)/". Anything else, impossible dates (31 Feb, month 13, hour 25)
 * and placeholder years before 1900 (.NET's 0001-01-01) → null.
 * All results are on one scale: Sydney wall-clock time written as UTC. Zone-less values are taken as already
 * Sydney local (the WMS runs in Sydney); zoned and /Date()/ values are converted to Sydney local. So sorting and
 * month windows compare like with like, and a value displays as the warehouse saw it.
 */
export function parseThomaxDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string") return null;
  const s = v.trim();
  const ms = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(s);
  if (ms) {
    const t = Number(ms[1]);
    return new Date(t).getUTCFullYear() < 1900 ? null : sydneyWallClock(t);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,7}))?)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", se = "0", frac = "0", zone] = m;
  const msPart = Number(frac.slice(0, 3).padEnd(3, "0"));
  const Y = +y, M = +mo, D = +d, H = +h, MI = +mi, SE = +se;
  if (Y < 1900 || M < 1 || M > 12 || D < 1 || H > 23 || MI > 59 || SE > 59) return null;
  const local = Date.UTC(Y, M - 1, D, H, MI, SE, msPart);
  if (new Date(local).getUTCDate() !== D) return null; // 31 Feb, 30 Feb …
  if (!zone) return new Date(local);
  const z = zone === "Z" ? 0 : (zone[0] === "-" ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.replace(":", "").slice(3, 5) || 0));
  return sydneyWallClock(local - z * 60_000);
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

/**
 * Row key from the chosen key fields: one field → its value; several → a JSON list (so "x|y"+"z" can't equal
 * "x"+"y|z"). null when any key value is missing — such rows are skipped and counted, never merged together.
 */
export function rowKey(row: ThomaxRecord, keyFields: readonly string[]): string | null {
  if (!keyFields.length) return null;
  const vals: string[] = [];
  for (const f of keyFields) {
    const v = row[f];
    if (v === null || v === undefined || (typeof v === "string" && !v.trim()) || typeof v === "object") return null;
    vals.push(String(v));
  }
  return vals.length === 1 ? vals[0] : JSON.stringify(vals);
}

/**
 * Fields that hold secrets are never stored (USR may hold password hashes, PINs, tokens). Matched on the name's
 * meaning, not any 3 letters: "Password", "UserPwd", "ApiToken", "PinCode" go; "ContactPassport", "QCPassed",
 * "Compass…", "Shipping…" stay. The table page lists what was left out.
 */
const SECRET_FIELD =
  /password|passwd|passcode|passphrase|credential|secret|(^|[_a-z0-9])(pwd|token)$|(api|access|private|auth|licen[cs]e|signing|encryption|consumer|secret)_?key$|client_?secret|(^|_|password)salt$|^(pin|pincode|pinnumber|pinno|hash)$|(user|login|security|access|staff|employee)_?pin(code|number|no)?$|(pin|password)hash$/i;
/** Word-shaped secrets that need case to tell apart: "WebPass", "Pass", "PASS" go; "Compass", "QCPassed" stay. */
const SECRET_WORD = /(^|[a-z0-9_])Pass(Hash|Key)?$|(^|[a-z0-9_])Pw(Hash)?$/;
const SECRET_FIELD_2 =
  /pwd|^pass(hash)?$|passhash|pass_?(word|key)|(^|_)pw(hash)?$|userpw$|tokens$|^totp|t?otp_?(secret|seed|key|code|hash)|(mfa|2fa|auth|totp)_?seed|(security|secret|sec)_?(question|answer)|^answer$|(backup|recovery)_?codes|session_?(id|key|token)|^cookie$|cookies?_?(id|value|data)$|two_?factor_?(key|secret|seed|code)|2fa_?(key|secret|seed|code)|_pin(_?(code|number|no))?$|^pin_(code|number|no)$|(reset|verification|verify|one_?time|auth|login)_?code$|(login|user)_?hash$|^pass\d$|^jwt$|jwt_?token/i;
/** All-lower or all-upper names ending in "pass" ("webpass", "USERPASS"), except ordinary words */
const lowerPass = (f: string) => (f === f.toLowerCase() || f === f.toUpperCase()) && /pass$/i.test(f) && !/(com|by|sur|over|under|tres)pass$/i.test(f);
// "OTP" alone stays: in a 3PL it usually means on-time performance
export function isSecretField(f: string): boolean {
  return SECRET_FIELD.test(f) || SECRET_WORD.test(f) || SECRET_FIELD_2.test(f) || lowerPass(f);
}
export function withoutSecrets(row: ThomaxRecord, exclude: readonly string[] = []): ThomaxRecord {
  const out: ThomaxRecord = {};
  for (const [k, v] of Object.entries(row)) if (!isSecretField(k) && !exclude.includes(k)) out[k] = v;
  return out;
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

/** Field names in first-seen order across the sample rows (secret-looking fields left out). */
export function fieldsOf(rows: readonly ThomaxRecord[]): string[] {
  const out: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!out.includes(k) && !isSecretField(k)) out.push(k);
  return out;
}

/** Of the sample rows, how many have no usable date in `field` (they'd never be copied by date windows). */
export function nullDates(rows: readonly ThomaxRecord[], field: string): number {
  return rows.filter((r) => parseThomaxDate(r[field]) === null).length;
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
