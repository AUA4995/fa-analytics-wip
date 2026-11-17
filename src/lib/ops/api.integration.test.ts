/** Workforce endpoints (batch 6): /api/v1/workload/daily and /api/v1/inbound over the Thomax copy. */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isTestDatabase } from "@/lib/test-db";

describe.skipIf(!isTestDatabase())("Operations API (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let key = "";
  let keyId = "";
  const req = (url: string) => new Request(url, { headers: { authorization: `Bearer ${key}` } });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const keys = await import("@/lib/apikeys");
    const k = keys.generateKey();
    keyId = (await prisma.apiKey.create({ data: { name: "ops-api-test", prefix: k.prefix, hash: k.hash, scopes: ["volumes:read"], createdBy: "test" } })).id;
    key = k.key;
    await prisma.setting.deleteMany({ where: { key: "ops:config" } });
    await prisma.site.upsert({ where: { key: "smi" }, create: { key: "smi", name: "Smithfield", wmsCodes: ["SYD02"] }, update: { wmsCodes: ["SYD02"] } });
    for (const [name, fields] of [
      ["PCK", ["JobID", "TenantID", "Created", "Shipped", "Wh"]],
      ["RCP", ["RcpID", "TenantID", "Arrived", "Received", "Wh"]],
      ["RCPE", ["AsnID", "TenantID", "Eta", "Wh"]],
    ] as const) {
      await prisma.thomaxTable.upsert({ where: { name }, create: { name, fields: [...fields] }, update: { fields: [...fields] } });
      await prisma.thomaxRow.deleteMany({ where: { table: name } });
    }
    await prisma.thomaxRow.createMany({
      data: [
        { table: "PCK", key: "1", hash: "1", data: { JobID: 1, TenantID: "T1", Created: "2026-11-16T09:00:00", Shipped: "2026-11-16T12:00:00", Wh: "SYD02" } },
        { table: "PCK", key: "2", hash: "2", data: { JobID: 2, TenantID: "T1", Created: "2026-11-17T09:00:00", Shipped: null, Wh: "SYD01" } },
        { table: "RCP", key: "1", hash: "1", data: { RcpID: 1, TenantID: "T1", Arrived: "2026-11-16T08:00:00", Received: "2026-11-17T08:00:00", Wh: "SYD02" } },
        { table: "RCPE", key: "1", hash: "1", data: { AsnID: 1, TenantID: "T1", Eta: "2026-11-18T00:00:00", Wh: "SYD02" } },
      ],
    });
  });
  afterAll(async () => {
    await prisma.thomaxRow.deleteMany({ where: { table: { in: ["PCK", "RCP", "RCPE"] } } });
    await prisma.setting.deleteMany({ where: { key: "ops:config" } });
    await prisma.apiKey.deleteMany({ where: { id: keyId } });
    await prisma.$disconnect();
  });

  it("409 until Operations → Setup is done; 400 on bad dates or too long a range", async () => {
    const { GET } = await import("@/app/api/v1/workload/daily/route");
    expect((await GET(req("http://x/api/v1/workload/daily?from=2026-11-16&to=2026-11-17"))).status).toBe(409);
    expect((await GET(req("http://x/api/v1/workload/daily?from=2026-02-31&to=2026-11-17"))).status).toBe(400);
    expect((await GET(req("http://x/api/v1/workload/daily?from=2026-01-01&to=2026-11-17"))).status).toBe(400);
  });

  it("orders per day, site filter by warehouse codes; inbound with wall-clock times", async () => {
    const { saveOpsConfig } = await import("./config");
    await saveOpsConfig({
      flows: {
        dispatch: { table: "PCK", roles: { tenant: "TenantID", created: "Created", done: "Shipped", warehouse: "Wh" } },
        receiving: { table: "RCP", roles: { tenant: "TenantID", created: "Arrived", done: "Received", warehouse: "Wh" } },
        expected: { table: "RCPE", roles: { tenant: "TenantID", created: "Eta", warehouse: "Wh" } },
      },
      b2bValues: "",
      cutoffHour: "14",
      b2bExtraDays: "2",
      receivingHours: "48",
      holidays: "",
    });
    const daily = await (await import("@/app/api/v1/workload/daily/route")).GET(req("http://x/api/v1/workload/daily?from=2026-11-16&to=2026-11-17"));
    expect(daily.status).toBe(200);
    expect((await daily.json()).days).toEqual([
      { date: "2026-11-16", tenant: "T1", client: null, orders: 1 },
      { date: "2026-11-17", tenant: "T1", client: null, orders: 1 },
    ]);
    const smi = await (await import("@/app/api/v1/workload/daily/route")).GET(req("http://x/api/v1/workload/daily?from=2026-11-16&to=2026-11-17&site=smi"));
    expect((await smi.json()).days).toHaveLength(1);
    expect((await (await import("@/app/api/v1/workload/daily/route")).GET(req("http://x/api/v1/workload/daily?from=2026-11-16&to=2026-11-17&site=nope"))).status).toBe(400);
    const inb = await (await import("@/app/api/v1/inbound/route")).GET(req("http://x/api/v1/inbound?from=2026-11-16&to=2026-11-18"));
    const body = await inb.json();
    expect(body.receipts[0]).toMatchObject({ arrivedAt: "2026-11-16T08:00:00", receivedAt: "2026-11-17T08:00:00" });
    expect(body.expected[0]).toMatchObject({ expectedAt: "2026-11-18T00:00:00" });
  });
});
