/** Starts the real scheduler against the local DB in an isolated jobs schema. */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { isTestDatabase } from "@/lib/test-db";

const hasDb = isTestDatabase();
process.env.PGBOSS_SCHEMA = `jobs_test_${Date.now()}`;

describe.skipIf(!hasDb)("scheduler (integration)", () => {
  let mod: typeof import("./scheduler");

  afterAll(async () => {
    await mod?.stopScheduler();
    const { prisma } = await import("@/lib/db");
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${process.env.PGBOSS_SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("starts pg-boss and schedules the nightly Xero and Front reads", async () => {
    mod = await import("./scheduler");
    await mod.startScheduler();
    const boss = await mod.getBoss();
    const xero = await boss.getSchedules(mod.QUEUE_XERO_SYNC);
    expect(xero).toHaveLength(1);
    expect(xero[0].cron).toBe("30 5 * * *");
    expect(xero[0].timezone).toBe("Australia/Sydney");
    expect(await boss.getSchedules(mod.QUEUE_FRONT_TICKETS)).toHaveLength(1);
  });
});
