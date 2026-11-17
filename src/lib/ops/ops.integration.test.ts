import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { isTestDatabase } from "@/lib/test-db";
import { getOpsConfig, saveOpsConfig } from "./config";
import { dailyCounts, loadFlow } from "./load";
import { slaView } from "./views";

const run = isTestDatabase(process.env.DATABASE_URL) ? describe : describe.skip;
const w = (s: string) => new Date(`${s}Z`);

run("Operations over the Thomax copy", () => {
  const rows = [
    { JobID: "1", TenantID: "T1", Created: "2026-11-17T09:00:00", Shipped: "2026-11-17T16:00:00", OrderNo: "A1", Kind: "B2C", Wh: "SYD02" },
    { JobID: "2", TenantID: "T1", Created: "2026-11-17T15:00:00", Shipped: null, OrderNo: "A2", Kind: "B2C", Wh: "SYD02" },
    { JobID: "3", TenantID: "T2", Created: "2026-11-16T10:00:00", Shipped: "2026-11-17T10:00:00", OrderNo: "B1", Kind: "B2B", Wh: "SYD01" },
    { JobID: "4", TenantID: "T2", Created: "/Date(1794873600000)/", Shipped: "bad date", OrderNo: "B2", Kind: "B2C", Wh: "syd01" },
  ];

  beforeAll(async () => {
    await prisma.thomaxTable.upsert({ where: { name: "PCK" }, create: { name: "PCK", fields: Object.keys(rows[0]) }, update: { fields: Object.keys(rows[0]) } });
    await prisma.thomaxRow.deleteMany({ where: { table: "PCK" } });
    for (const r of rows) await prisma.thomaxRow.create({ data: { table: "PCK", key: r.JobID, data: r, hash: r.JobID } });
  });
  afterAll(async () => {
    await prisma.thomaxRow.deleteMany({ where: { table: "PCK" } });
    await prisma.setting.deleteMany({ where: { key: "ops:config" } });
  });

  it("rejects fields Explore didn't find", async () => {
    await expect(
      saveOpsConfig({
        flows: { dispatch: { table: "PCK", roles: { tenant: "Nope" } }, receiving: { table: "RCP", roles: {} }, expected: { table: "RCPE", roles: {} } },
        b2bValues: "",
        cutoffHour: "14",
        b2bExtraDays: "2",
        receivingHours: "48",
        holidays: "",
      }),
    ).rejects.toThrow(/isn't a field of PCK/);
  });

  it("loads rows by wall-clock window, with filters, and computes SLA", async () => {
    await saveOpsConfig({
      flows: {
        dispatch: { table: "PCK", roles: { tenant: "TenantID", created: "Created", done: "Shipped", ref: "OrderNo", type: "Kind", warehouse: "Wh" } },
        receiving: { table: "RCP", roles: {} },
        expected: { table: "RCPE", roles: {} },
      },
      b2bValues: "b2b",
      cutoffHour: "14",
      b2bExtraDays: "2",
      receivingHours: "48",
      holidays: "",
    });
    const cfg = await getOpsConfig();
    const all = await loadFlow(cfg.flows.dispatch, w("2026-11-16T00:00:00"), w("2026-11-18T00:00:00"));
    expect(all.rows.map((r) => r.ref).sort()).toEqual(["A1", "A2", "B1", "B2"]);
    const b2 = all.rows.find((r) => r.ref === "B2")!;
    expect(b2.created.toISOString()).toBe("2026-11-17T00:00:00.000Z"); // /Date()/ is UTC ms
    expect(b2.done).toBeNull(); // unreadable date → not done
    const t1 = await loadFlow(cfg.flows.dispatch, w("2026-11-16T00:00:00"), w("2026-11-18T00:00:00"), { tenants: ["T1"] });
    expect(t1.rows).toHaveLength(2);
    const syd01 = await loadFlow(cfg.flows.dispatch, w("2026-11-16T00:00:00"), w("2026-11-18T00:00:00"), { warehouses: ["SYD01"] });
    expect(syd01.rows.map((r) => r.ref).sort()).toEqual(["B1", "B2"]); // case-insensitive warehouse

    const v = await slaView(cfg, w("2026-11-16T00:00:00"), w("2026-11-18T00:00:00"), {}, w("2026-11-19T12:00:00"));
    // A1 met (same day); A2 after cut-off → due end of 18/11, not shipped by 19/11 → overdue;
    // B1 B2B (Mon) → due end of Wed 18/11, shipped 17/11 → met; B2 due end of 17/11, ship date unreadable → overdue
    expect(v.dispatch.total).toMatchObject({ total: 4, met: 2, overdue: 2, late: 0 });
    expect(v.receiving.ready).toBe(false);
    const counts = await dailyCounts(cfg.flows.dispatch, w("2026-11-16T00:00:00"), w("2026-11-18T00:00:00"));
    expect(counts).toEqual([
      { day: "2026-11-16", tenant: "T2", n: 1 },
      { day: "2026-11-17", tenant: "T1", n: 2 },
      { day: "2026-11-17", tenant: "T2", n: 1 },
    ]);
  });
});
