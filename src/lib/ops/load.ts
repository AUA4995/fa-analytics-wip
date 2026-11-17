import { prisma } from "@/lib/db";
import { assertName } from "@/lib/thomax/shape";
import type { Flow, FlowKey, OpsConfig } from "./config";

/**
 * Reads Operations rows from the Thomax copy (batch 5). Field names come from Operations → Setup (validated names,
 * passed as query parameters — never pasted into SQL). Times come back as Sydney wall-clock text and are turned into
 * Dates whose UTC parts are that wall-clock time (see calc.ts), so the server's own time zone never shifts them.
 */

export interface FlowRow {
  tenant: string;
  created: Date;
  done: Date | null;
  ref: string | null;
  type: string | null;
  warehouse: string | null;
}

/** Safety cap per query; the page says when it was hit. */
export const MAX_ROWS = 300_000;

const ts = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const wall = (s: string | null) => (s ? new Date(`${s}Z`) : null);

export interface FlowFilter {
  /** Tenant codes to keep (null = all) */
  tenants?: string[] | null;
  /** Warehouse codes to keep (null = all) */
  warehouses?: string[] | null;
}

function fieldParams(flow: Flow) {
  const r = flow.roles;
  for (const v of Object.values(r)) if (v) assertName(v, "field");
  return r;
}

/** Rows whose "created" falls in [from, to). Returns rows and whether the cap was hit. */
export async function loadFlow(flow: Flow, from: Date, to: Date, filter: FlowFilter = {}): Promise<{ rows: FlowRow[]; capped: boolean }> {
  const r = fieldParams(flow);
  if (!r.tenant || !r.created) return { rows: [], capped: false };
  const params: unknown[] = [flow.table, r.tenant, r.created, r.done ?? null, r.ref ?? null, r.type ?? null, r.warehouse ?? null, ts(from), ts(to)];
  let where = `"table" = $1 AND fa_try_ts(data->>$3) >= $8::timestamp AND fa_try_ts(data->>$3) < $9::timestamp`;
  if (filter.tenants) {
    params.push(filter.tenants);
    where += ` AND data->>$2 = ANY($${params.length}::text[])`;
  }
  if (filter.warehouses && r.warehouse) {
    params.push(filter.warehouses.map((w) => w.toUpperCase()));
    where += ` AND upper(data->>$7) = ANY($${params.length}::text[])`;
  }
  params.push(MAX_ROWS + 1);
  const sql = `
    SELECT data->>$2 AS tenant,
           to_char(fa_try_ts(data->>$3), 'YYYY-MM-DD"T"HH24:MI:SS') AS created,
           CASE WHEN $4::text IS NULL THEN NULL ELSE to_char(fa_try_ts(data->>$4), 'YYYY-MM-DD"T"HH24:MI:SS') END AS done,
           CASE WHEN $5::text IS NULL THEN NULL ELSE data->>$5 END AS ref,
           CASE WHEN $6::text IS NULL THEN NULL ELSE data->>$6 END AS type,
           CASE WHEN $7::text IS NULL THEN NULL ELSE data->>$7 END AS warehouse
      FROM "ThomaxRow"
     WHERE ${where}
     LIMIT $${params.length}`;
  const raw = await prisma.$queryRawUnsafe<Array<{ tenant: string | null; created: string | null; done: string | null; ref: string | null; type: string | null; warehouse: string | null }>>(sql, ...params);
  const capped = raw.length > MAX_ROWS;
  const rows: FlowRow[] = [];
  for (const x of raw.slice(0, MAX_ROWS)) {
    const created = wall(x.created);
    if (!created) continue;
    rows.push({ tenant: x.tenant ?? "", created, done: wall(x.done), ref: x.ref, type: x.type, warehouse: x.warehouse });
  }
  return { rows, capped };
}

/** Rows still open (no "done" value) created before `before` — e.g. receipts waiting since an earlier period. */
export async function loadOpen(flow: Flow, since: Date, before: Date, filter: FlowFilter = {}): Promise<{ rows: FlowRow[]; capped: boolean }> {
  const all = await loadFlow(flow, since, before, filter);
  return { rows: all.rows.filter((r) => !r.done), capped: all.capped };
}

/** Count per day (YYYY-MM-DD) per tenant of "created" in [from, to). */
export async function dailyCounts(flow: Flow, from: Date, to: Date, filter: FlowFilter = {}): Promise<Array<{ day: string; tenant: string; n: number }>> {
  const r = fieldParams(flow);
  if (!r.tenant || !r.created) return [];
  const params: unknown[] = [flow.table, r.tenant, r.created, ts(from), ts(to)];
  let where = `"table" = $1 AND fa_try_ts(data->>$3) >= $4::timestamp AND fa_try_ts(data->>$3) < $5::timestamp`;
  if (filter.tenants) {
    params.push(filter.tenants);
    where += ` AND data->>$2 = ANY($${params.length}::text[])`;
  }
  if (filter.warehouses && r.warehouse) {
    params.push(r.warehouse, filter.warehouses.map((w) => w.toUpperCase()));
    where += ` AND upper(data->>$${params.length - 1}) = ANY($${params.length}::text[])`;
  }
  const sql = `SELECT to_char(fa_try_ts(data->>$3), 'YYYY-MM-DD') AS day, coalesce(data->>$2, '') AS tenant, count(*)::int AS n
                 FROM "ThomaxRow" WHERE ${where} GROUP BY 1, 2 ORDER BY 1`;
  return prisma.$queryRawUnsafe(sql, ...params);
}

/** First day with any data for the flow (for "not enough history" notes). */
export async function firstDay(flow: Flow): Promise<Date | null> {
  const r = fieldParams(flow);
  if (!r.created) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ d: string | null }>>(`SELECT to_char(min(fa_try_ts(data->>$2)), 'YYYY-MM-DD') AS d FROM "ThomaxRow" WHERE "table" = $1`, flow.table, r.created);
  return rows[0]?.d ? new Date(`${rows[0].d}T00:00:00Z`) : null;
}

export async function flowHasRows(cfg: OpsConfig, k: FlowKey): Promise<boolean> {
  return (await prisma.thomaxRow.count({ where: { table: cfg.flows[k].table }, take: 1 })) > 0;
}

/** Tenant code → client name (Settings → Clients: Thomax tenant ID, or Dyspatch customer ID which equals it). */
export async function tenantNames(): Promise<Map<string, string>> {
  const clients = await prisma.client.findMany({ select: { name: true, thomaxTenantId: true, dyspatchCustomerId: true } });
  const m = new Map<string, string>();
  for (const c of clients) for (const id of [c.dyspatchCustomerId, c.thomaxTenantId]) if (id) m.set(id, c.name);
  return m;
}

/** Site key → its WMS warehouse codes (Settings → Sites). */
export async function siteCodes(): Promise<Array<{ key: string; name: string; codes: string[] }>> {
  const sites = await prisma.site.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, name: true, wmsCodes: true } });
  return sites.map((s) => ({ key: s.key, name: s.name, codes: s.wmsCodes }));
}
