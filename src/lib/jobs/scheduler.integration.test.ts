/** Starts the real scheduler against the local DB in an isolated jobs schema. */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;
process.env.PGBOSS_SCHEMA = `jobs_test_${Date.now()}`;

describe.skipIf(!hasDb)("scheduler (integration)", () => {
  let mod: typeof import("./scheduler");

  afterAll(async () => {
    await mod?.stopScheduler();
    const { prisma } = await import("@/lib/db");
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${process.env.PGBOSS_SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("starts pg-boss", async () => {
    mod = await import("./scheduler");
    await mod.startScheduler();
    const boss = await mod.getBoss();
    expect(boss).toBeTruthy();
  });
});
