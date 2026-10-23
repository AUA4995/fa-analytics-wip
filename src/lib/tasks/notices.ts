import { prisma } from "@/lib/db";
import { createTask } from "./index";
import { logChange, type Actor } from "@/lib/model/store";

/**
 * What's new after a sync (brief §13): people in Xero Payroll not in Staff, Xero customers billed recently that no
 * client is linked to, and WMS tenants no client has. Each is notified once (stable key). "Add to Analytics" creates
 * the record pre-filled from the source and linked follow-up tasks for every missing step — saving is never blocked.
 */

export async function generateNotifications(): Promise<number> {
  let added = 0;
  const add = async (kind: string, key: string, title: string, detail: string, payload: object) => {
    if (await prisma.notification.findUnique({ where: { key } })) return;
    await prisma.notification.create({ data: { kind, key, title, detail, payload } });
    added++;
  };
  const since = new Date(Date.now() - 90 * 86400000);

  const staffIds = new Set((await prisma.staff.findMany({ select: { xeroEmployeeId: true } })).map((s) => s.xeroEmployeeId).filter(Boolean));
  for (const e of await prisma.payrollEmployee.findMany({ where: { endDate: null } })) {
    if (staffIds.has(e.xeroId)) continue;
    await add("NEW_STAFF", `xero-employee:${e.xeroId}`, `New staff member in Xero Payroll: ${e.firstName} ${e.lastName}`, `Started ${e.startDate ? e.startDate.toISOString().slice(0, 10).split("-").reverse().join("/") : "—"}. Add to Analytics with site, position and clients so their pay is costed.`, { xeroId: e.xeroId, firstName: e.firstName, lastName: e.lastName });
  }

  const linkedContacts = new Set((await prisma.client.findMany({ select: { xeroContactId: true } })).map((c) => c.xeroContactId).filter(Boolean));
  const recent = await prisma.xeroSale.groupBy({ by: ["contactId"], where: { date: { gte: since }, kind: "INVOICE" }, _count: { _all: true } });
  for (const r of recent) {
    if (linkedContacts.has(r.contactId)) continue;
    const c = await prisma.xeroContact.findUnique({ where: { xeroId: r.contactId } });
    if (!c) continue;
    await add("NEW_CLIENT", `xero-contact:${c.xeroId}`, `Client in Xero not in Analytics: ${c.name}`, `${r._count._all} invoices in the last 90 days.`, { xeroId: c.xeroId, name: c.name, email: c.email });
  }

  const clients = await prisma.client.findMany({ select: { dyspatchCustomerId: true, thomaxTenantId: true, p3lClientId: true, logiwaClientId: true } });
  const known = (source: string, t: string) => clients.some((c) => (source === "THOMAX" ? [c.thomaxTenantId, c.dyspatchCustomerId] : source === "P3L" ? [c.p3lClientId] : [c.logiwaClientId, c.dyspatchCustomerId]).includes(t));
  const tenants = [
    ...(await prisma.volumeLine.groupBy({ by: ["source", "tenant"], where: { date: { gte: since } } })),
    ...(await prisma.orderFact.groupBy({ by: ["source", "tenant"], where: { date: { gte: since } } })),
  ];
  for (const t of tenants) {
    if (known(t.source, t.tenant)) continue;
    await add("NEW_TENANT", `tenant:${t.source}:${t.tenant}`, `WMS tenant not linked to a client: ${t.tenant} (${t.source === "P3L" ? "3PLWMS" : t.source === "THOMAX" ? "Thomax" : "Logiwa"})`, "Its volumes are left out of cost and leakage until a client has this ID.", { source: t.source, tenant: t.tenant });
  }
  return added;
}

/** "Add to Analytics" from a notification: create the record and the follow-up tasks. */
export async function addFromNotification(id: string, form: Record<string, string>, actor: Actor): Promise<{ ok: boolean; message: string; tasks: number }> {
  const n = await prisma.notification.findUniqueOrThrow({ where: { id } });
  const p = (n.payload ?? {}) as Record<string, string>;
  let tasks = 0;
  if (n.kind === "NEW_STAFF") {
    const s = await prisma.staff.create({ data: { name: `${p.firstName} ${p.lastName}`.trim(), xeroEmployeeId: p.xeroId, site: form.site || "smi", pool: form.pool || "floor", position: form.position || null, type: (form.type as "PERMANENT" | "CASUAL" | "AGENCY") || "PERMANENT" } });
    await logChange({ entity: "staff", entityId: s.id, field: "_created", oldValue: null, newValue: { from: "Xero Payroll", name: s.name }, actor });
    if (s.pool === "floor" || s.pool === "supervisor") {
      await createTask({ title: `Add WMS user codes for ${s.name}`, detail: "Thomax / 3PLWMS / Logiwa codes link their picks and packs to clients.", where: "Analytics", link: `/settings?section=staff&panel=staff:${s.id}`, source: `staff-codes:${s.id}` });
      tasks++;
    } else {
      await createTask({ title: `Set client allocation for ${s.name}`, detail: "CSR, supervisors and admin aren't seen by the WMS — set their % per client.", where: "Analytics", link: "/settings?section=staff", source: `staff-alloc:${s.id}`, verify: { type: "staff-allocated", staffId: s.id } });
      tasks++;
    }
  } else if (n.kind === "NEW_CLIENT") {
    const c = await prisma.client.create({ data: { name: p.name, shortName: form.shortName || null, xeroContactId: p.xeroId, sites: form.site ? [form.site] : [] } });
    await logChange({ entity: "client", entityId: c.id, field: "_created", oldValue: null, newValue: { from: "Xero", name: c.name }, actor });
    await createTask({ title: `Link ${c.name} to its WMS tenant / Dyspatch ID`, where: "Analytics", link: `/settings?section=clients&panel=client:${c.id}`, clientId: c.id, source: `client-tenant:${c.id}`, verify: { type: "client-tenant", clientId: c.id } });
    await createTask({ title: `Rates for ${c.name}`, detail: "From CLM once connected; until then enter them in Settings → Clients.", where: "Analytics", link: `/settings?section=clients&panel=client:${c.id}`, clientId: c.id, source: `client-rates:${c.id}`, verify: { type: "client-rates", clientId: c.id } });
    tasks += 2;
  } else if (n.kind === "NEW_TENANT") {
    const field = p.source === "THOMAX" ? "thomaxTenantId" : p.source === "P3L" ? "p3lClientId" : "logiwaClientId";
    let c = form.clientId ? await prisma.client.findUnique({ where: { id: form.clientId } }) : null;
    if (c) {
      await prisma.client.update({ where: { id: c.id }, data: { [field]: p.tenant } });
      await logChange({ entity: "client", entityId: c.id, field, oldValue: null, newValue: p.tenant, actor, reason: "Linked from a notification" });
    } else {
      const name = form.name?.trim();
      if (!name) return { ok: false, message: "Pick the client this tenant belongs to, or type a new client's name.", tasks: 0 };
      c = await prisma.client.create({ data: { name, [field]: p.tenant } });
      await logChange({ entity: "client", entityId: c.id, field: "_created", oldValue: null, newValue: { from: "WMS tenant", tenant: p.tenant }, actor });
      await createTask({ title: `Create the Xero contact for ${name}`, where: "Xero", link: "https://go.xero.com/Contacts/", clientId: c.id, source: `xero-contact:${c.id}`, verify: { type: "xero-contact", name } });
      await createTask({ title: `Set up ${name} in Dyspatch`, detail: "Customer ID must equal the WMS tenant ID. No Dyspatch API yet — close by hand.", where: "Dyspatch", clientId: c.id, source: `dyspatch:${c.id}` });
      await createTask({ title: `Link ${name} to its Xero contact`, where: "Analytics", link: `/settings?section=clients&panel=client:${c.id}`, clientId: c.id, source: `client-xero:${c.id}`, verify: { type: "client-xero", clientId: c.id } });
      tasks += 3;
    }
  } else return { ok: false, message: "Nothing to add for this one.", tasks: 0 };
  await prisma.notification.update({ where: { id }, data: { state: "DONE" } });
  return { ok: true, message: tasks ? `Added. ${tasks} follow-up task${tasks > 1 ? "s" : ""} created.` : "Added.", tasks };
}
