import { prisma } from "@/lib/db";
import { parseFieldValue, sameValue } from "./fields";
import { ENTITY_FIELDS } from "./specs";
import { logChange, type Actor } from "./store";

/**
 * CSV import for Settings lists (services catalogue, clients, staff, WMS code mapping, Xero account mapping).
 * Two steps: plan (preview, nothing saved) → apply. Rows are matched to existing records; only real changes are
 * written, each one logged. Nothing is ever deleted by an import.
 */

export type ImportEntity = "service" | "client" | "staff" | "wmsmap" | "xeromap";

/** Columns per entity: [csv header (case-insensitive, aliases with |), field]. The first is the match key. */
export const IMPORT_COLUMNS: Record<ImportEntity, ReadonlyArray<readonly [string, string]>> = {
  service: [["code|charge code", "code"], ["name|service", "name"], ["unit|per", "unit"], ["minutes|standard minutes", "minutes"], ["basis|minutes basis", "minutesBasis"], ["labour|pool", "poolKind"], ["billable", "billable"]],
  client: [["name|client", "name"], ["short name|short", "shortName"], ["xero contact id|xero id", "xeroContactId"], ["dyspatch customer id|wms tenant id|tenant", "dyspatchCustomerId"], ["status", "status"], ["type", "type"], ["sites|site", "sites"], ["weekly minimum", "weeklyMinimum"], ["thomax tenant", "thomaxTenantId"], ["logiwa client", "logiwaClientId"]],
  staff: [["name", "name"], ["site", "site"], ["position", "position"], ["pool", "pool"], ["type", "type"], ["xero payroll id|xero employee id", "xeroEmployeeId"], ["thomax code|thomax", "thomaxCode"], ["3plwms code|p3l code|3plwms", "p3lCode"], ["logiwa code|logiwa", "logiwaCode"]],
  wmsmap: [["source|wms", "source"], ["tenant|client id", "tenant"], ["wms code|charge code", "wmsCode"], ["service code|standard code", "serviceCode"], ["note", "note"]],
  xeromap: [["account code|code", "accountCode"], ["account name|name", "accountName"], ["pool|cost pool", "poolKey"], ["treatment", "treatment"], ["note", "note"]],
};

export interface ImportPlan {
  creates: Array<{ line: number; key: string; data: Record<string, unknown> }>;
  updates: Array<{ line: number; id: string; key: string; field: string; old: unknown; value: unknown }>;
  unchanged: number;
  errors: Array<{ line: number; message: string }>;
  unknownColumns: string[];
}

/** RFC-4180-ish CSV (quotes, doubled quotes, commas or tabs). */
export function parseCsv(text: string): string[][] {
  const delim = (text.split("\n")[0] ?? "").includes("\t") && !(text.split("\n")[0] ?? "").includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row.map((x) => x.trim()));
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row.map((x) => x.trim()));
  return rows;
}

const KEY_SPECS: Record<string, { label: string }> = { code: { label: "Code" }, accountCode: { label: "Account code" }, source: { label: "WMS" }, tenant: { label: "Tenant" }, wmsCode: { label: "WMS code" } };

/** Map headers, parse every cell with the field spec, match to existing rows and list what would change. */
export async function planImport(entity: ImportEntity, rows: string[][]): Promise<ImportPlan> {
  const cols = IMPORT_COLUMNS[entity];
  const header = rows[0].map((h) => h.toLowerCase().trim());
  const colIdx = cols.map(([names, field]) => [field, header.findIndex((h) => names.split("|").includes(h))] as const);
  const unknownColumns = rows[0].filter((_, i) => !colIdx.some(([, j]) => j === i));
  const plan: ImportPlan = { creates: [], updates: [], unchanged: 0, errors: [], unknownColumns };
  const keyField = cols[0][1];
  if (colIdx[0][1] < 0) {
    plan.errors.push({ line: 1, message: `Missing the "${cols[0][0].split("|")[0]}" column` });
    return plan;
  }
  const existing = await loadExisting(entity);
  const seen = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const line = r + 1;
    const data: Record<string, unknown> = {};
    let bad = false;
    for (const [field, j] of colIdx) {
      if (j < 0) continue;
      const raw = rows[r][j] ?? "";
      if (field in KEY_SPECS) {
        data[field] = field === "code" ? raw.toUpperCase() : field === "source" ? raw.toUpperCase().replace("3PLWMS", "P3L") : raw;
        continue;
      }
      if (raw === "" && field !== keyField) continue; // empty cell = leave as is
      const spec = ENTITY_FIELDS[entity][field];
      if (!spec) continue;
      const p = parseFieldValue(spec, raw);
      if (!p.ok) {
        plan.errors.push({ line, message: `${spec.label}: ${p.error}` });
        bad = true;
      } else data[field] = p.value;
    }
    if (bad) continue;
    const key = matchKey(entity, data);
    if (!key) {
      plan.errors.push({ line, message: `${cols[0][0].split("|")[0]} is empty` });
      continue;
    }
    if (seen.has(key)) {
      plan.errors.push({ line, message: `Duplicate of an earlier row (${key})` });
      continue;
    }
    seen.add(key);
    const cur = existing.get(key) ?? (entity === "client" && data.name ? existing.get(`name:${String(data.name).toLowerCase()}`) : undefined);
    if (!cur) {
      const need = entity === "service" ? ["name", "unit"] : entity === "wmsmap" ? ["serviceCode", "wmsCode"] : entity === "xeromap" ? [] : ["name"];
      const missing = need.filter((f) => data[f] == null || data[f] === "");
      if (missing.length) plan.errors.push({ line, message: `New row needs: ${missing.join(", ")}` });
      else plan.creates.push({ line, key, data });
      continue;
    }
    let changed = false;
    for (const [field, v] of Object.entries(data)) {
      if (field in KEY_SPECS || field === "name" && entity !== "service" && entity !== "xeromap") continue;
      if (!sameValue(cur.row[field], v)) {
        plan.updates.push({ line, id: cur.id, key, field, old: cur.row[field], value: v });
        changed = true;
      }
    }
    if (!changed) plan.unchanged++;
  }
  if (entity === "wmsmap") {
    const codes = new Set((await prisma.service.findMany({ select: { code: true } })).map((s) => s.code));
    for (const c of plan.creates) if (!codes.has(String(c.data.serviceCode))) plan.errors.push({ line: c.line, message: `${c.data.serviceCode} isn't in Services` });
  }
  return plan;
}

function matchKey(entity: ImportEntity, d: Record<string, unknown>): string | null {
  switch (entity) {
    case "service":
      return d.code ? String(d.code) : null;
    case "xeromap":
      return d.accountCode ? String(d.accountCode) : null;
    case "wmsmap":
      return d.source && d.wmsCode ? `${d.source}|${d.tenant ?? ""}|${d.wmsCode}` : null;
    case "client":
      return d.xeroContactId ? `xero:${d.xeroContactId}` : d.name ? `name:${String(d.name).toLowerCase()}` : null;
    case "staff":
      return d.xeroEmployeeId ? `xero:${d.xeroEmployeeId}` : d.name ? `name:${String(d.name).toLowerCase()}` : null;
  }
}

async function loadExisting(entity: ImportEntity): Promise<Map<string, { id: string; row: Record<string, unknown> }>> {
  const m = new Map<string, { id: string; row: Record<string, unknown> }>();
  const add = (k: string | null, id: string, row: Record<string, unknown>) => k && m.set(k, { id, row });
  if (entity === "service") for (const r of await prisma.service.findMany()) add(r.code, r.code, r as never);
  if (entity === "xeromap") for (const r of await prisma.xeroAccountMap.findMany()) add(r.accountCode, r.accountCode, r as never);
  if (entity === "wmsmap") for (const r of await prisma.wmsCodeMap.findMany()) add(`${r.source}|${r.tenant}|${r.wmsCode}`, r.id, r as never);
  if (entity === "client")
    for (const r of await prisma.client.findMany()) {
      add(r.xeroContactId ? `xero:${r.xeroContactId}` : null, r.id, r as never);
      add(`name:${r.name.toLowerCase()}`, r.id, r as never);
    }
  if (entity === "staff")
    for (const r of await prisma.staff.findMany()) {
      add(r.xeroEmployeeId ? `xero:${r.xeroEmployeeId}` : null, r.id, r as never);
      add(`name:${r.name.toLowerCase()}`, r.id, r as never);
    }
  return m;
}

const dbVal = (entity: string, field: string, v: unknown) => (ENTITY_FIELDS[entity]?.[field]?.kind === "date" && typeof v === "string" ? new Date(v + "T00:00:00Z") : v);

export async function applyImport(entity: ImportEntity, plan: ImportPlan, actor: Actor): Promise<void> {
  const reason = "CSV import";
  for (const c of plan.creates) {
    const data = Object.fromEntries(Object.entries(c.data).map(([k, v]) => [k, dbVal(entity, k, v)]));
    let id: string;
    if (entity === "service") id = (await prisma.service.create({ data: data as never })).code;
    else if (entity === "xeromap") id = (await prisma.xeroAccountMap.create({ data: data as never })).accountCode;
    else if (entity === "wmsmap") id = (await prisma.wmsCodeMap.create({ data: { tenant: "", ...data } as never })).id;
    else if (entity === "client") id = (await prisma.client.create({ data: data as never })).id;
    else id = (await prisma.staff.create({ data: data as never })).id;
    await logChange({ entity, entityId: id, field: "_created", oldValue: null, newValue: c.data, actor, reason });
  }
  for (const u of plan.updates) {
    const where = entity === "service" ? { code: u.id } : entity === "xeromap" ? { accountCode: u.id } : { id: u.id };
    const d = { [u.field]: dbVal(entity, u.field, u.value) };
    if (entity === "service") await prisma.service.update({ where: where as never, data: d });
    else if (entity === "xeromap") await prisma.xeroAccountMap.update({ where: where as never, data: d });
    else if (entity === "wmsmap") await prisma.wmsCodeMap.update({ where: where as never, data: d });
    else if (entity === "client") await prisma.client.update({ where: where as never, data: d });
    else await prisma.staff.update({ where: where as never, data: d });
    await logChange({ entity, entityId: u.id, field: u.field, oldValue: u.old, newValue: u.value, actor, reason });
  }
}
