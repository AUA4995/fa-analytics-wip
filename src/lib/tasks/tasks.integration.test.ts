/** Tasks, notifications and leakage detection against the test database. */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;
const actor = { type: "USER" as const, name: "Task Tester" };

describe.skipIf(!hasDb)("tasks, notifications, leakage (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  const T = `TK${Date.now() % 100000}`;
  const M = "2019-05";
  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const { ensureModelDefaults } = await import("@/lib/model/defaults");
    await ensureModelDefaults(prisma);
  });
  afterAll(async () => {
    await prisma.task.deleteMany({ where: { OR: [{ title: { contains: T } }, { source: { contains: T } }] } });
    await prisma.notification.deleteMany({ where: { key: { contains: T } } });
    await prisma.leakageItem.deleteMany({ where: { period: { startsWith: "2019-" } } });
    await prisma.xeroSale.deleteMany({ where: { xeroId: { startsWith: T } } });
    await prisma.xeroItemMap.deleteMany({ where: { itemCode: { startsWith: T } } });
    await prisma.volumeImport.deleteMany({ where: { fileName: T } });
    await prisma.wmsCodeMap.deleteMany({ where: { wmsCode: { startsWith: T } } });
    await prisma.clientRate.deleteMany({ where: { serviceCode: { startsWith: T } } });
    await prisma.service.deleteMany({ where: { code: { startsWith: T } } });
    await prisma.staff.deleteMany({ where: { name: { contains: T } } });
    await prisma.payrollEmployee.deleteMany({ where: { xeroId: { startsWith: T } } });
    await prisma.client.deleteMany({ where: { name: { contains: T } } });
    await prisma.changeLog.deleteMany({ where: { actorName: actor.name } });
    await prisma.$disconnect();
  });

  it("resolve runs the check: fail → snoozed 24 h; pass → done; recheck closes snoozed tasks after a sync", async () => {
    const { createTask, resolveTask, recheckTasks } = await import("./index");
    const c = await prisma.client.create({ data: { name: `${T} Co` } });
    const t = await createTask({ title: `Link ${T} tenant`, source: `client-tenant:${T}`, verify: { type: "client-tenant", clientId: c.id } });
    expect((await createTask({ title: "dup", source: `client-tenant:${T}` })).id).toBe(t.id);
    const r1 = await resolveTask(t.id, actor.name);
    expect(r1.ok).toBe(false);
    const s1 = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(s1.status).toBe("SNOOZED");
    expect(s1.snoozedUntil!.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    await prisma.client.update({ where: { id: c.id }, data: { dyspatchCustomerId: `${T}-D` } });
    const rc = await recheckTasks();
    expect(rc.closed).toBeGreaterThanOrEqual(1);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("DONE");
    const manual = await createTask({ title: `Set up ${T} in Dyspatch` });
    expect((await resolveTask(manual.id, actor.name, "done in Dyspatch")).message).toBe("Confirmed by hand");
  });

  it("notifies a new payroll employee once; Add to Analytics creates the staff member and a follow-up task", async () => {
    const { generateNotifications, addFromNotification } = await import("./notices");
    await prisma.payrollEmployee.create({ data: { xeroId: `${T}-e1`, firstName: "Pat", lastName: `${T}` } });
    await generateNotifications();
    await generateNotifications();
    const ns = await prisma.notification.findMany({ where: { key: `xero-employee:${T}-e1` } });
    expect(ns).toHaveLength(1);
    const r = await addFromNotification(ns[0].id, { site: "par", pool: "csr" }, actor);
    expect(r.ok).toBe(true);
    const s = await prisma.staff.findFirstOrThrow({ where: { xeroEmployeeId: `${T}-e1` } });
    expect([s.site, s.pool]).toEqual(["par", "csr"]);
    expect(await prisma.task.count({ where: { source: `staff-alloc:${s.id}` } })).toBe(1);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: ns[0].id } })).state).toBe("DONE");
  });

  it("leakage: volume × rate vs Xero lines mapped by item code; re-run keeps the person's status", async () => {
    const c = await prisma.client.create({ data: { name: `${T} Leak`, thomaxTenantId: `${T}-TEN`, xeroContactId: `${T}-XC` } });
    await prisma.service.create({ data: { code: `${T}-PICK`, name: "Pick", unit: "unit", poolKind: "floor", minutes: 0.3 } });
    await prisma.wmsCodeMap.create({ data: { source: "THOMAX", wmsCode: `${T}-PICKCODE`, serviceCode: `${T}-PICK` } });
    await prisma.clientRate.create({ data: { clientId: c.id, serviceCode: `${T}-PICK`, rate: 0.5 } });
    const imp = await prisma.volumeImport.create({ data: { source: "THOMAX", kind: "CHARGES", fileName: T } });
    await prisma.volumeLine.create({ data: { importId: imp.id, source: "THOMAX", date: new Date(`${M}-08T00:00:00Z`), tenant: `${T}-TEN`, wmsCode: `${T}-PICKCODE`, quantity: 1000 } });
    await prisma.xeroItemMap.create({ data: { itemCode: `${T}-ITEM`, serviceCode: `${T}-PICK` } });
    await prisma.xeroSale.create({ data: { xeroId: `${T}-INV`, kind: "INVOICE", number: "INV-9", contactId: `${T}-XC`, date: new Date(`${M}-10T00:00:00Z`), status: "AUTHORISED", total: 300, lines: { create: [{ itemCode: `${T}-ITEM`, amount: 300 }] } } });
    const { runDetection } = await import("@/lib/leakage/detect");
    await runDetection([M], actor.name);
    const f = await prisma.leakageItem.findUniqueOrThrow({ where: { key: `UNDER_BILLING|${c.id}|${T}-PICK|${M}` } });
    expect([Number(f.expected), Number(f.billed), Number(f.gap)]).toEqual([500, 300, 200]);
    expect(f.working).toContain("INV-9");
    await prisma.leakageItem.update({ where: { id: f.id }, data: { status: "EXPLAINED", cause: "agreed discount" } });
    await runDetection([M], actor.name);
    expect((await prisma.leakageItem.findUniqueOrThrow({ where: { id: f.id } })).status).toBe("EXPLAINED");
    await prisma.xeroSaleLine.updateMany({ where: { saleId: `${T}-INV` }, data: { amount: 500 } });
    await prisma.leakageItem.update({ where: { id: f.id }, data: { status: "OPEN" } });
    await runDetection([M], actor.name);
    expect(await prisma.leakageItem.findUnique({ where: { id: f.id } })).toBeNull();
  });
});
