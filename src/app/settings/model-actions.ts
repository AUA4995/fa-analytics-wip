"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertAdmin, assertUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { formatFieldValue, logSafe } from "@/lib/model/fields";
import { ENTITY_FIELDS } from "@/lib/model/specs";
import { getLogs, logChange, updateValue, type Actor, type LogLine } from "@/lib/model/store";
import { parseCsv, planImport, type ImportEntity, type ImportPlan } from "@/lib/model/csv";

const actorOf = (u: { name: string }): Actor => ({ type: "USER", name: u.name });

function revalidateAll() {
  revalidatePath("/settings");
  revalidatePath("/cost");
}

export type ValueState = { ok: boolean; message: string; display?: string };

/** Edit one value (Settings or a details panel). Same validation and log either way. */
export async function updateValueAction(entity: string, id: string, field: string, raw: string | boolean | null, reason?: string): Promise<ValueState> {
  try {
    const me = await assertAdmin();
    const r = await updateValue(entity, id, field, raw, actorOf(me), reason);
    if (!r.ok) return { ok: false, message: r.error };
    if (r.changed) revalidateAll();
    return { ok: true, message: r.changed ? "Saved" : "No change", display: formatFieldValue(ENTITY_FIELDS[entity][field], r.value) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** History of who changed access, connections or setup: admins only (it holds names, emails, the Thomax user name). */
const ADMIN_ONLY_LOGS = new Set(["user", "accessRequest", "thomax", "ops", "company"]);

export async function logsAction(entity: string, id: string, field?: string): Promise<LogLine[]> {
  const me = await assertUser();
  // One record (or one record's sub-rows, "<id>|*") at a time — never "everything of this kind"
  if (!id || id.startsWith("*") || (id.endsWith("*") && !id.endsWith("|*"))) return [];
  if (ADMIN_ONLY_LOGS.has(entity) && !isAdminRole(me.role)) return [];
  return getLogs(entity, id, field);
}

export type CreateState = { ok: boolean; message: string; id?: string };

/** Add a client, supplier, staff member, service, cost pool or mapping row. */
export async function createRecord(entity: string, _prev: CreateState | null, formData: FormData): Promise<CreateState> {
  try {
    const me = await assertAdmin();
    const s = (k: string) => String(formData.get(k) ?? "").trim();
    let id: string;
    switch (entity) {
      case "client": {
        if (!s("name")) return { ok: false, message: "Enter the client's name." };
        id = (await prisma.client.create({ data: { name: s("name"), shortName: s("shortName") || null, sites: formData.getAll("sites").map(String) } })).id;
        break;
      }
      case "supplier": {
        if (!s("name")) return { ok: false, message: "Enter the supplier's name." };
        id = (await prisma.supplier.create({ data: { name: s("name"), poolKey: s("poolKey") || null } })).id;
        break;
      }
      case "staff": {
        if (!s("name")) return { ok: false, message: "Enter the person's name." };
        id = (await prisma.staff.create({ data: { name: s("name"), site: s("site") || "smi", pool: s("pool") || "floor", position: s("position") || null } })).id;
        // Added by hand (not from Xero Payroll): no pay = no cost until they're set up in payroll and linked
        const [firstName, ...rest] = s("name").split(/\s+/);
        const { createTask } = await import("@/lib/tasks");
        await createTask({ title: `Set up ${s("name")} in Xero Payroll`, detail: "No pay or hours in Xero = no labour cost for this person. Then link the employee in Settings → Staff.", where: "Xero", link: "https://go.xero.com/payroll", source: `xero-employee:${id}`, verify: rest.length ? { type: "xero-employee", firstName, lastName: rest.join(" ") } : { type: "staff-linked", staffId: id } });
        break;
      }
      case "service": {
        const code = s("code").toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9-]{1,30}$/.test(code)) return { ok: false, message: "Code: letters, numbers and dashes, e.g. PCK-UNIT." };
        if (!s("name") || !s("unit")) return { ok: false, message: "Enter a name and what it is charged per." };
        if (await prisma.service.findUnique({ where: { code } })) return { ok: false, message: `${code} already exists.` };
        id = (await prisma.service.create({ data: { code, name: s("name"), unit: s("unit") } })).code;
        break;
      }
      case "pool": {
        const key = s("key").toLowerCase();
        if (!/^[a-z][a-z0-9_]{1,30}$/.test(key)) return { ok: false, message: "Key: lower-case letters, numbers and _, e.g. rent_smi." };
        if (await prisma.costPool.findUnique({ where: { key } })) return { ok: false, message: `${key} already exists.` };
        id = (await prisma.costPool.create({ data: { key, name: s("name") || key, kind: s("kind") === "LABOUR" ? "LABOUR" : "OVERHEAD", driver: s("driver") || "ORDERS", site: s("site") || null } })).key;
        break;
      }
      case "xeromap": {
        const code = s("accountCode");
        if (!code) return { ok: false, message: "Enter the Xero account code." };
        await prisma.xeroAccountMap.upsert({ where: { accountCode: code }, update: { poolKey: s("poolKey") || null }, create: { accountCode: code, accountName: s("accountName") || null, poolKey: s("poolKey") || null, treatment: s("treatment") || "INCLUDE" } });
        id = code;
        break;
      }
      case "wmsmap": {
        const source = s("source"), wmsCode = s("wmsCode"), serviceCode = s("serviceCode").toUpperCase();
        if (!["THOMAX", "P3L", "LOGIWA"].includes(source) || !wmsCode || !serviceCode) return { ok: false, message: "Choose the WMS, and enter the WMS code and the standard code." };
        if (!(await prisma.service.findUnique({ where: { code: serviceCode } }))) return { ok: false, message: `${serviceCode} isn't in Services yet.` };
        id = (await prisma.wmsCodeMap.upsert({ where: { source_tenant_wmsCode: { source, tenant: s("tenant"), wmsCode } }, update: { serviceCode }, create: { source, tenant: s("tenant"), wmsCode, serviceCode } })).id;
        break;
      }
      default:
        return { ok: false, message: `Can't add ${entity} here.` };
    }
    await logChange({ entity, entityId: id, field: "_created", oldValue: null, newValue: Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)])), actor: actorOf(me) });
    revalidateAll();
    return { ok: true, message: "Added.", id };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Remove a mapping row or an unused service (logged with the full old row). */
export async function deleteRecord(entity: "xeromap" | "wmsmap" | "service" | "supplier", id: string): Promise<CreateState> {
  try {
    const me = await assertAdmin();
    let old: unknown;
    if (entity === "xeromap") old = await prisma.xeroAccountMap.delete({ where: { accountCode: id } });
    else if (entity === "wmsmap") old = await prisma.wmsCodeMap.delete({ where: { id } });
    else if (entity === "supplier") old = await prisma.supplier.delete({ where: { id } });
    else {
      if (await prisma.wmsCodeMap.count({ where: { serviceCode: id } })) return { ok: false, message: "WMS codes still map to this service — remap them first, or set it to not in use." };
      old = await prisma.service.delete({ where: { code: id } });
    }
    await logChange({ entity, entityId: id, field: "_deleted", oldValue: JSON.parse(JSON.stringify(old, (_k, v) => logSafe(v))), newValue: null, actor: actorOf(me) });
    revalidateAll();
    return { ok: true, message: "Removed." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Allocation matrix cell: % of a person's time on a client (0 removes). Total per person can't go over 100%. */
export async function setAllocation(staffId: string, clientId: string, raw: string): Promise<ValueState> {
  try {
    const me = await assertAdmin();
    const pct = raw.trim() === "" ? 0 : Number(raw.replace("%", ""));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { ok: false, message: "0–100" };
    const rows = await prisma.staffAllocation.findMany({ where: { staffId } });
    const old = rows.find((r) => r.clientId === clientId);
    const others = rows.filter((r) => r.clientId !== clientId).reduce((a, r) => a + Number(r.pct), 0);
    if (others + pct > 100.001) return { ok: false, message: `Total would be ${Math.round((others + pct) * 10) / 10}% (max 100%)` };
    const before = old ? Number(old.pct) : 0;
    if (before === pct && (old?.source ?? "MANUAL") === "MANUAL") return { ok: true, message: "No change" };
    if (pct === 0) await prisma.staffAllocation.deleteMany({ where: { staffId, clientId } });
    else await prisma.staffAllocation.upsert({ where: { staffId_clientId: { staffId, clientId } }, update: { pct, source: "MANUAL" }, create: { staffId, clientId, pct, source: "MANUAL" } });
    await logChange({ entity: "allocation", entityId: `${staffId}|${clientId}`, field: "pct", oldValue: before, newValue: pct, actor: actorOf(me), reason: old?.source === "WMS" ? "Manual override of the WMS share" : null });
    revalidateAll();
    return { ok: true, message: "Saved", display: pct ? `${pct}%` : "" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export type ImportState = { ok: boolean; message: string; plan?: ImportPlan; done?: boolean };

/** CSV import, two steps: preview (commit=false) then save (commit=true). Never deletes; updates are logged. */
export async function importCsvAction(entity: ImportEntity, text: string, commit: boolean): Promise<ImportState> {
  try {
    const me = await assertAdmin();
    const rows = parseCsv(text);
    if (rows.length < 2) return { ok: false, message: "Paste a header row and at least one data row." };
    const plan = await planImport(entity, rows);
    if (!commit || plan.errors.length) return { ok: plan.errors.length === 0, message: plan.errors.length ? `${plan.errors.length} rows need fixing before anything is saved.` : `Ready: ${plan.creates.length} new, ${plan.updates.length} updated, ${plan.unchanged} unchanged.`, plan };
    const { applyImport } = await import("@/lib/model/csv");
    await applyImport(entity, plan, actorOf(me));
    revalidateAll();
    return { ok: true, done: true, message: `Saved: ${plan.creates.length} new, ${plan.updates.length} updated. Every change is in the logs.`, plan };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
