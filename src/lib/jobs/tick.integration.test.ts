/** Vercel cron tick (batch 7): slots run once, buttons are taken once, nothing runs twice when ticks overlap. */
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isTestDatabase } from "@/lib/test-db";

const calls: string[] = [];
vi.mock("./work", () => ({
  doXeroSync: vi.fn(async (d: { kind?: string }) => (calls.push(`xero:${d.kind ?? "INCREMENTAL"}`), "ok")),
  doFrontTickets: vi.fn(async () => (calls.push("front"), "ok")),
  doReportTick: vi.fn(async () => (calls.push("reports"), "ok")),
}));
vi.mock("@/lib/thomax/sync", () => ({ getCreds: vi.fn(async () => null), historyRemaining: vi.fn(), historyStep: vi.fn(), nightly: vi.fn() }));

describe.skipIf(!isTestDatabase())("cron tick (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let t: typeof import("./tick");
  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    t = await import("./tick");
  });
  beforeEach(async () => {
    calls.length = 0;
    await prisma.setting.deleteMany({ where: { key: { startsWith: "cron:" } } });
  });
  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: { startsWith: "cron:" } } });
    await prisma.$disconnect();
  });

  it("before 05:30 Sydney only the hourly reports run; after, Xero and Front once a day", async () => {
    await t.runTick({ now: new Date("2026-11-19T17:10:00Z") }); // 04:10 Sydney (AEDT)
    expect(calls).toEqual(["reports"]);
    calls.length = 0;
    await t.runTick({ now: new Date("2026-11-19T18:50:00Z") }); // 05:50
    expect(calls).toEqual(["xero:INCREMENTAL", "front", "reports"]);
    calls.length = 0;
    await t.runTick({ now: new Date("2026-11-19T18:55:00Z") }); // 05:55, same hour, same day
    expect(calls).toEqual([]);
  });

  it("two overlapping ticks never run the same slot", async () => {
    const now = new Date("2026-11-19T18:50:00Z");
    await Promise.all([t.runTick({ now }), t.runTick({ now })]);
    expect(calls.filter((c) => c.startsWith("xero")).length).toBe(1);
    expect(calls.filter((c) => c === "reports").length).toBe(1);
  });

  it("a button press is picked up by the next tick, once", async () => {
    const { enqueue, QUEUE_XERO_SYNC } = await import("./scheduler");
    process.env.JOBS_RUNNER = "cron";
    await enqueue(QUEUE_XERO_SYNC, { kind: "FULL", by: "Asal" });
    delete process.env.JOBS_RUNNER;
    await t.runTick({ now: new Date("2026-11-19T17:10:00Z") });
    await t.runTick({ now: new Date("2026-11-19T17:15:00Z") });
    expect(calls.filter((c) => c === "xero:FULL")).toHaveLength(1);
  });

  it("stops starting work when the time is nearly up", async () => {
    await t.runTick({ now: new Date("2026-11-19T18:50:00Z"), maxMs: 61_000 });
    expect(calls).toEqual([]);
  });
});
