/** Reports against the test database: client-safe build, the pre-send brake, recipient lists and a blocked send. */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("reports (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let build: typeof import("./build");
  let rec: typeof import("./recipients");
  let send: typeof import("./send");
  const tag = `rp${Date.now()}`;
  let a: { id: string }, b: { id: string };
  const now = new Date("2026-10-22T00:00:00Z");

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    build = await import("./build");
    rec = await import("./recipients");
    send = await import("./send");
    a = await prisma.client.create({ data: { name: `${tag} Alpha`, dyspatchCustomerId: `${tag}A` } });
    b = await prisma.client.create({ data: { name: `${tag} Beta`, dyspatchCustomerId: `${tag}B` } });
    const orders = [
      ...Array.from({ length: 6 }, (_, i) => ({ tenant: `${tag}A`, skus: 1, units: 1, day: 3 + i })),
      ...Array.from({ length: 3 }, (_, i) => ({ tenant: `${tag}A`, skus: 12, units: 40, day: 10 + i })),
      ...Array.from({ length: 4 }, (_, i) => ({ tenant: `${tag}B`, skus: 2, units: 3, day: 5 + i })),
    ];
    await prisma.orderFact.createMany({ data: orders.map((o, i) => ({ source: "THOMAX", orderRef: `${tag}-${i}`, date: new Date(Date.UTC(2026, 8, o.day)), tenant: o.tenant, skus: o.skus, units: o.units })) });
    await prisma.recipient.createMany({
      data: [
        { list: "CLIENT", name: "Alpha Ops", email: `ops@${tag}-alpha.com`, clientId: a.id, createdBy: "test" },
        { list: "CLIENT", name: "Beta Ops", email: `ops@${tag}-beta.com`, clientId: b.id, createdBy: "test" },
        { list: "LENDER", name: "Bank", email: `rm@${tag}-bank.com`, role: "Bank", createdBy: "test" },
      ],
    });
  });
  afterAll(async () => {
    await prisma.orderFact.deleteMany({ where: { orderRef: { startsWith: tag } } });
    await prisma.recipient.deleteMany({ where: { email: { contains: tag } } });
    await prisma.task.deleteMany({ where: { title: { contains: tag } } });
    await prisma.report.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.client.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.$disconnect();
  });

  const spec = (o: Partial<import("./build").ReportSpec> = {}) => ({ name: `${tag} rep`, template: "workload", period: "MONTH", cls: "CLIENT_SAFE", clientId: a.id, forecast: false, costing: "B", ...o });

  it("client-safe workload shows only that client, splits B2C/B2B and passes the brake", async () => {
    const r = await build.buildReport(spec(), { now });
    expect(r.clientsShown).toEqual([`${tag} Alpha`]);
    const k = r.blocks.find((x) => x.kind === "kpis")!;
    expect(k.kind).toBe("kpis");
    if (k.kind !== "kpis") return;
    expect(k.items.map((i) => i.value)).toEqual(["9", "6", "6", "3"]); // total, single-SKU, B2C, B2B (>20 units)
    const b2b = await build.buildReport(spec(), { now, filter: "b2b" });
    const t = b2b.blocks.find((x) => x.kind === "table")!;
    expect(t.kind === "table" && t.rows[0][12]).toMatchObject({ v: "3" }); // all 3 in the 10+ SKU bucket
    expect(await build.scanReport(spec(), r)).toEqual([]);
  });

  it("the brake stops other clients' names, internal words and wrong templates", async () => {
    const r = await build.buildReport(spec({ clientId: null, cls: "INTERNAL" }), { now });
    expect(r.clientsShown).toEqual(expect.arrayContaining([`${tag} Alpha`, `${tag} Beta`]));
    const p = await build.scanReport(spec(), r);
    expect(p.join(" ")).toContain(`${tag} Beta`);
    const leaky = { ...r, clientsShown: [`${tag} Alpha`], blocks: [{ kind: "note" as const, text: "Margin was 22%" }] };
    expect((await build.scanReport(spec(), leaky)).join(" ")).toContain("margin");
    expect((await build.scanReport(spec({ template: "protection" }), leaky)).join(" ")).toContain("can't be sent to a client");
    expect(await build.scanReport(spec({ cls: "EXTERNAL", template: "workload" }), leaky)).toContain("Only Finance reports can go to lenders and advisers.");
  });

  it("recipients: client contacts only for their client, internal domains, lenders after approval", async () => {
    const cs = await rec.checkRecipients({ cls: "CLIENT_SAFE", clientId: a.id, approvedAt: null }, [`ops@${tag}-alpha.com`, `ops@${tag}-beta.com`, "asal@fulfilmentaustralia.com.au", "x@nowhere.com"]);
    expect(cs.map((c) => c.ok)).toEqual([true, false, false, false]);
    expect(cs[1].why).toBe("a different client's contact");
    expect(cs[2].why).toBe("internal — not the client");
    const int = await rec.checkRecipients({ cls: "INTERNAL", clientId: null, approvedAt: null }, ["asal@fulfilmentaustralia.com.au", `ops@${tag}-alpha.com`]);
    expect(int.map((c) => c.ok)).toEqual([true, false]);
    expect((await rec.checkRecipients({ cls: "EXTERNAL", clientId: null, approvedAt: null }, [`rm@${tag}-bank.com`]))[0]).toMatchObject({ ok: false, why: "needs approval first" });
    expect((await rec.checkRecipients({ cls: "EXTERNAL", clientId: null, approvedAt: new Date() }, [`rm@${tag}-bank.com`]))[0].ok).toBe(true);
    expect((await rec.allowedFor({ cls: "CLIENT_SAFE", clientId: a.id })).map((x) => x.email)).toEqual([`ops@${tag}-alpha.com`]);
  });

  it("a send to someone not allowed is blocked, logged and becomes a task — nothing goes out", async () => {
    const r = await prisma.report.create({ data: { ...spec({ name: `${tag} blocked` }), mode: "AUTO", recipients: [`ops@${tag}-beta.com`], createdBy: "test" } });
    const res = await send.sendReport(r.id, { name: "Tester", email: "asal@fulfilmentaustralia.com.au" });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("a different client's contact");
    const log = await prisma.reportSend.findFirstOrThrow({ where: { reportId: r.id } });
    expect(log).toMatchObject({ ok: false, mode: "AUTO" });
    expect(await prisma.task.count({ where: { title: `Report not sent: ${tag} blocked` } })).toBe(1);
  });
});
