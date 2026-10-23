import { prisma } from "@/lib/db";
import type { ActorType } from "@/generated/prisma/enums";
import { logSafe, parseFieldValue, sameValue } from "./fields";
import { RULES, fieldSpec } from "./specs";

/**
 * Reading and writing cost-model values with a change log on every write (brief §12).
 * The same functions serve Settings, the details panels and (later) API keys and syncs — the actor says who.
 */

export interface Actor {
  type: ActorType;
  name: string;
}

type Delegate = {
  findUnique(args: { where: Record<string, string> }): Promise<Record<string, unknown> | null>;
  update(args: { where: Record<string, string>; data: Record<string, unknown> }): Promise<unknown>;
};

/** Prisma model + primary-key field per entity. */
function table(entity: string): { d: Delegate; pk: string } | null {
  const p = prisma as unknown as Record<string, Delegate>;
  switch (entity) {
    case "site":
      return { d: p.site, pk: "key" };
    case "client":
      return { d: p.client, pk: "id" };
    case "pool":
      return { d: p.costPool, pk: "key" };
    case "service":
      return { d: p.service, pk: "code" };
    case "xeromap":
      return { d: p.xeroAccountMap, pk: "accountCode" };
    case "wmsmap":
      return { d: p.wmsCodeMap, pk: "id" };
    case "supplier":
      return { d: p.supplier, pk: "id" };
    case "staff":
      return { d: p.staff, pk: "id" };
    default:
      return null;
  }
}

/** Fields stored as SQL DATE: Prisma wants a Date. */
const toDb = (kind: string, v: unknown) => (kind === "date" && typeof v === "string" ? new Date(v + "T00:00:00Z") : v);

export async function getRule(key: string): Promise<number | null> {
  const def = RULES[key];
  if (!def) throw new Error(`Unknown rule ${key}`);
  const row = await prisma.setting.findUnique({ where: { key: `rule:${key}` } });
  return row ? (row.value as number | null) : def.default;
}

export async function getRules(): Promise<Record<string, number | null>> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: "rule:" } } });
  const stored = Object.fromEntries(rows.map((r) => [r.key.slice(5), r.value as number | null]));
  return Object.fromEntries(Object.entries(RULES).map(([k, d]) => [k, k in stored ? stored[k] : d.default]));
}

export async function readValue(entity: string, id: string, field: string): Promise<unknown> {
  if (entity === "rule") return getRule(field);
  const t = table(entity);
  if (!t) throw new Error(`Unknown entity ${entity}`);
  const row = await t.d.findUnique({ where: { [t.pk]: id } });
  if (!row) throw new Error(`${entity} ${id} not found`);
  return row[field];
}

export type UpdateResult = { ok: true; changed: boolean; value: unknown } | { ok: false; error: string };

/** Validate → compare → write → log. Unchanged values are not logged. */
export async function updateValue(entity: string, id: string, field: string, raw: string | boolean | null, actor: Actor, reason?: string | null): Promise<UpdateResult> {
  const spec = fieldSpec(entity, field);
  if (!spec) return { ok: false, error: `“${field}” can't be edited here` };
  const parsed = parseFieldValue(spec, raw);
  if (!parsed.ok) return parsed;
  const before = await readValue(entity, id, field);
  if (sameValue(before, parsed.value)) return { ok: true, changed: false, value: parsed.value };
  if (entity === "rule") {
    await prisma.setting.upsert({ where: { key: `rule:${field}` }, update: { value: parsed.value as never }, create: { key: `rule:${field}`, value: parsed.value as never } });
  } else {
    const t = table(entity)!;
    await t.d.update({ where: { [t.pk]: id }, data: { [field]: toDb(spec.kind, parsed.value) } });
  }
  await logChange({ entity, entityId: id, field, oldValue: before, newValue: parsed.value, actor, reason });
  return { ok: true, changed: true, value: parsed.value };
}

export async function logChange(e: { entity: string; entityId: string; field: string; oldValue: unknown; newValue: unknown; actor: Actor; reason?: string | null }): Promise<void> {
  await prisma.changeLog.create({
    data: {
      entity: e.entity,
      entityId: e.entityId,
      field: e.field,
      oldValue: logSafe(e.oldValue) as never,
      newValue: logSafe(e.newValue) as never,
      reason: e.reason?.trim() || null,
      actorType: e.actor.type,
      actorName: e.actor.name,
    },
  });
}

export interface LogLine {
  id: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  actorType: ActorType;
  actorName: string;
  at: string;
}

/** Logs for one value (field given) or a whole record (field omitted), newest first. entityId "x*" = ids starting with x. */
export async function getLogs(entity: string, entityId: string, field?: string, take = 50): Promise<LogLine[]> {
  const idWhere = entityId.endsWith("*") ? { startsWith: entityId.slice(0, -1) } : entityId;
  const rows = await prisma.changeLog.findMany({ where: { entity, entityId: idWhere, ...(field ? { field } : {}) }, orderBy: { at: "desc" }, take });
  return rows.map((r) => ({ id: r.id, field: r.field, oldValue: r.oldValue, newValue: r.newValue, reason: r.reason, actorType: r.actorType, actorName: r.actorName, at: r.at.toISOString() }));
}

/** How many log lines each value of a record has (for the small "Logs · 3" button). */
export async function logCounts(entity: string, entityIds: string[]): Promise<Record<string, number>> {
  if (!entityIds.length) return {};
  const rows = await prisma.changeLog.groupBy({ by: ["entityId", "field"], where: { entity, entityId: { in: entityIds } }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [`${r.entityId}|${r.field}`, r._count._all]));
}
