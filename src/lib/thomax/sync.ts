import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { Prisma } from "@/generated/prisma/client";
import { queryAll, queryPage, ThomaxError, type ClientOptions, type ThomaxCreds } from "./client";
import { THOMAX_TABLES } from "./tables";
import {
  assertCluster,
  assertName,
  fieldsOf,
  isSecretField,
  lookupValues,
  monthWindows,
  nullDates,
  parseThomaxDate,
  rowHash,
  rowKey,
  suggestDateField,
  suggestKeyFields,
  suggestLookupFields,
  windowWhere,
  withoutSecrets,
  type ThomaxRecord,
} from "./shape";

/**
 * The Thomax copy in Analytics (decision 11/11/2026). Read-only towards Thomax: only GET queries.
 *   Explore  — Limit=5 per table: field names + 5 sample rows; suggests date / key / lookup fields.
 *   Confirm  — an owner saves each table's settings (a key is required); nothing is copied before that.
 *   History  — month windows from historyFrom (2021) to today, one window per table per step.
 *   Nightly  — MASTER tables re-read in full; TRANSACTIONAL: the last `recheckDays` days (status changes) plus rows
 *              with no date at all.
 * Rows are stored as returned (minus secret-looking fields). A re-read updates a row only when it changed (hash).
 * Pages are ordered by the first key field so Skip can't skip or repeat rows. A refused login stops everything
 * (it's recorded on the connection) so a wrong password can't lock the .wms user with repeated tries.
 * Review fixes 16/11/2026: see the tester's and security reviewer's lists in the batch 1 report.
 */

const SOURCE = "THOMAX";
const DAY = 86_400_000;

export type ThomaxOptions = ClientOptions & { pageSize?: number };

/** Only 401 is a refused login (pauses everything). 403 = this user may not read one table: only that table is marked. */
const isAuthError = (err: unknown) => err instanceof ThomaxError && err.status === 401;
const isNetworkError = (err: unknown) => err instanceof ThomaxError && err.status === null && /didn't answer/.test(err.message);

// ---------- connection ----------

export async function getConnectionInfo() {
  return prisma.thomaxConnection.findUnique({
    where: { id: "thomax" },
    select: { cluster: true, username: true, historyFrom: true, recheckDays: true, enabled: true, updatedAt: true, updatedBy: true, lastTestAt: true, lastTestOk: true, lastError: true },
  });
}

/** Credentials, or null when not connected — or when the last login was refused (fix the password first). */
export async function getCreds(): Promise<ThomaxCreds | null> {
  const c = await prisma.thomaxConnection.findUnique({ where: { id: "thomax" } });
  if (!c || !c.enabled) return null;
  return { cluster: c.cluster, username: c.username, password: decrypt(c.passwordEnc) };
}

async function recordTest(ok: boolean, error: string | null, disable = false): Promise<void> {
  await prisma.thomaxConnection.updateMany({ where: { id: "thomax" }, data: { lastTestAt: new Date(), lastTestOk: ok, lastError: error, ...(disable ? { enabled: false } : {}) } });
}

/** A refused login: stop every copy until the owner saves a working login (enabled = false). */
async function loginRefused(err: unknown): Promise<void> {
  await recordTest(false, `${msg(err)} — copying is paused until the login is fixed (Change login).`, true);
}

export interface ConnectionInput {
  cluster: string;
  username: string;
  /** Empty → keep the stored password (only if the cluster and user name are unchanged) */
  password?: string;
  historyFrom?: string;
  recheckDays?: number;
}

export async function saveConnection(input: ConnectionInput, by: string): Promise<void> {
  const cluster = assertCluster(input.cluster);
  const username = input.username.trim();
  if (!username || username.length > 200) throw new Error("Enter the .wms user name.");
  const existing = await prisma.thomaxConnection.findUnique({ where: { id: "thomax" } });
  const password = input.password ?? "";
  if (!existing && !password) throw new Error("Enter the password.");
  // The stored password is only re-used for the same cluster and user — never sent to a different place.
  if (existing && !password && (existing.cluster !== cluster || existing.username !== username)) throw new Error("Changing the cluster or user name needs the password again.");
  if (password.length > 500) throw new Error("Password is too long.");
  const historyFrom = input.historyFrom ? new Date(`${input.historyFrom}T00:00:00Z`) : undefined;
  if (historyFrom && (Number.isNaN(historyFrom.getTime()) || historyFrom.getUTCFullYear() < 2000 || historyFrom > new Date())) throw new Error("History start date isn't valid.");
  const recheckDays = input.recheckDays === undefined ? undefined : Math.round(input.recheckDays);
  if (recheckDays !== undefined && (recheckDays < 1 || recheckDays > 90)) throw new Error("Re-check days must be 1–90.");
  const data = {
    cluster,
    username,
    ...(password ? { passwordEnc: encrypt(password) } : {}),
    ...(historyFrom ? { historyFrom } : {}),
    ...(recheckDays !== undefined ? { recheckDays } : {}),
    enabled: true,
    lastError: null,
    lastTestOk: null,
    updatedBy: by,
  };
  if (existing) {
    await prisma.thomaxConnection.update({ where: { id: "thomax" }, data });
    // An earlier start date: read the history again from it (rows are updated, not duplicated)
    if (historyFrom && historyFrom < existing.historyFrom) await prisma.thomaxTable.updateMany({ data: { historyDoneTo: null } });
  }
  else await prisma.thomaxConnection.create({ data: { ...data, passwordEnc: encrypt(password) } });
  await ensureTables();
}

export async function disconnect(): Promise<void> {
  await prisma.thomaxConnection.deleteMany({ where: { id: "thomax" } });
}

/** Test: one row from TNT (tenants). The result is kept on the connection and shown on the panel. */
export async function testConnection(opts?: ThomaxOptions): Promise<{ ok: true; sample: number }> {
  const c = await prisma.thomaxConnection.findUnique({ where: { id: "thomax" } });
  if (!c) throw new ThomaxError("Thomax isn't connected yet.");
  const creds = { cluster: c.cluster, username: c.username, password: decrypt(c.passwordEnc) };
  try {
    const rows = await queryPage(creds, { table: "TNT", limit: 1 }, { maxRetries: 0, timeoutMs: 60_000, ...opts });
    await prisma.thomaxConnection.update({ where: { id: "thomax" }, data: { lastTestAt: new Date(), lastTestOk: true, lastError: null, enabled: true } });
    return { ok: true, sample: rows.length };
  } catch (err) {
    await recordTest(false, msg(err), isAuthError(err));
    throw err;
  }
}

/** Catalogue rows exist for every known table (ATR and USR off by default). */
export async function ensureTables(): Promise<void> {
  const have = new Set((await prisma.thomaxTable.findMany({ select: { name: true } })).map((t) => t.name));
  const missing = THOMAX_TABLES.filter((t) => !have.has(t.name));
  if (missing.length) await prisma.thomaxTable.createMany({ data: missing.map((t) => ({ name: t.name, kind: t.kind, enabled: !t.off })), skipDuplicates: true });
}

// ---------- explore ----------

export async function exploreTable(name: string, opts?: ThomaxOptions): Promise<{ fields: number; empty: boolean }> {
  assertName(name, "table");
  const creds = await getCreds();
  if (!creds) throw new ThomaxError("Thomax isn't connected, or its login was refused — check Change login.");
  const t = await prisma.thomaxTable.findUnique({ where: { name } });
  if (!t) throw new Error(`Unknown table ${name}`);
  try {
    const raw = await queryPage(creds, { table: name, limit: 5 }, { maxRetries: 1, timeoutMs: 130_000, ...opts });
    const droppedFields = [...new Set(raw.flatMap((r) => Object.keys(r)))].filter(isSecretField);
    const rows = raw.map(withoutSecrets);
    if (!rows.length) {
      // An empty table: keep the fields found before (if any)
      await prisma.thomaxTable.update({ where: { name }, data: { lastError: null, exploredAt: t.exploredAt ?? new Date(), ...(t.fields ? {} : { sample: [] }) } });
      return { fields: Array.isArray(t.fields) ? (t.fields as string[]).length : 0, empty: true };
    }
    const fields = fieldsOf(rows);
    const unconfirmed = !t.confirmedAt;
    const dateField = suggestDateField(fields, rows);
    await prisma.thomaxTable.update({
      where: { name },
      data: {
        fields: fields as unknown as Prisma.InputJsonValue,
        droppedFields,
        sample: rows as unknown as Prisma.InputJsonValue,
        exploredAt: new Date(),
        lastError: null,
        // Suggestions only until an owner confirms; confirmed settings are never overwritten.
        ...(unconfirmed
          ? {
              dateField: t.kind === "MASTER" ? null : dateField,
              keyFields: suggestKeyFields(name, fields, rows),
              lookupFields: suggestLookupFields(fields),
            }
          : {}),
      },
    });
    return { fields: fields.length, empty: false };
  } catch (err) {
    if (isAuthError(err)) await loginRefused(err);
    await prisma.thomaxTable.update({ where: { name }, data: { lastError: msg(err) } });
    throw err;
  }
}

/** Explore every enabled table, one after another. Stops at a refused login or when Thomax can't be reached. */
export async function exploreAll(opts?: ThomaxOptions): Promise<{ ok: number; failed: string[]; stopped: string | null }> {
  await ensureTables();
  const tables = await prisma.thomaxTable.findMany({ where: { enabled: true }, orderBy: { name: "asc" } });
  let ok = 0;
  const failed: string[] = [];
  for (const t of tables) {
    try {
      await exploreTable(t.name, opts);
      ok++;
    } catch (err) {
      failed.push(t.name);
      if (isAuthError(err)) return { ok, failed, stopped: "Thomax refused the login — stopped. Check the user name and password (Change login)." };
      if (isNetworkError(err) || /isn't connected/.test(msg(err))) return { ok, failed, stopped: `Thomax can't be reached — stopped (${msg(err)}).` };
    }
  }
  return { ok, failed, stopped: null };
}

// ---------- confirm settings ----------

export interface TableSettings {
  enabled: boolean;
  kind: "TRANSACTIONAL" | "MASTER";
  dateField: string | null;
  keyFields: string[];
  lookupFields: string[];
  /** Must be true when the key changes on a table that already has rows (they are deleted and copied again) */
  confirmKeyChange?: boolean;
}

export async function saveTableSettings(name: string, s: TableSettings, by: string): Promise<{ cleared: boolean }> {
  assertName(name, "table");
  const t = await prisma.thomaxTable.findUnique({ where: { name } });
  if (!t) throw new Error(`Unknown table ${name}`);
  const fields = Array.isArray(t.fields) ? (t.fields as string[]) : [];
  const known = (f: string) => fields.includes(f);
  if (s.kind !== "TRANSACTIONAL" && s.kind !== "MASTER") throw new Error("Unknown kind");
  if (s.dateField && !known(s.dateField)) throw new Error(`${name}: date field "${s.dateField}" isn't one of the table's fields — run Explore first.`);
  for (const f of [...s.keyFields, ...s.lookupFields]) if (!known(f)) throw new Error(`${name}: "${f}" isn't one of the table's fields.`);
  if (s.enabled && s.kind === "TRANSACTIONAL" && !s.dateField) throw new Error(`${name}: choose the date field used to copy history, or set the table to "re-read in full".`);
  if (s.enabled && !s.keyFields.length) throw new Error(`${name}: choose the field(s) that identify one row, so re-reads update rows instead of adding copies.`);
  if (s.keyFields.length > 4 || s.lookupFields.length > 12) throw new Error("Too many fields chosen.");
  const sample = Array.isArray(t.sample) ? (t.sample as ThomaxRecord[]) : [];
  if (s.enabled && s.kind === "TRANSACTIONAL" && s.dateField && sample.length && nullDates(sample, s.dateField) === sample.length) throw new Error(`${name}: "${s.dateField}" has no dates in the sample rows — choose a date field.`);
  const keyChanged = !!t.confirmedAt && t.keyFields.join("\u0000") !== s.keyFields.join("\u0000");
  const dateChanged = !!t.confirmedAt && (t.dateField ?? "") !== (s.kind === "MASTER" ? "" : (s.dateField ?? ""));
  if (keyChanged && t.rowCount > 0 && !s.confirmKeyChange) throw new Error(`${name}: changing the key deletes the ${t.rowCount.toLocaleString("en-AU")} copied rows and copies the table again — tick "I understand" to go ahead.`);
  await prisma.$transaction(async (tx) => {
    if (keyChanged) {
      await tx.thomaxRow.deleteMany({ where: { table: name } });
      await tx.thomaxTable.update({ where: { name }, data: { historyDoneTo: null, maxSeen: null, rowCount: 0 } });
    } else if (dateChanged) {
      // A different date field: read the history again with it (rows are updated, not duplicated)
      await tx.thomaxTable.update({ where: { name }, data: { historyDoneTo: null, maxSeen: null } });
    }
    await tx.thomaxTable.update({
      where: { name },
      data: { enabled: s.enabled, kind: s.kind, dateField: s.kind === "MASTER" ? null : s.dateField, keyFields: s.keyFields, lookupFields: s.lookupFields, confirmedAt: new Date(), confirmedBy: by },
    });
  });
  if (!keyChanged && t.confirmedAt && t.lookupFields.join("|") !== s.lookupFields.join("|")) await rebuildRefs(name, s.lookupFields);
  return { cleared: keyChanged };
}

// ---------- storing rows ----------

interface TableCfg {
  name: string;
  keyFields: string[];
  lookupFields: string[];
  dateField: string | null;
}

export interface StoreResult {
  inserted: number;
  updated: number;
  /** Rows without a value in a key field — skipped, never merged together */
  noKey: number;
  /** Distinct keys stored from these rows */
  keys: number;
  maxAt: Date | null;
}

/** Upsert a page of rows; unchanged rows (same hash) aren't touched. */
export async function storeRows(cfg: TableCfg, raw: ThomaxRecord[]): Promise<StoreResult> {
  let inserted = 0;
  let updated = 0;
  let noKey = 0;
  let maxAt: Date | null = null;
  // De-duplicate within the page (last wins) — ON CONFLICT can't touch the same row twice in one statement.
  const byKey = new Map<string, ThomaxRecord>();
  for (const r0 of raw) {
    const r = withoutSecrets(r0);
    const k = rowKey(r, cfg.keyFields);
    if (k === null) {
      noKey++;
      continue;
    }
    byKey.set(k, r);
  }
  const all = [...byKey.entries()];
  for (let i = 0; i < all.length; i += 1000) {
    const chunk = all.slice(i, i + 1000);
    const keys: string[] = [];
    const datas: string[] = [];
    const hashes: string[] = [];
    const ats: (string | null)[] = [];
    for (const [k, r] of chunk) {
      const at = cfg.dateField ? parseThomaxDate(r[cfg.dateField]) : null;
      if (at && (!maxAt || at > maxAt)) maxAt = at;
      keys.push(k);
      datas.push(JSON.stringify(r));
      hashes.push(rowHash(r));
      ats.push(at ? at.toISOString() : null);
    }
    const changed = await prisma.$queryRaw<Array<{ id: bigint; key: string; inserted: boolean }>>`
      INSERT INTO "ThomaxRow" ("table", "key", "data", "hash", "at", "updatedAt")
      SELECT ${cfg.name}, t.k, t.d::jsonb, t.h, t.a::timestamp, now()
      FROM unnest(${keys}::text[], ${datas}::text[], ${hashes}::text[], ${ats}::text[]) AS t(k, d, h, a)
      ON CONFLICT ("table", "key") DO UPDATE
        SET "data" = EXCLUDED."data", "hash" = EXCLUDED."hash", "at" = EXCLUDED."at", "updatedAt" = now()
        WHERE "ThomaxRow"."hash" <> EXCLUDED."hash"
      RETURNING "id", "key", (xmax = 0) AS inserted`;
    for (const c of changed) {
      if (c.inserted) inserted++;
      else updated++;
    }
    if (changed.length && cfg.lookupFields.length) {
      const rowFor = new Map(chunk);
      const ids = changed.map((c) => c.id);
      await prisma.thomaxRef.deleteMany({ where: { rowId: { in: ids } } });
      const refs: Array<{ rowId: bigint; field: string; value: string }> = [];
      for (const c of changed) {
        const r = rowFor.get(c.key);
        if (r) for (const v of lookupValues(r, cfg.lookupFields)) refs.push({ rowId: c.id, ...v });
      }
      if (refs.length) await prisma.thomaxRef.createMany({ data: refs });
    }
  }
  return { inserted, updated, noKey, keys: byKey.size, maxAt };
}

async function rebuildRefs(table: string, lookupFields: string[]): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "ThomaxRef" r USING "ThomaxRow" w WHERE r."rowId" = w."id" AND w."table" = ${table}`;
  if (!lookupFields.length) return;
  let lastId = BigInt(0);
  for (;;) {
    const batch = await prisma.thomaxRow.findMany({ where: { table, id: { gt: lastId } }, orderBy: { id: "asc" }, take: 2000, select: { id: true, data: true } });
    if (!batch.length) return;
    const refs: Array<{ rowId: bigint; field: string; value: string }> = [];
    for (const b of batch) for (const v of lookupValues(b.data as ThomaxRecord, lookupFields)) refs.push({ rowId: b.id, ...v });
    if (refs.length) await prisma.thomaxRef.createMany({ data: refs });
    lastId = batch[batch.length - 1].id;
  }
}

async function finishTable(name: string, extra: Prisma.ThomaxTableUpdateInput, maxAt: Date | null, warning: string | null) {
  const count = await prisma.thomaxRow.count({ where: { table: name } });
  const t = await prisma.thomaxTable.findUnique({ where: { name }, select: { maxSeen: true } });
  const maxSeen = maxAt && (!t?.maxSeen || maxAt > t.maxSeen) ? maxAt : (t?.maxSeen ?? null);
  await prisma.thomaxTable.update({ where: { name }, data: { ...extra, rowCount: count, maxSeen, lastSyncAt: new Date(), lastError: warning } });
}

// ---------- copying ----------

type ReadyTable = TableCfg & { kind: string; historyDoneTo: Date | null };

async function readyTables(): Promise<ReadyTable[]> {
  const rows = await prisma.thomaxTable.findMany({ where: { enabled: true, confirmedAt: { not: null } }, orderBy: { name: "asc" } });
  return rows
    // ATR needs an InnerJoin parameter the copy doesn't send; every other table can be switched on by the owner
    .filter((t) => t.name !== "ATR" && t.keyFields.length > 0)
    .map((t) => ({ name: t.name, kind: t.kind, keyFields: t.keyFields, lookupFields: t.lookupFields, dateField: t.dateField, historyDoneTo: t.historyDoneTo }));
}

interface CopyResult {
  /** More than one page was read and some keys came back twice: Thomax's order wasn't stable between pages,
   *  so rows may also have been missed. The window is then read again day by day. */
  unstable: boolean;
  read: number;
  inserted: number;
  updated: number;
  noKey: number;
  maxAt: Date | null;
  /** Problem worth showing on the table (rows skipped for no key, fewer distinct rows than read) */
  warning: string | null;
}

async function copy(creds: ThomaxCreds, t: TableCfg, where: string[] | undefined, opts?: ThomaxOptions): Promise<CopyResult> {
  const out: CopyResult = { unstable: false, read: 0, inserted: 0, updated: 0, noKey: 0, maxAt: null, warning: null };
  const seen = new Set<string>();
  let pages = 0;
  // Order by the first key field (unique per row for single-field keys) so paging with Skip is stable.
  out.read = await queryAll(creds, { table: t.name, where, orderBy: t.keyFields[0] }, async (rows) => {
    for (const r of rows) {
      const k = rowKey(withoutSecrets(r), t.keyFields);
      if (k !== null) seen.add(k);
    }
    pages++;
    await beat();
    const r = await storeRows(t, rows);
    out.inserted += r.inserted;
    out.updated += r.updated;
    out.noKey += r.noKey;
    if (r.maxAt && (!out.maxAt || r.maxAt > out.maxAt)) out.maxAt = r.maxAt;
  }, opts);
  const notes: string[] = [];
  if (out.noKey) notes.push(`${out.noKey} rows had no value in the key field(s) and were skipped`);
  const dupes = out.read - out.noKey - seen.size;
  if (dupes > 0 && pages > 1) out.unstable = true;
  else if (dupes > 0) notes.push(`${dupes} rows repeated a key already read — check the key fields`);
  out.warning = notes.length ? notes.join("; ") : null;
  return out;
}

/**
 * Copy one date window of a TRANSACTIONAL table. If paging wasn't stable (keys repeated across pages, so rows may have
 * been missed), the window is read again one day at a time — a day usually fits in one page, which can't skip rows.
 * A day that still isn't stable is an error, so the window is not marked as loaded.
 */
export async function copyWindow(creds: ThomaxCreds, t: TableCfg, from: Date, to: Date, opts?: ThomaxOptions): Promise<CopyResult> {
  if (!t.dateField) throw new Error(`${t.name} has no date field`);
  const r = await copy(creds, t, windowWhere(t.dateField, from, to), opts);
  if (!r.unstable || to.getTime() - from.getTime() <= DAY) {
    if (r.unstable) throw new ThomaxError(`${t.name} ${from.toISOString().slice(0, 10)}: more rows in one day than one page, and Thomax didn't keep their order between pages — rows may be missing. Tell Claude (the day can't be split further).`);
    return r;
  }
  const total: CopyResult = { unstable: false, read: 0, inserted: r.inserted, updated: r.updated, noKey: 0, maxAt: r.maxAt, warning: null };
  const notes = new Set<string>();
  for (let d = from.getTime(); d < to.getTime(); d += DAY) {
    const day = await copyWindow(creds, t, new Date(d), new Date(Math.min(d + DAY, to.getTime())), opts);
    total.read += day.read;
    total.inserted += day.inserted;
    total.updated += day.updated;
    total.noKey += day.noKey;
    if (day.maxAt && (!total.maxAt || day.maxAt > total.maxAt)) total.maxAt = day.maxAt;
    if (day.warning) notes.add(day.warning);
  }
  total.warning = notes.size ? [...notes].join("; ") : null;
  return total;
}

/** Rows whose date field is empty never fall in a window: read them separately (nightly). */
export async function copyNoDate(creds: ThomaxCreds, t: TableCfg, opts?: ThomaxOptions): Promise<CopyResult> {
  if (!t.dateField) throw new Error(`${t.name} has no date field`);
  return copy(creds, t, [`${assertName(t.dateField, "field")} is null`], opts);
}

/** Re-read a MASTER table in full. Rows that disappear from Thomax are kept (it's an archive). */
export async function copyMaster(creds: ThomaxCreds, t: TableCfg, opts?: ThomaxOptions): Promise<CopyResult> {
  const r = await copy(creds, t, undefined, opts);
  if (r.unstable) r.warning = [r.warning, "Thomax didn't keep the row order between pages, so some rows may be missing until the next night's read"].filter(Boolean).join("; ");
  return r;
}

/** Rows dated before the history start (placeholder dates like 01/01/1900) never fall in a month window: read once. */
export async function copyBefore(creds: ThomaxCreds, t: TableCfg, before: Date, opts?: ThomaxOptions): Promise<CopyResult> {
  if (!t.dateField) throw new Error(`${t.name} has no date field`);
  return copy(creds, t, [`${assertName(t.dateField, "field")} lt '${before.toISOString().slice(0, 10)}'`], opts);
}

export interface StepResult {
  windows: number;
  rows: number;
  remaining: number;
  errors: string[];
  /** The whole step stopped (refused login, cancelled, another run going) */
  stopped: string | null;
  /** Stopped only because another Thomax copy was running — try again a little later */
  busy?: boolean;
}

/** Heartbeat of the run in progress (every page): a run with no heartbeat for 20 minutes is treated as dead. */
let currentRun: string | null = null;
let lastBeat = 0;
async function beat(): Promise<void> {
  if (!currentRun || Date.now() - lastBeat < 30_000) return;
  lastBeat = Date.now();
  await prisma.sourceRun.update({ where: { id: currentRun }, data: { finishedAt: new Date() } }).catch(() => {});
}
const STALE_MS = 20 * 60_000;

/**
 * Another Thomax run is going → don't start a parallel one. A RUNNING row whose heartbeat (finishedAt while running)
 * or start is older than 20 minutes is from a crash or a sleeping laptop: it's closed so it can't block for hours.
 */
async function runningRun(): Promise<boolean> {
  const runs = await prisma.sourceRun.findMany({ where: { source: SOURCE, status: "RUNNING" } });
  let busy = false;
  for (const r of runs) {
    const last = (r.finishedAt ?? r.startedAt).getTime();
    if (Date.now() - last > STALE_MS) await prisma.sourceRun.update({ where: { id: r.id }, data: { status: "FAILED", finishedAt: new Date(), error: "Stopped without finishing (app closed or computer asleep)." } });
    else busy = true;
  }
  return busy;
}

async function startRun(label: string): Promise<string> {
  const run = await prisma.sourceRun.create({ data: { source: SOURCE, label } });
  currentRun = run.id;
  lastBeat = Date.now();
  return run.id;
}

async function finishRun(id: string, res: StepResult) {
  if (currentRun === id) currentRun = null;
  await prisma.sourceRun.update({ where: { id }, data: { status: res.errors.length || res.stopped ? "FAILED" : "SUCCESS", finishedAt: new Date(), stats: res as unknown as Prisma.InputJsonValue, error: [res.stopped, ...res.errors].filter(Boolean).join("\n").slice(0, 2000) || null } });
}

async function noCreds(): Promise<StepResult> {
  const c = await prisma.thomaxConnection.findUnique({ where: { id: "thomax" }, select: { enabled: true } });
  return { windows: 0, rows: 0, remaining: 0, errors: [], stopped: c && !c.enabled ? "Thomax refused the login earlier — fix it in Change login first." : "Thomax isn't connected yet." };
}

/**
 * History load: for each confirmed TRANSACTIONAL table, copy the next month window after historyDoneTo
 * (starting at the connection's historyFrom). `maxWindows` caps one step so a job never runs for hours.
 */
export async function historyStep(maxWindows = 6, now = new Date(), opts?: ThomaxOptions): Promise<StepResult> {
  const creds = await getCreds();
  if (!creds) return noCreds();
  if (await runningRun()) return { windows: 0, rows: 0, remaining: await historyRemaining(now), errors: [], stopped: "Another Thomax copy is still running.", busy: true };
  const conn = await prisma.thomaxConnection.findUniqueOrThrow({ where: { id: "thomax" } });
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const res: StepResult = { windows: 0, rows: 0, remaining: 0, errors: [], stopped: null };
  const run = { id: await startRun("history") };
  const tables = (await readyTables()).filter((t) => t.kind === "TRANSACTIONAL" && t.dateField);
  for (const t of tables) {
    const start = t.historyDoneTo ?? conn.historyFrom;
    const windows = monthWindows(start, today);
    if (!windows.length) continue;
    if (res.windows >= maxWindows || res.stopped) {
      res.remaining += windows.length;
      continue;
    }
    const w = windows[0];
    try {
      if (!t.historyDoneTo) {
        const early = await copyBefore(creds, t, conn.historyFrom, opts);
        res.rows += early.read;
      }
      const r = await copyWindow(creds, t, w.from, w.to, opts);
      res.windows++;
      res.rows += r.read;
      await finishTable(t.name, { historyDoneTo: w.to }, r.maxAt, r.warning);
      res.remaining += windows.length - 1;
    } catch (err) {
      res.errors.push(`${t.name} ${w.from.toISOString().slice(0, 7)}: ${msg(err)}`);
      await prisma.thomaxTable.update({ where: { name: t.name }, data: { lastError: msg(err) } });
      res.remaining += windows.length;
      if (isAuthError(err)) {
        await loginRefused(err);
        res.stopped = "Thomax refused the login — stopped.";
      } else if (opts?.signal?.aborted) res.stopped = "Stopped (time limit).";
    }
  }
  await finishRun(run.id, res);
  return res;
}

/**
 * Nightly: MASTER tables in full; TRANSACTIONAL the last `recheckDays` days up to tomorrow (only for tables whose
 * history has reached that point), plus rows with no date.
 */
export async function nightly(now = new Date(), opts?: ThomaxOptions): Promise<StepResult> {
  const creds = await getCreds();
  if (!creds) return noCreds();
  if (await runningRun()) return { windows: 0, rows: 0, remaining: 0, errors: [], stopped: "Another Thomax copy is still running.", busy: true };
  const tables = await readyTables();
  if (!tables.length) return { windows: 0, rows: 0, remaining: 0, errors: [], stopped: "No table is saved yet — Explore, check and save the tables first." };
  const conn = await prisma.thomaxConnection.findUniqueOrThrow({ where: { id: "thomax" } });
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(today.getTime() - conn.recheckDays * DAY);
  const to = new Date(today.getTime() + 2 * DAY);
  const res: StepResult = { windows: 0, rows: 0, remaining: 0, errors: [], stopped: null };
  const run = { id: await startRun("nightly") };
  for (const t of tables) {
    if (res.stopped) break;
    try {
      if (t.kind === "MASTER" || !t.dateField) {
        const r = await copyMaster(creds, t, opts);
        res.rows += r.read;
        await finishTable(t.name, {}, null, r.warning);
      } else {
        const done = t.historyDoneTo ?? conn.historyFrom;
        const r = await copyWindow(creds, t, from, to, opts);
        res.rows += r.read;
        let warning = r.warning;
        try {
          const nd = await copyNoDate(creds, t, opts);
          res.rows += nd.read;
          warning = [warning, nd.warning].filter(Boolean).join("; ") || null;
        } catch (err) {
          if (isAuthError(err)) throw err;
          // "is null" may not be supported for every field — not worth failing the night for
          warning = [warning, `rows with no date couldn't be read (${msg(err)})`].filter(Boolean).join("; ");
        }
        // Once the history load has reached the re-check window, the nightly window keeps it current to today.
        await finishTable(t.name, done >= from ? { historyDoneTo: today } : {}, r.maxAt, warning);
      }
      res.windows++;
    } catch (err) {
      res.errors.push(`${t.name}: ${msg(err)}`);
      await prisma.thomaxTable.update({ where: { name: t.name }, data: { lastError: msg(err) } });
      if (isAuthError(err)) {
        await loginRefused(err);
        res.stopped = "Thomax refused the login — stopped.";
      } else if (opts?.signal?.aborted) res.stopped = "Stopped (time limit).";
    }
  }
  await finishRun(run.id, res);
  return res;
}

/** Is tonight's nightly copy due (after 02:15 Sydney) and not yet finished or started today? */
export async function nightlyDueNow(now: Date): Promise<boolean> {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  const minutes = p.hour * 60 + p.minute;
  if (minutes < 2 * 60 + 15 || minutes > 6 * 60) return false;
  const since = new Date(now.getTime() - (minutes - (2 * 60 + 15)) * 60_000);
  const n = await prisma.sourceRun.count({ where: { source: SOURCE, label: "nightly", startedAt: { gte: since } } });
  return n === 0;
}

/** Month windows of history still to load, over all saved tables. */
export async function historyRemaining(now = new Date()): Promise<number> {
  const conn = await prisma.thomaxConnection.findUnique({ where: { id: "thomax" } });
  if (!conn) return 0;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let n = 0;
  for (const t of (await readyTables()).filter((x) => x.kind === "TRANSACTIONAL" && x.dateField)) n += monthWindows(t.historyDoneTo ?? conn.historyFrom, today).length;
  return n;
}

function msg(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 600);
}
