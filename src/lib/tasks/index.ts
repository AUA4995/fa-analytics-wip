import { prisma } from "@/lib/db";
import { xeroGet } from "@/lib/xero/client";
import { getConnection } from "@/lib/xero/auth";
import { logChange } from "@/lib/model/store";

/**
 * Follow-up tasks (brief §13). Resolve = checked against the source where possible:
 *   found → Done ("confirmed by API" / "confirmed in Analytics"); not found → snoozed 24 h with the reason, re-checked
 *   after each sync and closed automatically when found; back to Open after 24 h if still not found.
 * Tasks without a check are closed by hand ("confirmed by hand").
 */

export type Verify =
  | { type: "xero-contact"; name: string }
  | { type: "xero-employee"; firstName: string; lastName: string }
  | { type: "staff-linked"; staffId: string }
  | { type: "staff-allocated"; staffId: string }
  | { type: "client-tenant"; clientId: string }
  | { type: "client-xero"; clientId: string }
  | { type: "client-rates"; clientId: string }
  | { type: "service-mapped"; source: string; wmsCode: string };

export interface NewTask {
  title: string;
  detail?: string;
  where?: string;
  link?: string;
  clientId?: string | null;
  owner?: string | null;
  priority?: "High" | "Normal" | "Low";
  due?: Date | null;
  source?: string;
  verify?: Verify | null;
}

/** Create a task once per source (a second call with the same source returns the existing task). */
export async function createTask(t: NewTask) {
  if (t.source) {
    const cur = await prisma.task.findFirst({ where: { source: t.source, status: { not: "DONE" } } });
    if (cur) return cur;
  }
  return prisma.task.create({ data: { title: t.title, detail: t.detail ?? null, where: t.where ?? null, link: t.link ?? null, clientId: t.clientId ?? null, owner: t.owner ?? null, priority: t.priority ?? "Normal", due: t.due ?? null, source: t.source ?? null, verify: (t.verify ?? undefined) as never } });
}

export type CheckResult = { ok: boolean; message: string; via: "API" | "Analytics" | "hand" };

const q = (s: string) => s.replace(/"/g, '\\"');

export async function runCheck(v: Verify | null): Promise<CheckResult> {
  if (!v) return { ok: true, message: "Confirmed by hand", via: "hand" };
  switch (v.type) {
    case "xero-contact": {
      if (!(await getConnection())) return { ok: false, message: "Xero isn't connected, so it can't be checked", via: "API" };
      const r = await xeroGet<{ Contacts?: Array<{ Name: string }> }>("/Contacts", { params: { where: `Name=="${q(v.name)}"` } });
      return r.Contacts?.length ? { ok: true, message: `Confirmed by API: “${r.Contacts[0].Name}” is in Xero`, via: "API" } : { ok: false, message: `Check failed: no Xero contact named “${v.name}”`, via: "API" };
    }
    case "xero-employee": {
      if (!(await getConnection())) return { ok: false, message: "Xero isn't connected, so it can't be checked", via: "API" };
      const r = await xeroGet<{ Employees?: Array<{ FirstName: string; LastName: string; EmployeeID: string }> }>("/Employees", { api: "payroll", params: { where: `FirstName=="${q(v.firstName)}"&&LastName=="${q(v.lastName)}"` } });
      return r.Employees?.length ? { ok: true, message: `Confirmed by API: ${v.firstName} ${v.lastName} is in Xero Payroll`, via: "API" } : { ok: false, message: `Check failed: ${v.firstName} ${v.lastName} isn't in Xero Payroll`, via: "API" };
    }
    case "staff-linked": {
      const s = await prisma.staff.findUnique({ where: { id: v.staffId } });
      return s?.xeroEmployeeId ? { ok: true, message: "Confirmed: linked to Xero Payroll", via: "Analytics" } : { ok: false, message: "Check failed: not linked to a Xero Payroll employee yet", via: "Analytics" };
    }
    case "staff-allocated": {
      const n = await prisma.staffAllocation.count({ where: { staffId: v.staffId } });
      return n ? { ok: true, message: `Confirmed: allocated to ${n} clients`, via: "Analytics" } : { ok: false, message: "Check failed: no client allocation yet", via: "Analytics" };
    }
    case "client-tenant": {
      const c = await prisma.client.findUnique({ where: { id: v.clientId } });
      return c && (c.dyspatchCustomerId || c.thomaxTenantId || c.logiwaClientId || c.p3lClientId) ? { ok: true, message: "Confirmed: WMS / Dyspach ID set", via: "Analytics" } : { ok: false, message: "Check failed: no WMS or Dyspach ID on the client yet", via: "Analytics" };
    }
    case "client-xero": {
      const c = await prisma.client.findUnique({ where: { id: v.clientId } });
      return c?.xeroContactId ? { ok: true, message: "Confirmed: linked to a Xero contact", via: "Analytics" } : { ok: false, message: "Check failed: not linked to a Xero contact yet", via: "Analytics" };
    }
    case "client-rates": {
      const n = await prisma.clientRate.count({ where: { clientId: v.clientId } });
      return n ? { ok: true, message: `Confirmed: ${n} rates`, via: "Analytics" } : { ok: false, message: "Check failed: no rates yet (CLM or Settings → Clients)", via: "Analytics" };
    }
    case "service-mapped": {
      const n = await prisma.wmsCodeMap.count({ where: { source: v.source, wmsCode: v.wmsCode } });
      return n ? { ok: true, message: "Confirmed: mapped to a standard service", via: "Analytics" } : { ok: false, message: `Check failed: ${v.wmsCode} isn't mapped yet`, via: "Analytics" };
    }
  }
}

/** Resolve: run the check; pass → Done; fail → snoozed 24 h. */
export async function resolveTask(id: string, by: string, note?: string | null): Promise<CheckResult> {
  const t = await prisma.task.findUniqueOrThrow({ where: { id } });
  let r: CheckResult;
  try {
    r = await runCheck((t.verify as Verify | null) ?? null);
  } catch (err) {
    r = { ok: false, message: `Couldn't check: ${err instanceof Error ? err.message : String(err)}`, via: "API" };
  }
  if (r.ok) {
    await prisma.task.update({ where: { id }, data: { status: "DONE", doneAt: new Date(), doneBy: by, doneNote: note?.trim() || null, lastCheck: r.message, snoozedUntil: null } });
    await afterDone(t.source, by);
  } else {
    await prisma.task.update({ where: { id }, data: { status: "SNOOZED", snoozedUntil: new Date(Date.now() + 24 * 3600_000), lastCheck: r.message } });
  }
  await logChange({ entity: "task", entityId: id, field: "status", oldValue: t.status, newValue: r.ok ? "DONE" : "SNOOZED", actor: { type: "USER", name: by }, reason: r.message });
  return r;
}

export async function snoozeTask(id: string, by: string, hours = 48) {
  const t = await prisma.task.update({ where: { id }, data: { status: "SNOOZED", snoozedUntil: new Date(Date.now() + hours * 3600_000) } });
  await logChange({ entity: "task", entityId: id, field: "status", oldValue: "OPEN", newValue: "SNOOZED", actor: { type: "USER", name: by }, reason: `Snoozed ${hours} h` });
  return t;
}

/** After a sync: re-check snoozed tasks (close when the check passes) and reopen expired snoozes. */
export async function recheckTasks(): Promise<{ closed: number; reopened: number }> {
  let closed = 0;
  let reopened = 0;
  for (const t of await prisma.task.findMany({ where: { status: "SNOOZED" } })) {
    if (t.verify) {
      const r = await runCheck(t.verify as Verify).catch(() => null);
      if (r?.ok) {
        await prisma.task.update({ where: { id: t.id }, data: { status: "DONE", doneAt: new Date(), doneBy: "sync", lastCheck: r.message } });
        await afterDone(t.source, "sync");
        closed++;
        continue;
      }
    }
    if (t.snoozedUntil && t.snoozedUntil < new Date()) {
      await prisma.task.update({ where: { id: t.id }, data: { status: "OPEN", snoozedUntil: null } });
      reopened++;
    }
  }
  return { closed, reopened };
}

/** A leakage task done → the finding moves on (still needs "Recovered" with the invoice when billed). */
async function afterDone(source: string | null, by: string) {
  if (source?.startsWith("leakage:")) {
    const id = source.slice(8);
    const l = await prisma.leakageItem.findUnique({ where: { id } });
    if (l && l.status === "TASK") await prisma.leakageItem.update({ where: { id }, data: { note: `${l.note ? l.note + " · " : ""}Task done by ${by}` } });
  }
}

export async function openTaskCount(): Promise<number> {
  return prisma.task.count({ where: { OR: [{ status: "OPEN" }, { status: "SNOOZED", snoozedUntil: { lt: new Date() } }] } });
}
