/** Loader end to end against the test database: payroll + P&L + WMS lines + Settings → engine. */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("cost loader (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  const M = "2019-03"; // a month no other test uses
  const T = `LT${Date.now() % 100000}`;
  let clientId = "";
  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const { ensureModelDefaults } = await import("@/lib/model/defaults");
    await ensureModelDefaults(prisma);
    const c = await prisma.client.create({ data: { name: `${T} Client`, thomaxTenantId: T, sites: ["smi"], cmcShare: 0 } });
    clientId = c.id;
    await prisma.service.createMany({ data: [{ code: `${T}-ORD`, name: "Order", unit: "order", poolKind: "floor", minutes: 2, role: "ORDER" }] });
    await prisma.wmsCodeMap.create({ data: { source: "THOMAX", tenant: "", wmsCode: `${T}-ORDER FEE`, serviceCode: `${T}-ORD` } });
    const imp = await prisma.volumeImport.create({ data: { source: "THOMAX", kind: "CHARGES", rows: 1 } });
    await prisma.volumeLine.create({ data: { importId: imp.id, source: "THOMAX", date: new Date(`${M}-10T00:00:00Z`), tenant: T, wmsCode: `${T}-ORDER FEE`, warehouse: "SYD02", quantity: 600 } });
    await prisma.volumeLine.create({ data: { importId: imp.id, source: "THOMAX", date: new Date(`${M}-11T00:00:00Z`), tenant: `${T}-X`, wmsCode: "WHATEVER", quantity: 5 } });
    await prisma.staff.create({ data: { name: `${T} Picker`, site: "smi", pool: "floor", xeroEmployeeId: `${T}-emp` } });
    await prisma.payRun.create({ data: { xeroId: `${T}-run`, periodStart: new Date(`${M}-01T00:00:00Z`), periodEnd: new Date(`${M}-14T00:00:00Z`), paymentDate: new Date(`${M}-15T00:00:00Z`), status: "POSTED" } });
    await prisma.payslip.create({ data: { xeroId: `${T}-slip`, payRunId: `${T}-run`, employeeId: `${T}-emp`, gross: 3000, super: 360, hours: 80 } });
    await prisma.payslip.create({ data: { xeroId: `${T}-slip2`, payRunId: `${T}-run`, employeeId: `${T}-nobody`, gross: 1000, super: 120, hours: 38 } });
    await prisma.xeroAccountMap.create({ data: { accountCode: `${T}9`, accountName: "Software", poolKey: "software" } });
    await prisma.xeroPnl.createMany({ data: [
      { month: M, accountId: `${T}-a1`, accountCode: `${T}9`, accountName: "Software", section: "Less Operating Expenses", amount: 600 },
      { month: M, accountId: `${T}-a2`, accountCode: `${T}8`, accountName: "Mystery", section: "Less Operating Expenses", amount: 50 },
    ] });
  });
  afterAll(async () => {
    await prisma.xeroPnl.deleteMany({ where: { month: M } });
    await prisma.xeroAccountMap.deleteMany({ where: { accountCode: { startsWith: T } } });
    await prisma.payRun.deleteMany({ where: { xeroId: `${T}-run` } });
    await prisma.staff.deleteMany({ where: { name: { startsWith: T } } });
    await prisma.volumeImport.deleteMany({ where: { lines: { some: { tenant: { startsWith: T } } } } });
    await prisma.wmsCodeMap.deleteMany({ where: { serviceCode: `${T}-ORD` } });
    await prisma.service.deleteMany({ where: { code: { startsWith: T } } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.$disconnect();
  });

  it("links payroll, P&L and volumes; lists what it couldn't link", async () => {
    const { buildInput } = await import("./load");
    const { runEngine } = await import("./engine");
    const { input, notes } = await buildInput(M);
    expect(input.labour.floor_smi).toMatchObject({ gross: 3000, super: 360, hours: 80, people: 1 });
    expect(notes.unlinkedEmployees).toEqual([{ name: `${T}-nobody`, gross: 1000 }]);
    expect(input.accounts.software).toBe(600);
    expect(notes.unmappedAccounts.map((a) => a.code)).toContain(`${T}8`);
    const c = input.clients.find((x) => x.id === clientId)!;
    expect(c.volumes).toEqual([{ serviceCode: `${T}-ORD`, site: "smi", qty: 600 }]);
    expect(notes.unknownTenants.map((t) => t.tenant)).toContain(`${T}-X`);
    const r = runEngine(input);
    const floor = r.pools.find((p) => p.key === "floor_smi")!;
    expect(floor.used).toBe(1200);
    expect(r.clients.find((x) => x.id === clientId)!.orders).toBe(600);
  });
});
