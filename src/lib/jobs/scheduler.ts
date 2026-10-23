import { PgBoss } from "pg-boss";
import { jobsSchema, pgConnectionString } from "@/lib/db-url";

/**
 * Background jobs (pg-boss, in the same PostgreSQL database under its own schema — see jobsSchema()).
 * Started once per server process from src/instrumentation.ts.
 *
 *   xero-sync     — nightly incremental Xero read (05:30 Sydney) + "Sync now" / "Full re-read" buttons
 *   front-tickets — nightly Front ticket counts per client (05:45), current + previous month
 * Later chunks add the Thomax API pull (when Thomax sends the API details) and scheduled report emails.
 */

export const QUEUE_XERO_SYNC = "xero-sync";
export const QUEUE_FRONT_TICKETS = "front-tickets";
const TZ = "Australia/Sydney";

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
  const b = await getBoss();
  await b.createQueue(QUEUE_XERO_SYNC);
  await b.createQueue(QUEUE_FRONT_TICKETS);
  await b.schedule(QUEUE_XERO_SYNC, "30 5 * * *", { kind: "INCREMENTAL" }, { tz: TZ });
  await b.schedule(QUEUE_FRONT_TICKETS, "45 5 * * *", { months: 2 }, { tz: TZ });
  await b.work<{ kind?: "FULL" | "INCREMENTAL"; by?: string }>(QUEUE_XERO_SYNC, async ([job]) => {
    const { getConnection } = await import("@/lib/xero/auth");
    if (!(await getConnection())) return;
    const { runXeroSync } = await import("@/lib/xero/sync");
    const { recordFailure, recordSuccess } = await import("@/lib/integrations/status");
    try {
      await runXeroSync(job.data?.kind ?? "INCREMENTAL", job.data?.by ?? null);
      await recordSuccess("xero");
    } catch (err) {
      await recordFailure("xero", err);
      throw err;
    }
  });
  await b.work<{ months?: number; by?: string }>(QUEUE_FRONT_TICKETS, async ([job]) => {
    const { isFrontConfigured } = await import("@/lib/front/client");
    if (!isFrontConfigured()) return;
    const { syncFrontTickets } = await import("@/lib/front/tickets");
    await syncFrontTickets(job.data?.months ?? 2, job.data?.by ?? null);
  });
  console.log("[jobs] scheduler started");
}

/** Queue a job now (buttons on Data sources). */
export async function enqueue(queue: string, data: object): Promise<string | null> {
  const b = await getBoss();
  return b.send(queue, data, { singletonKey: `${queue}-manual` });
}

/** Stop pg-boss (tests, graceful shutdown). */
export async function stopScheduler(): Promise<void> {
  const b = boss;
  boss = null;
  starting = null;
  if (b) await b.stop({ graceful: false, timeout: 5000 }).catch(() => {});
}
