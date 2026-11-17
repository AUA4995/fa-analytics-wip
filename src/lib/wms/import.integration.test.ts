/** WMS file import against the test database: plan → apply → duplicate file → overlap replace / keep. */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isTestDatabase } from "@/lib/test-db";

const hasDb = isTestDatabase();

describe.skipIf(!hasDb)("WMS import (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let w: typeof import("./import");
  const T = `TST${Date.now() % 100000}`;
  const ids: string[] = [];
  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    w = await import("./import");
  });
  afterAll(async () => {
    for (const id of ids) await w.deleteWmsImport(id);
    await prisma.sourceRun.deleteMany({ where: { startedBy: "Test" } });
    await prisma.$disconnect();
  });

  it("one column can't be picked for two fields", async () => {
    const csv = `Charge Date,Tenant ID,Charge Code,Qty\n01/09/2026,${T},PICK,5\n`;
    const m = { ...w.guessMapping("CHARGES", ["Charge Date", "Tenant ID", "Charge Code", "Qty"]) };
    m.wmsCode = m.tenant;
    const p = await w.planWmsImport("THOMAX", "CHARGES", csv, m);
    expect(p.errors.some((e) => /Column 2 is picked for/.test(e.message))).toBe(true);
  });

  it("charges: sums per day / tenant / code, blocks the same file twice, replaces on overlap", async () => {
    const csv = `Charge Date,Tenant ID,Charge Code,Qty\n01/09/2026,${T},PICK,5\n01/09/2026,${T},PICK,3\n02/09/2026,${T},ORDER FEE,4\n`;
    const m = w.guessMapping("CHARGES", ["Charge Date", "Tenant ID", "Charge Code", "Qty"]);
    const p = await w.planWmsImport("THOMAX", "CHARGES", csv, m);
    expect(p.errors).toEqual([]);
    expect(p.charges).toHaveLength(2);
    expect(p.charges.find((c) => c.wmsCode === "PICK")?.quantity).toBe(8);
    expect(p.tenants[0]).toMatchObject({ tenant: T, client: null });
    const r = await w.applyWmsImport(p, { fileName: "a.csv", mapping: m, onOverlap: "replace", uploadedBy: "Test" });
    ids.push(r.importId);
    expect(r.inserted).toBe(2);
    expect((await w.planWmsImport("THOMAX", "CHARGES", csv, m)).duplicateFile).toBe(true);
    const csv2 = `Charge Date,Tenant ID,Charge Code,Qty\n01/09/2026,${T},PICK,10\n`;
    const p2 = await w.planWmsImport("THOMAX", "CHARGES", csv2, m);
    expect(p2.overlap).toBe(1);
    const r2 = await w.applyWmsImport(p2, { fileName: "b.csv", mapping: m, onOverlap: "replace", uploadedBy: "Test" });
    ids.push(r2.importId);
    expect(r2.replaced).toBe(1);
    const lines = await prisma.volumeLine.findMany({ where: { tenant: T } });
    expect(lines.map((l) => [l.wmsCode, Number(l.quantity)]).sort()).toEqual([["ORDER FEE", 4], ["PICK", 10]]);
  });

  it("orders from a line-level file: distinct SKUs and summed units; bad dates block saving", async () => {
    const csv = `Order Number,Dispatch Date,Client,SKU,Quantity\nSO-1,03/09/2026,${T},A,2\nSO-1,03/09/2026,${T},B,1\nSO-1,03/09/2026,${T},A,1\nSO-2,03/09/2026,${T},C,30\n`;
    const m = w.guessMapping("ORDERS", ["Order Number", "Dispatch Date", "Client", "SKU", "Quantity"]);
    const p = await w.planWmsImport("P3L", "ORDERS", csv, m);
    expect(p.orders.find((o) => o.orderRef === "SO-1")).toMatchObject({ skus: 2, units: 4 });
    expect(p.orders.find((o) => o.orderRef === "SO-2")).toMatchObject({ skus: 1, units: 30 });
    const r = await w.applyWmsImport(p, { fileName: "o.csv", mapping: m, onOverlap: "keep", uploadedBy: "Test" });
    ids.push(r.importId);
    expect(r.inserted).toBe(2);
    const bad = await w.planWmsImport("P3L", "ORDERS", `Order Number,Dispatch Date,Client,SKU,Quantity\nSO-9,31/02/2026,${T},A,1\n`, m);
    expect(bad.errors[0].message).toMatch(/not understood/);
    await expect(w.applyWmsImport(bad, { fileName: null, mapping: m, onOverlap: "keep", uploadedBy: "Test" })).rejects.toThrow();
  });
});
