import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { Prisma } from "@/generated/prisma/client";
import { queryAll, queryPage, ThomaxError, type ClientOptions, type ThomaxCreds } from "./client";
import { THOMAX_TABLES, tableDef } from "./tables";
import {
  assertCluster,
  assertName,
  fieldsOf,
  lookupValues,
  monthWindows,
  parseThomaxDate,
  rowHash,
  rowKey,
  suggestDateField,
  suggestKeyFields,
  suggestLookupFields,
  windowWhere,
  type ThomaxRecord,
} from "./shape";

/**
 * The Thomax copy in Analytics (decision 11/11/2026). Read-only towards Thomax: only GET queries.
 *   Explore  — Limit=5 per table: field names + 5 sample rows; suggests date / key / lookup fields.
 *   Confirm  — an owner saves each table's settings; nothing is copied before that.
 *   History  — month windows from historyFrom (2021) to today, one window per table per step.
 *   Nightly  — MASTER tables re-read in full; TRANSACTIONAL: the last `recheckDays` days (status changes).
 * Rows are stored as returned (JSON). A re-read updates a row only when it changed (hash).
 */

const SOURCE = "THOMAX";
const DAY = 86_400_000;

export type ThomaxOptions = ClientOptions;

// ---------- connection ----------

export async function getConnectionInfo() {
  return prisma.thomaxConnection.findUnique({ where: { id: "thomax" }, select: { cluster: true, username: true, historyFrom: true, recheckDays: true, enabled: true, updatedAt: true, updatedBy: true } });
}

export async function getCreds(): Promise<ThomaxCreds | null> {
  const c = await prisma.thomaxConnection.findUnique({ where: { id: "thomax" } });
  if (!c || !c.enabled) return null;
  return { cluster: c.cluster, username: c.username, password: decrypt(c.passwordEnc) };
}

export interface ConnectionInput {
  cluster: string;
  username: string;
  /** Empty → keep the stored password */
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
    updatedBy: by,
  };
  if (existing) await prisma.thomaxConnection.update({ where: { id: "thomax" }, data });
  else await prisma.thomaxConnection.create({ data: { ...data, passwordEnc: encrypt(password) } });
  await ensureTables();
}

export async function disconnect(): Promise<void> {
  await prisma.thomaxConnection.deleteMany({ where: { id: "thomax" } });
}

/** Test: one row from TNT (tenants). */
export async function testConnection(creds?: ThomaxCreds, opts?: ThomaxOptions): Promise<{ ok: true; sample: number }> {
  const c = creds ?? (await getCreds());
  if (!c) throw new ThomaxError("Thomax isn't connected yet.");
  const rows = await queryPage(c, { table: "TNT", limit: 1 }, { maxRetries: 1, ...opts });
  return { ok: true, sample: rows.length };
}

/** Catalogue rows exist for every known table (ATR off). */
export async function ensureTables(): Promise<void> {
  const have = new Set((await prisma.thomaxTable.findMany({ select: { name: true } })).map((t) => t.name));
  const missing = THOMAX_TABLES.filter((t) => !have.has(t.name));
  if (missing.length) await prisma.thomaxTable.createMany({ data: missing.map((t) => ({ name: t.name, kind: t.kind, enabled: !t.off })), skipDuplicates: true });
}

// ---------- explore ----------

export async function exploreTable(name: string, opts?: ThomaxOptions): Promise<{ fields: number }> {
  assertName(name, "table");
  const creds = await getCreds();
  if (!creds) throw new ThomaxError("Thomax isn't connected yet.");
  const t = await prisma.thomaxTable.findUnique({ where: { name } });
  if (!t) throw new Error(`Unknown table ${name}`);
  try {
    const rows = await queryPage(creds, { table: name, limit: 5 }, { maxRetries: 2, ...opts });
    const fields = fieldsOf(rows);
    const unconfirmed = !t.confirmedAt;
    const dateField = suggestDateField(fields, rows);
    await prisma.thomaxTable.update({
      where: { name },
      data: {
        fields: fields as unknown as Prisma.InputJsonValue,
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
    return { fields: fields.length };
  } catch (err) {
    await prisma.thomaxTable.update({ where: { name }, data: { lastError: msg(err), exploredAt: new Date() } });
    throw err;
  }
}

/** Explore every enabled table, one after another (Thomax has one shared queue). */
export async function exploreAll(opts?: ThomaxOptions): Promise<{ ok: number; failed: string[] }> {
  await ensureTables();
  const tables = await prisma.thomaxTable.findMany({ where: { enabled: true }, orderBy: { name: "asc" } });
  let ok = 0;
  const failed: string[] = [];
  for (const t of tables) {
    try {
      await exploreTable(t.name, opts);
      ok++;
    } catch {
      failed.push(t.name);
    }
  }
  return { ok, failed };
}

// ---------- confirm settings ----------

export interface TableSettings {
  enabled: boolean;
  kind: "TRANSACTIONAL" | "MASTER";
  dateField: string | null;
  keyFields: string[];
  lookupFields: string[];
}

export async function saveTableSettings(name: string, s: TableSettings, by: string): Promise<void> {
  assertName(name, "table");
  const t = await prisma.thomaxTable.findUnique({ where: { name } });
  if (!t) throw new Error(`Unknown table ${name}`);
  const fields = Array.isArray(t.fields) ? (t.fields as string[]) : [];
  const known = (f: string) => fields.includes(f);
  if (s.kind !== "TRANSACTIONAL" && s.kind !== "MASTER") throw new Error("Unknown kind");
  if (s.dateField && !known(s.dateField)) throw new Error(`${name}: date field "${s.dateField}" isn't one of the table's fields — run Explore first.`);
  for (const f of [...s.keyFields, ...s.lookupFields]) if (!known(f)) throw new Error(`${name}: "${f}" isn't one of the table's fields.`);
  if (s.enabled && s.kind === "TRANSACTIONAL" && !s.dateField) throw new Error(`${name}: choose the date field used to copy history, or set the table to "re-read in full".`);
  if (s.enabled && s.kind === "TRANSACTIONAL" && !s.keyFields.length) throw new Error(`${name}: choose the field(s) that identify one row, so re-reads update rows instead of adding copies.`);
  if (s.keyFields.length > 4 || s.lookupFields.length > 12) throw new Error("Too many fields chosen.");
  const keyChanged = t.confirmedAt && (t.keyFields.join("|") !== s.keyFields.join("|"));
  await prisma.$transaction(async (tx) => {
    if (keyChanged) {
      // Old rows were keyed differently: clear and copy again.
      await tx.thomaxRow.deleteMany({ where: { table: name } });
      await tx.thomaxTable.update({ where: { name }, data: { historyDoneTo: null, maxSeen: null, rowCount: 0 } });
    }
    await tx.thomaxTable.update({
      where: { name },
      data: { enabled: s.enabled, kind: s.kind, dateField: s.kind === "MASTER" ? null : s.dateField, keyFields: s.keyFields, lookupFields: s.lookupFields, confirmedAt: new Date(), confirmedBy: by },
    });
  });
  if (!keyChanged && t.confirmedAt && t.lookupFields.join("|") !== s.lookupFields.join("|")) await rebuildRefs(name, s.lookupFields);
}

// ---------- storing rows ----------

interface TableCfg {
  name: string;
  keyFields: string[];
  lookupFields: string[];
  dateField: string | null;
}

/** Upsert a page of rows; unchanged rows (same hash) aren't touched. Returns inserted + updated counts. */
export async function storeRows(cfg: TableCfg, rows: ThomaxRecord[]): Promise<{ inserted: number; updated: number; maxAt: Date | null }> {
  let inserted = 0;
  let updated = 0;
  let maxAt: Date | null = null;
  // De-duplicate within the page (last wins) — ON CONFLICT can't touch the same row twice in one statement.
  const byKey = new Map<string, ThomaxRecord>();
  for (const r of rows) byKey.set(rowKey(r, cfg.keyFields), r);
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
    const changed = await prisma.$queryRaw<Array<{ id: bigint; inserted: boolean }>>`
      INSERT INTO "ThomaxRow" ("table", "key", "data", "hash", "at", "updatedAt")
      SELECT ${cfg.name}, t.k, t.d::jsonb, t.h, t.a::timestamp, now()
      FROM unnest(${keys}::text[], ${datas}::text[], ${hashes}::text[], ${ats}::text[]) AS t(k, d, h, a)
      ON CONFLICT ("table", "key") DO UPDATE
        SET "data" = EXCLUDED."data", "hash" = EXCLUDED."hash", "at" = EXCLUDED."at", "updatedAt" = now()
        WHERE "ThomaxRow"."hash" <> EXCLUDED."hash"
      RETURNING "id", (xmax = 0) AS inserted`;
    for (const c of changed) {
      if (c.inserted) inserted++;
      else updated++;
    }
    if (changed.length && cfg.lookupFields.length) {
      const ids = changed.map((c) => c.id);
      const byId = new Map<string, ThomaxRecord>();
      // Map returned ids back to rows via key: fetch keys for the ids.
      const keyed = await prisma.thomaxRow.findMany({ where: { id: { in: ids } }, select: { id: true, key: true } });
      const rowFor = new Map(chunk);
      for (const k of keyed) {
        const r = rowFor.get(k.key);
        if (r) byId.set(String(k.id), r);
      }
      await prisma.thomaxRef.deleteMany({ where: { rowId: { in: ids } } });
      const refs: Array<{ rowId: bigint; field: string; value: string }> = [];
      for (const [id, r] of byId) for (const v of lookupValues(r, cfg.lookupFields)) refs.push({ rowId: BigInt(id), ...v });
      if (refs.length) await prisma.thomaxRef.createMany({ data: refs });
    }
  }
  return { inserted, updated, maxAt };
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

async function finishTable(name: string, extra: Prisma.ThomaxTableUpdateInput, maxAt: Date | null) {
  const count = await prisma.thomaxRow.count({ where: { table: name } });
  const t = await prisma.thomaxTable.findUnique({ where: { name }, select: { maxSeen: true } });
  const maxSeen = maxAt && (!t?.maxSeen || maxAt > t.maxSeen) ? maxAt : t?.maxSeen ?? null;
  await prisma.thomaxTable.update({ where: { name }, data: { ...extra, rowCount: count, maxSeen, lastSyncAt: new Date(), lastError: null } });
}

// ---------- copying ----------

type ReadyTable = TableCfg & { kind: string; historyDoneTo: Date | null };

async function readyTables(): Promise<ReadyTable[]> {
  const rows = await prisma.thomaxTable.findMany({ where: { enabled: true, confirmedAt: { not: null } }, orderBy: { name: "asc" } });
  return rows.filter((t) => tableDef(t.name)?.off !== true).map((t) => ({ name: t.name, kind: t.kind, keyFields: t.keyFields, lookupFields: t.lookupFields, dateField: t.dateField, historyDoneTo: t.historyDoneTo }));
}

/** Copy one date window of a TRANSACTIONAL table. */
export async function copyWindow(creds: ThomaxCreds, t: TableCfg, from: Date, to: Date, opts?: ThomaxOptions) {
  if (!t.dateField) throw new Error(`${t.name} has no date field`);
  let ins = 0;
  let upd = 0;
  let maxAt: Date | null = null;
  const read = await queryAll(creds, { table: t.name, where: windowWhere(t.dateField, from, to), orderBy: t.dateField }, async (rows) => {
    const r = await storeRows(t, rows);
    ins += r.inserted;
    upd += r.updated;
    if (r.maxAt && (!maxAt || r.maxAt > maxAt)) maxAt = r.maxAt;
  }, opts);
  return { read, inserted: ins, updated: upd, maxAt };
}

/** Re-read a MASTER table in full. Rows that disappear from Thomax are kept (it's an archive). */
export async function copyMaster(creds: ThomaxCreds, t: TableCfg, opts?: ThomaxOptions) {
  let ins = 0;
  let upd = 0;
  const read = await queryAll(creds, { table: t.name }, async (rows) => {
    const r = await storeRows(t, rows);
    ins += r.inserted;
    upd += r.updated;
  }, opts);
  return { read, inserted: ins, updated: upd };
}

export interface StepResult {
  windows: number;
  rows: number;
  remaining: number;
  errors: string[];
}

/**
 * History load: for each confirmed TRANSACTIONAL table, copy the next month window after historyDoneTo
 * (starting at the connection's historyFrom). `maxWindows` caps one step so a job never runs for hours.
 */
export async function historyStep(maxWindows = 6, now = new Date(), opts?: ThomaxOptions): Promise<StepResult> {
  const creds = await getCreds();
  if (!creds) throw new ThomaxError("Thomax isn't connected yet.");
  const conn = await prisma.thomaxConnection.findUniqueOrThrow({ where: { id: "thomax" } });
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const res: StepResult = { windows: 0, rows: 0, remaining: 0, errors: [] };
  const run = await prisma.sourceRun.create({ data: { source: SOURCE, label: "history" } });
  const tables = (await readyTables()).filter((t) => t.kind === "TRANSACTIONAL" && t.dateField);
  for (const t of tables) {
    const start = t.historyDoneTo ?? conn.historyFrom;
    const windows = monthWindows(start, today);
    if (!windows.length) continue;
    if (res.windows >= maxWindows) {
      res.remaining += windows.length;
      continue;
    }
    const w = windows[0];
    try {
      const r = await copyWindow(creds, t, w.from, w.to, opts);
      res.windows++;
      res.rows += r.read;
      await finishTable(t.name, { historyDoneTo: w.to }, r.maxAt);
      res.remaining += windows.length - 1;
    } catch (err) {
      res.errors.push(`${t.name} ${w.from.toISOString().slice(0, 7)}: ${msg(err)}`);
      await prisma.thomaxTable.update({ where: { name: t.name }, data: { lastError: msg(err) } });
      res.remaining += windows.length;
    }
  }
  await prisma.sourceRun.update({ where: { id: run.id }, data: { status: res.errors.length ? "FAILED" : "SUCCESS", finishedAt: new Date(), stats: res as unknown as Prisma.InputJsonValue, error: res.errors.join("\n").slice(0, 2000) || null } });
  return res;
}

/**
 * Nightly: MASTER tables in full; TRANSACTIONAL the last `recheckDays` days up to tomorrow, but only for tables
 * whose history has reached that point (older months are the history load's job).
 */
export async function nightly(now = new Date(), opts?: ThomaxOptions): Promise<StepResult> {
  const creds = await getCreds();
  if (!creds) throw new ThomaxError("Thomax isn't connected yet.");
  const conn = await prisma.thomaxConnection.findUniqueOrThrow({ where: { id: "thomax" } });
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(today.getTime() - conn.recheckDays * DAY);
  const to = new Date(today.getTime() + 2 * DAY);
  const res: StepResult = { windows: 0, rows: 0, remaining: 0, errors: [] };
  const run = await prisma.sourceRun.create({ data: { source: SOURCE, label: "nightly" } });
  for (const t of await readyTables()) {
    try {
      if (t.kind === "MASTER" || !t.dateField) {
        const r = await copyMaster(creds, t, opts);
        res.rows += r.read;
        await finishTable(t.name, {}, null);
      } else {
        const done = t.historyDoneTo ?? conn.historyFrom;
        const r = await copyWindow(creds, t, from, to, opts);
        res.rows += r.read;
        // Once the history load has reached the re-check window, the nightly window keeps it current to today.
        await finishTable(t.name, done >= from ? { historyDoneTo: today } : {}, r.maxAt);
      }
      res.windows++;
    } catch (err) {
      res.errors.push(`${t.name}: ${msg(err)}`);
      await prisma.thomaxTable.update({ where: { name: t.name }, data: { lastError: msg(err) } });
    }
  }
  await prisma.sourceRun.update({ where: { id: run.id }, data: { status: res.errors.length ? "FAILED" : "SUCCESS", finishedAt: new Date(), stats: res as unknown as Prisma.InputJsonValue, error: res.errors.join("\n").slice(0, 2000) || null } });
  return res;
}

/** Months left to load per table (for the status card). */
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
