import { describe, expect, it } from "vitest";
import { runEngine, type EngineInput } from "./engine";

/** A small FA: one site, one CSR pool, admin, rent, CMC; two clients. Numbers chosen to check by hand. */
function input(over: Partial<EngineInput> = {}): EngineInput {
  return {
    month: "2026-09",
    days: 28, // 4 weeks
    rules: { superRate: 0.12, payrollTaxRate: 0.05, workersCompRate: 0.02, csrUtil: 0.8, b2bUnits: 20 },
    sites: [{ key: "smi", name: "Smithfield", labourUtil: 0.8, palletPositions: 100, spaceUtil: 0.9, notionalRent: null, owned: false }],
    pools: [
      { key: "floor_smi", name: "Floor · Smithfield", kind: "LABOUR", site: "smi", driver: "MINUTES", capacity: null },
      { key: "csr", name: "CSR", kind: "LABOUR", site: null, driver: "MINUTES", capacity: null },
      { key: "admin", name: "Admin", kind: "OVERHEAD", site: null, driver: "LABOUR_MINUTES", capacity: null },
      { key: "rent_smi", name: "Rent · Smithfield", kind: "OVERHEAD", site: "smi", driver: "PALLET_WEEKS", capacity: null },
      { key: "automation_cmc", name: "CMC", kind: "OVERHEAD", site: null, driver: "MACHINE_ORDERS", capacity: 1000 },
    ],
    // floor: gross 10,000 + super 1,200 + tax 500 + wc 200 = 11,900 for 100 h → practical 100×60×0.8 = 4,800 min
    labour: { floor_smi: { gross: 10000, super: 1200, hours: 100, people: 2 }, csr: { gross: 0, super: 0, hours: 0, people: 0 } },
    accounts: { admin: 960, rent_smi: 4000, automation_cmc: 2000 },
    services: [
      { code: "ORD", name: "Order fee", unit: "order", poolKind: "floor", minutes: 1, overheads: {}, billable: true, role: "ORDER" },
      { code: "PICK", name: "Pick per unit", unit: "unit", poolKind: "floor", minutes: 0.5, overheads: {}, billable: true, role: null },
      { code: "STO", name: "Storage", unit: "pallet-week", poolKind: null, minutes: null, overheads: { "rent_{site}": 1 }, billable: true, role: null },
      { code: "PACK-M", name: "Packing manual", unit: "order", poolKind: "floor", minutes: 2, overheads: {}, billable: false, role: "PACK_MANUAL" },
      { code: "PACK-C", name: "Packing CMC", unit: "order", poolKind: "floor", minutes: 0.5, overheads: {}, billable: false, role: "PACK_CMC" },
    ],
    clients: [
      { id: "a", name: "Client A", sites: ["smi"], cmcShare: 0.5, revenue: 9000, orders: null, volumes: [{ serviceCode: "ORD", site: "smi", qty: 800 }, { serviceCode: "PICK", site: "smi", qty: 1600 }, { serviceCode: "STO", site: "smi", qty: 200 }], rates: { ORD: 2.5, PICK: 0.5, STO: 10 } },
      { id: "b", name: "Client B", sites: ["smi"], cmcShare: 0, revenue: null, orders: null, volumes: [{ serviceCode: "ORD", site: "smi", qty: 200 }, { serviceCode: "PICK", site: "smi", qty: 200 }], rates: {} },
    ],
    orderSizes: [
      { units: 1, orders: 600 },
      { units: 3, orders: 380 },
      { units: 25, orders: 20 },
    ],
    ...over,
  };
}

describe("cost engine", () => {
  const r = runEngine(input());
  const pool = (k: string) => r.pools.find((p) => p.key === k)!;

  it("labour pool = gross + super + payroll tax + workers comp; practical = paid hours × 60 × utilisation", () => {
    expect(pool("floor_smi").cost).toBe(11900);
    expect(pool("floor_smi").practical).toBe(4800);
    expect(pool("floor_smi").rateT).toBeCloseTo(11900 / 4800, 6);
  });

  it("activity minutes include packing by method share; Full absorption spreads cost over minutes used", () => {
    // A: 800 orders ×1 + 1600 picks ×0.5 + packing 400 CMC ×0.5 + 400 manual ×2 = 800+800+200+800 = 2600
    // B: 200 + 100 + 200 manual ×2 = 700 → used 3300 of 4800
    expect(pool("floor_smi").used).toBe(3300);
    expect(pool("floor_smi").rateF).toBeCloseTo(11900 / 3300, 6);
    expect(pool("floor_smi").unused).toBeCloseTo(11900 - 3300 * (11900 / 4800), 1);
  });

  it("admin per labour minute; rent per pallet-week on practical space (TDABC) and measured use (Full)", () => {
    expect(pool("admin").used).toBe(3300);
    expect(pool("admin").rateT).toBeCloseTo(960 / 3300, 6);
    expect(pool("rent_smi").practical).toBe(400); // 100 positions × 4 weeks
    expect(pool("rent_smi").used).toBe(200);
    expect(pool("rent_smi").rateT).toBe(10);
    expect(pool("rent_smi").rateF).toBe(20);
  });

  it("machine with a capacity: CMC orders = orders × CMC share; unused shown", () => {
    expect(pool("automation_cmc").used).toBe(400);
    expect(pool("automation_cmc").rateT).toBe(2);
    expect(pool("automation_cmc").rateF).toBe(5);
    expect(pool("automation_cmc").unused).toBe(1200);
  });

  it("unit cost of a service = labour minutes × cpm + admin share (+ machine per CMC-packed order)", () => {
    const pick = r.unit("PICK", "T", "smi");
    expect(pick.total).toBeCloseTo(0.5 * (11900 / 4800) + 0.5 * (960 / 3300), 6);
    expect(pick.parts.map((p) => p.ref)).toEqual(["pool:floor_smi", "pool:admin"]);
    const cmc = r.unit("PACK-C", "T", "smi");
    expect(cmc.parts.some((p) => p.ref === "pool:automation_cmc")).toBe(true);
  });

  it("client cost includes packing; margin against Xero revenue; cost per order", () => {
    const a = r.clients.find((c) => c.id === "a")!;
    expect(a.orders).toBe(800);
    expect(a.lines.map((l) => l.code).sort()).toEqual(["ORD", "PACK-C", "PACK-M", "PICK", "STO"]);
    expect(a.lines.find((l) => l.code === "STO")!.costT).toBeCloseTo(2000, 6);
    expect(a.marginT).toBeCloseTo((9000 - a.costT) / 9000, 6);
    expect(a.cpoT).toBeCloseTo(a.costT / 800, 6);
    expect(a.expected).toBeCloseTo(800 * 2.5 + 1600 * 0.5 + 200 * 10, 6);
    const b = r.clients.find((c) => c.id === "b")!;
    expect(b.marginBasis).toBeNull();
    expect(a.marginBasis).toBe("xero");
    expect(a.lines.find((l) => l.code === "PICK")!.marginPctT).toBeCloseTo((0.5 - a.lines.find((l) => l.code === "PICK")!.unitT) / 0.5, 6);
  });

  it("without Xero revenue, margin compares only the rated services with their own cost", () => {
    const i = input();
    i.clients[1] = { ...i.clients[1], rates: { ORD: 3 } };
    const b = runEngine(i).clients.find((c) => c.id === "b")!;
    const ord = b.lines.find((l) => l.code === "ORD")!;
    expect(b.marginBasis).toBe("rated");
    expect(b.expected).toBe(600);
    expect(b.marginT).toBeCloseTo((600 - ord.costT) / 600, 6);
  });

  it("TDABC + unused capacity ≈ Full absorption for capacity pools", () => {
    const full = r.clients.reduce((x, c) => x + c.costF, 0);
    const tdabc = r.clients.reduce((x, c) => x + c.costT, 0);
    expect(tdabc).toBeLessThan(full);
    // rent is spread fully under Full (200 pallet-weeks used × $20 = $4,000)
    expect(r.clients.find((c) => c.id === "a")!.lines.find((l) => l.code === "STO")!.costF).toBeCloseTo(4000, 6);
  });

  it("B2B = more than 20 units; cost per order grows with units", () => {
    expect(r.base.T.b2c.orders).toBe(980);
    expect(r.base.T.b2b.orders).toBe(20);
    expect(r.base.T.b2b.cpo!).toBeGreaterThan(r.base.T.b2c.cpo!);
  });

  it("warns instead of inventing: no workers comp, no minutes, no orders file", () => {
    const w = runEngine(input({ rules: { superRate: 0.12, payrollTaxRate: 0.05, workersCompRate: null, csrUtil: 0.8, b2bUnits: 20 }, orderSizes: [] })).warnings.join(" ");
    expect(w).toMatch(/Workers comp/);
    expect(w).toMatch(/No WMS orders file/);
    const noOrders = runEngine(input({ orderSizes: [] }));
    expect(noOrders.base.T.all.orders).toBe(1000);
    expect(noOrders.base.T.all.unitsPerOrder).toBeCloseTo(1.8, 6);
    expect(noOrders.base.T.b2c.cpo).toBeNull();
    const noMin = input();
    noMin.services[1] = { ...noMin.services[1], minutes: null };
    expect(runEngine(noMin).warnings.join(" ")).toMatch(/No standard minutes yet for PICK/);
  });

  it("batch 3 — rent by space type: bins and bays add pallet-equivalents to capacity once their size is set", () => {
    const base = input();
    const noSize = runEngine({ ...base, sites: [{ ...base.sites[0], binPositions: 400, bayPositions: 10 }] });
    expect(noSize.pools.find((p) => p.key === "rent_smi")!.practical).toBe(100 * 4);
    expect(noSize.warnings.some((w) => /400 bins aren't in rent capacity/.test(w))).toBe(true);
    const sized = runEngine({ ...base, rules: { ...base.rules, binSize: 0.1, baySize: 5 }, sites: [{ ...base.sites[0], binPositions: 400, bayPositions: 10 }] });
    // (100 pallets + 400 × 0.1 + 10 × 5) × 4 weeks = 190 × 4
    expect(sized.pools.find((p) => p.key === "rent_smi")!.practical).toBe(760);
    expect(sized.warnings.some((w) => /bins aren't/.test(w))).toBe(false);
  });

  it("batch 3 — office split: support spread by weighted ticket share, accounts by invoices + accounts tickets", () => {
    const base = input();
    const r3 = runEngine({
      ...base,
      rules: { ...base.rules, accountsInvoiceShare: 0.5 },
      pools: [...base.pools, { key: "support", name: "Support", kind: "OVERHEAD", site: null, driver: "TICKET_SCORE", capacity: null }, { key: "accounts", name: "Accounts", kind: "OVERHEAD", site: null, driver: "INVOICES_TICKETS", capacity: null }],
      accounts: { ...base.accounts, support: 1000, accounts: 600 },
      clients: [
        { ...base.clients[0], supportScore: 30, accountsScore: 0, invoices: 3 },
        { ...base.clients[1], supportScore: 10, accountsScore: 8, invoices: 1 },
      ],
    });
    const a = r3.clients.find((c) => c.id === "a")!;
    const b = r3.clients.find((c) => c.id === "b")!;
    const line = (c: typeof a, k: string) => c.lines.find((l) => l.code === `pool:${k}`)?.costT ?? 0;
    expect(line(a, "support")).toBeCloseTo(750, 6); // 30 ÷ 40
    expect(line(b, "support")).toBeCloseTo(250, 6);
    // accounts: A = 0.5 × 3/4 + 0.5 × 0/8 = 0.375 → 225; B = 0.5 × 1/4 + 0.5 × 8/8 = 0.625 → 375
    expect(line(a, "accounts")).toBeCloseTo(225, 6);
    expect(line(b, "accounts")).toBeCloseTo(375, 6);
    // all of each pool is spread, nothing left as unused capacity
    expect(line(a, "support") + line(b, "support")).toBeCloseTo(1000, 6);
    expect(r3.pools.find((p) => p.key === "support")!.unused).toBe(0);
  });

  it("batch 3 — a labour pool spread by ticket score takes no activity minutes (no double count)", () => {
    const base = input();
    const r4 = runEngine({
      ...base,
      pools: base.pools.map((p) => (p.key === "csr" ? { ...p, driver: "TICKET_SCORE" } : p)),
      labour: { ...base.labour, csr: { gross: 2000, super: 240, hours: 40, people: 1 } },
      services: [...base.services, { code: "CALL", name: "Client call", unit: "call", poolKind: "csr", minutes: 10, overheads: {}, billable: false, role: null }],
      clients: [{ ...base.clients[0], volumes: [...base.clients[0].volumes, { serviceCode: "CALL", site: "smi", qty: 5 }], supportScore: 1 }, base.clients[1]],
    });
    const call = r4.clients.find((c) => c.id === "a")!.lines.find((l) => l.code === "CALL")!;
    expect(call.partsT.some((p) => p.ref === "pool:csr")).toBe(false);
    const csrLine = r4.clients.find((c) => c.id === "a")!.lines.find((l) => l.code === "pool:csr")!;
    expect(csrLine.costT).toBeCloseTo(r4.pools.find((p) => p.key === "csr")!.cost, 6);
    expect(r4.warnings.some((w) => /no weighted ticket scores/.test(w))).toBe(false);
  });
});
