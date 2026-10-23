import { PgBoss } from "pg-boss";
import { jobsSchema, pgConnectionString } from "@/lib/db-url";

/**
 * Background jobs (pg-boss, in the same PostgreSQL database under its own schema — see jobsSchema()).
 * Started once per server process from src/instrumentation.ts.
 *
 * Queues are added with the chunks that need them: nightly Xero / WMS / Front syncs (Data sources, chunk 3),
 * the Thomax history backfill (chunk 3) and scheduled report emails (chunk 6).
 */

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  if (starting) return starting;
  starting = (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const b = new PgBoss({ connectionString: pgConnectionString(url), schema: jobsSchema(url) });
    b.on("error", (err) => console.error("[jobs] pg-boss error:", err));
    await b.start();
    boss = b;
    return b;
  })();
  return starting;
}

export async function startScheduler(): Promise<void> {
  if (process.env.JOBS_DISABLED === "1") {
    console.log("[jobs] disabled by JOBS_DISABLED=1");
    return;
  }
  await getBoss();
  console.log("[jobs] scheduler started");
}

/** Stop pg-boss (tests, graceful shutdown). */
export async function stopScheduler(): Promise<void> {
  const b = boss;
  boss = null;
  starting = null;
  if (b) await b.stop({ graceful: false, timeout: 5000 }).catch(() => {});
}
