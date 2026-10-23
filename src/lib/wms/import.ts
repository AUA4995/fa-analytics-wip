import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { parseCsv } from "@/lib/model/csv";

/**
 * WMS file imports (brief §11): Thomax exports now, 3PLWMS exports (Tarek's system, a few months), Logiwa later.
 * Two kinds of file:
 *   CHARGES — billable activity: date, tenant, charge code, quantity (summed per day / tenant / code / warehouse)
 *   ORDERS  — one row per order, or one row per order line (then SKUs = distinct SKUs, units = summed)
 * Column names differ per system, so the person maps columns once per source + kind; the mapping is remembered.
 * The same file can't be loaded twice (checksum). Overlap with earlier data → replace or keep, the person decides.
 */

export type WmsSource = "THOMAX" | "P3L" | "LOGIWA";
export type WmsKind = "CHARGES" | "ORDERS";

export const WMS_SOURCES: ReadonlyArray<readonly [WmsSource, string]> = [
  ["THOMAX", "Thomax (dotWMS)"],
  ["P3L", "3PLWMS"],
  ["LOGIWA", "Logiwa"],
];

export const KIND_FIELDS: Record<WmsKind, ReadonlyArray<{ key: string; label: string; required: boolean; aliases: string[] }>> = {
  CHARGES: [
    { key: "date", label: "Date", required: true, aliases: ["date", "charge date", "activity date", "transaction date", "created", "created date"] },
    { key: "tenant", label: "Tenant / client ID", required: true, aliases: ["tenant", "tenant id", "client", "client id", "customer", "customer id", "owner"] },
    { key: "wmsCode", label: "Charge code", required: true, aliases: ["charge code", "code", "charge", "service code", "rate code", "charge name"] },
    { key: "quantity", label: "Quantity", required: true, aliases: ["quantity", "qty", "units", "count", "volume"] },
    { key: "warehouse", label: "Warehouse", required: false, aliases: ["warehouse", "warehouse code", "site", "location"] },
  ],
  ORDERS: [
    { key: "orderRef", label: "Order number", required: true, aliases: ["order", "order number", "order no", "order id", "order ref", "reference"] },
    { key: "date", label: "Date (dispatched or created)", required: true, aliases: ["date", "dispatch date", "despatch date", "shipped date", "order date", "created", "created date"] },
    { key: "tenant", label: "Tenant / client ID", required: true, aliases: ["tenant", "tenant id", "client", "client id", "customer", "owner"] },
    { key: "sku", label: "SKU (line-level files)", required: false, aliases: ["sku", "product", "product code", "item", "item code"] },
    { key: "skus", label: "Number of SKUs (order-level files)", required: false, aliases: ["skus", "lines", "line count", "sku count", "number of lines"] },
    { key: "units", label: "Units", required: true, aliases: ["units", "qty", "quantity", "total units", "items"] },
    { key: "warehouse", label: "Warehouse", required: false, aliases: ["warehouse", "warehouse code", "site"] },
    { key: "orderType", label: "Order type", required: false, aliases: ["order type", "type", "channel"] },
  ],
};

export type Mapping = Record<string, number | null>;

/** Guess column → field from the header row (exact alias match, case-insensitive). */
export function guessMapping(kind: WmsKind, header: string[]): Mapping {
  const h = header.map((x) => x.toLowerCase().trim());
  const used = new Set<number>();
  const m: Mapping = {};
  for (const f of KIND_FIELDS[kind]) {
    const i = h.findIndex((col, idx) => !used.has(idx) && f.aliases.includes(col));
    m[f.key] = i >= 0 ? i : null;
    if (i >= 0) used.add(i);
  }
  return m;
}

/** DD/MM/YYYY (AU), YYYY-MM-DD, with or without time; "D/M/YY". Returns YYYY-MM-DD or null. */
export function parseWmsDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}
function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 2015 || y > 2100) return null;
  return dt.toISOString().slice(0, 10);
}

export interface WmsPlan {
  source: WmsSource;
  kind: WmsKind;
  checksum: string;
  duplicateFile: boolean;
  rowsRead: number;
  errors: Array<{ line: number; message: string }>;
  dateFrom: string | null;
  dateTo: string | null;
  tenants: Array<{ tenant: string; rows: number; client: string | null }>;
  /** CHARGES: aggregated day lines; ORDERS: orders */
  charges: Array<{ date: string; tenant: string; wmsCode: string; warehouse: string; quantity: number }>;
  orders: Array<{ orderRef: string; date: string; tenant: string; warehouse: string | null; skus: number; units: number; orderType: string | null }>;
  /** Existing rows in the same source / tenants / dates (would be replaced or kept) */
  overlap: number;
  unmappedCodes: string[];
}

export function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function planWmsImport(source: WmsSource, kind: WmsKind, text: string, mapping: Mapping): Promise<WmsPlan> {
  const rows = parseCsv(text);
  const checksum = checksumOf(text);
  const plan: WmsPlan = { source, kind, checksum, duplicateFile: false, rowsRead: Math.max(0, rows.length - 1), errors: [], dateFrom: null, dateTo: null, tenants: [], charges: [], orders: [], overlap: 0, unmappedCodes: [] };
  plan.duplicateFile = !!(await prisma.volumeImport.findUnique({ where: { checksum } }));
  for (const f of KIND_FIELDS[kind]) if (f.required && (mapping[f.key] == null || mapping[f.key]! < 0)) plan.errors.push({ line: 1, message: `Pick the column for “${f.label}”` });
  if (kind === "ORDERS" && mapping.sku == null && mapping.skus == null) plan.errors.push({ line: 1, message: "Pick either the SKU column (one row per order line) or the number-of-SKUs column (one row per order)" });
  if (plan.errors.length) return plan;
  const get = (r: string[], k: string) => (mapping[k] != null ? (r[mapping[k]!] ?? "").trim() : "");
  const tenantRows = new Map<string, number>();
  const charges = new Map<string, WmsPlan["charges"][number]>();
  const orders = new Map<string, { o: WmsPlan["orders"][number]; skuSet: Set<string> }>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 1;
    const date = parseWmsDate(get(r, "date"));
    const tenant = get(r, "tenant");
    if (!date) {
      if (plan.errors.length < 200) plan.errors.push({ line, message: `Date “${get(r, "date")}” not understood (DD/MM/YYYY or YYYY-MM-DD)` });
      continue;
    }
    if (!tenant) {
      if (plan.errors.length < 200) plan.errors.push({ line, message: "Tenant is empty" });
      continue;
    }
    const warehouse = get(r, "warehouse");
    if (kind === "CHARGES") {
      const code = get(r, "wmsCode");
      const qty = Number(get(r, "quantity").replace(/,/g, ""));
      if (!code || !Number.isFinite(qty)) {
        if (plan.errors.length < 200) plan.errors.push({ line, message: !code ? "Charge code is empty" : `Quantity “${get(r, "quantity")}” isn't a number` });
        continue;
      }
      const k = `${date}|${tenant}|${code}|${warehouse}`;
      const cur = charges.get(k);
      if (cur) cur.quantity += qty;
      else charges.set(k, { date, tenant, wmsCode: code, warehouse, quantity: qty });
    } else {
      const ref = get(r, "orderRef");
      const units = Number(get(r, "units").replace(/,/g, "") || "0");
      if (!ref || !Number.isFinite(units)) {
        if (plan.errors.length < 200) plan.errors.push({ line, message: !ref ? "Order number is empty" : `Units “${get(r, "units")}” isn't a number` });
        continue;
      }
      const key = `${tenant}|${ref}`;
      const cur = orders.get(key);
      if (mapping.sku != null) {
        const sku = get(r, "sku");
        if (cur) {
          cur.o.units += units;
          if (sku) cur.skuSet.add(sku);
        } else orders.set(key, { o: { orderRef: ref, date, tenant, warehouse: warehouse || null, skus: 0, units, orderType: get(r, "orderType") || null }, skuSet: new Set(sku ? [sku] : []) });
      } else {
        const skus = Number(get(r, "skus"));
        if (cur) {
          if (plan.errors.length < 200) plan.errors.push({ line, message: `Order ${ref} appears twice in an order-level file` });
          continue;
        }
        orders.set(key, { o: { orderRef: ref, date, tenant, warehouse: warehouse || null, skus: Number.isFinite(skus) ? skus : 0, units, orderType: get(r, "orderType") || null }, skuSet: new Set() });
      }
    }
    tenantRows.set(tenant, (tenantRows.get(tenant) ?? 0) + 1);
    if (!plan.dateFrom || date < plan.dateFrom) plan.dateFrom = date;
    if (!plan.dateTo || date > plan.dateTo) plan.dateTo = date;
  }
  plan.charges = [...charges.values()];
  plan.orders = [...orders.values()].map(({ o, skuSet }) => (mapping.sku != null ? { ...o, skus: skuSet.size } : o));
  const clients = await prisma.client.findMany({ select: { name: true, dyspatchCustomerId: true, thomaxTenantId: true, p3lClientId: true, logiwaClientId: true } });
  const idOf = (c: (typeof clients)[number]) => (source === "THOMAX" ? [c.thomaxTenantId, c.dyspatchCustomerId] : source === "P3L" ? [c.p3lClientId] : [c.logiwaClientId, c.dyspatchCustomerId]);
  plan.tenants = [...tenantRows.entries()].sort((a, b) => b[1] - a[1]).map(([tenant, n]) => ({ tenant, rows: n, client: clients.find((c) => idOf(c).includes(tenant))?.name ?? null }));
  if (plan.dateFrom && plan.dateTo) {
    const range = { gte: new Date(plan.dateFrom + "T00:00:00Z"), lte: new Date(plan.dateTo + "T00:00:00Z") };
    const tenants = plan.tenants.map((t) => t.tenant);
    plan.overlap = kind === "CHARGES" ? await prisma.volumeLine.count({ where: { source, tenant: { in: tenants }, date: range } }) : await prisma.orderFact.count({ where: { source, orderRef: { in: plan.orders.map((o) => o.orderRef) } } });
  }
  if (kind === "CHARGES") {
    const maps = await prisma.wmsCodeMap.findMany({ where: { source }, select: { wmsCode: true, tenant: true } });
    const codes = [...new Set(plan.charges.map((c) => c.wmsCode))];
    plan.unmappedCodes = codes.filter((c) => !maps.some((m) => m.wmsCode === c)).slice(0, 200);
  }
  return plan;
}

export interface WmsApplyResult {
  importId: string;
  inserted: number;
  replaced: number;
  kept: number;
}

/** Save a plan. onOverlap: "replace" = this file wins for its tenants and dates; "keep" = existing rows stay. */
export async function applyWmsImport(plan: WmsPlan, opts: { fileName: string | null; mapping: Mapping; onOverlap: "replace" | "keep"; uploadedBy: string }): Promise<WmsApplyResult> {
  if (plan.duplicateFile) throw new Error("This exact file was already loaded.");
  if (plan.errors.length) throw new Error("Fix the rows with problems first.");
  return prisma.$transaction(
    async (tx) => {
      const imp = await tx.volumeImport.create({
        data: { source: plan.source, kind: plan.kind, fileName: opts.fileName, checksum: plan.checksum, mapping: opts.mapping, rows: plan.rowsRead, dateFrom: plan.dateFrom ? new Date(plan.dateFrom + "T00:00:00Z") : null, dateTo: plan.dateTo ? new Date(plan.dateTo + "T00:00:00Z") : null, uploadedBy: opts.uploadedBy },
      });
      let replaced = 0;
      let inserted = 0;
      if (plan.kind === "CHARGES") {
        if (opts.onOverlap === "replace" && plan.overlap && plan.dateFrom && plan.dateTo) {
          replaced = (await tx.volumeLine.deleteMany({ where: { source: plan.source, tenant: { in: plan.tenants.map((t) => t.tenant) }, date: { gte: new Date(plan.dateFrom + "T00:00:00Z"), lte: new Date(plan.dateTo + "T00:00:00Z") } } })).count;
        }
        for (let i = 0; i < plan.charges.length; i += 2000) {
          const r = await tx.volumeLine.createMany({ data: plan.charges.slice(i, i + 2000).map((c) => ({ importId: imp.id, source: plan.source, date: new Date(c.date + "T00:00:00Z"), tenant: c.tenant, wmsCode: c.wmsCode, warehouse: c.warehouse, quantity: c.quantity })), skipDuplicates: true });
          inserted += r.count;
        }
      } else {
        if (opts.onOverlap === "replace" && plan.overlap) replaced = (await tx.orderFact.deleteMany({ where: { source: plan.source, orderRef: { in: plan.orders.map((o) => o.orderRef) } } })).count;
        for (let i = 0; i < plan.orders.length; i += 2000) {
          const r = await tx.orderFact.createMany({ data: plan.orders.slice(i, i + 2000).map((o) => ({ importId: imp.id, source: plan.source, orderRef: o.orderRef, date: new Date(o.date + "T00:00:00Z"), tenant: o.tenant, warehouse: o.warehouse, skus: o.skus, units: o.units, orderType: o.orderType })), skipDuplicates: true });
          inserted += r.count;
        }
      }
      await tx.volumeImport.update({ where: { id: imp.id }, data: { replaced } });
      await tx.setting.upsert({ where: { key: `wmsMapping:${plan.source}:${plan.kind}` }, update: { value: opts.mapping }, create: { key: `wmsMapping:${plan.source}:${plan.kind}`, value: opts.mapping } });
      await tx.sourceRun.create({ data: { source: plan.source.toLowerCase() + "-file", label: `file ${opts.fileName ?? ""}`.trim(), status: "SUCCESS", finishedAt: new Date(), startedBy: opts.uploadedBy, stats: { kind: plan.kind, rows: plan.rowsRead, inserted, replaced, dateFrom: plan.dateFrom, dateTo: plan.dateTo } } });
      const total = plan.kind === "CHARGES" ? plan.charges.length : plan.orders.length;
      return { importId: imp.id, inserted, replaced, kept: total - inserted };
    },
    { timeout: 120_000 },
  );
}

/** Remove one import and its rows (e.g. a wrong file). */
export async function deleteWmsImport(id: string): Promise<number> {
  const imp = await prisma.volumeImport.findUnique({ where: { id }, include: { _count: { select: { lines: true, orders: true } } } });
  if (!imp) return 0;
  await prisma.orderFact.deleteMany({ where: { importId: id } });
  await prisma.volumeImport.delete({ where: { id } });
  return imp._count.lines + imp._count.orders;
}
