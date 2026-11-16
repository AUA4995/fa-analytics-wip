import { PgBoss } from "pg-boss";
import { jobsSchema, pgConnectionString } from "@/lib/db-url";

/**
 * Background jobs (pg-boss, in the same PostgreSQL database under its own schema — see jobsSchema()).
 * Started once per server process from src/instrumentation.ts.
 *
 *   xero-sync     — nightly incremental Xero read (05:30 Sydney) + "Sync now" / "Full re-read" buttons
 *   front-tickets — nightly Front ticket counts per client (05:45), current + previous month
 *   report-tick   — hourly: scheduled report emails that are due (Sydney day + send time), once per day each
 *   thomax-nightly — 02:15 Sydney: master tables in full + the last N days of transactional tables
 *   thomax-history — the history load, one step (a few month windows) at a time, re-queued until done;
 *                    runs only 20:00–06:00 Sydney so it doesn't slow Thomax for Power BI / daily emails
 */

export const QUEUE_XERO_SYNC = "xero-sync";
export const QUEUE_FRONT_TICKETS = "front-tickets";
export const QUEUE_REPORT_TICK = "report-tick";
export const QUEUE_THOMAX_NIGHTLY = "thomax-nightly";
export const QUEUE_THOMAX_HISTORY = "thomax-history";
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
  await b.createQueue(QUEUE_REPORT_TICK);
  await b.schedule(QUEUE_XERO_SYNC, "30 5 * * *", { kind: "INCREMENTAL" }, { tz: TZ });
  await b.schedule(QUEUE_FRONT_TICKETS, "45 5 * * *", { months: 2 }, { tz: TZ });
  await b.schedule(QUEUE_REPORT_TICK, "5 * * * *", {}, { tz: TZ });
  // Long, one-at-a-time jobs: up to 5 hours, no automatic retry (a retry would only repeat the load on Thomax)
  await b.createQueue(QUEUE_THOMAX_NIGHTLY, { policy: "singleton", expireInSeconds: 5 * 3600, retryLimit: 0 });
  await b.createQueue(QUEUE_THOMAX_HISTORY, { policy: "singleton", expireInSeconds: 5 * 3600, retryLimit: 0 });
  await b.schedule(QUEUE_THOMAX_NIGHTLY, "15 2 * * *", {}, { tz: TZ });
  // Picks the history load up again each evening (a no-op once it's done).
  await b.schedule(QUEUE_THOMAX_HISTORY, "5 20 * * *", {}, { tz: TZ });
  // A laptop that was off at 02:15: catch the nightly copy up shortly after the app starts
  void (async () => {
    const { getCreds, nightlyMissed } = await import("@/lib/thomax/sync");
    if ((await getCreds()) && (await nightlyMissed(new Date()))) await b.send(QUEUE_THOMAX_NIGHTLY, {}, { startAfter: 300, singletonKey: "thomax-nightly-catchup" });
  })().catch((err) => console.error("[jobs] Thomax catch-up check failed:", err));
  await b.work<{ kind?: "FULL" | "INCREMENTAL"; by?: string }>(QUEUE_XERO_SYNC, async ([job]) => {
    const { getConnection } = await import("@/lib/xero/auth");
    if (!(await getConnection())) return;
    const { runXeroSync } = await import("@/lib/xero/sync");
    const { recordFailure, recordSuccess } = await import("@/lib/integrations/status");
    try {
      await runXeroSync(job.data?.kind ?? "INCREMENTAL", job.data?.by ?? null);
      await recordSuccess("xero");
      await (await import("./after-sync")).afterSync(job.data?.by ?? null);
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
    // Batch 3: weighted ticket scores for the last 2 full weeks (or more when recounting history)
    const { syncTicketScores } = await import("@/lib/tickets/sync");
    await syncTicketScores(job.data?.months && job.data.months > 2 ? Math.min(104, Math.round(job.data.months * 4.35)) : 2, job.data?.by ?? null);
  });
  await b.work(QUEUE_REPORT_TICK, async () => {
    const { runReportTick } = await import("@/lib/reports/send");
    await runReportTick();
  });
  await b.work(QUEUE_THOMAX_NIGHTLY, async ([job]) => {
    const { getCreds, nightly } = await import("@/lib/thomax/sync");
    if (!(await getCreds())) return;
    const r = await nightly(new Date(), { signal: job.signal });
    // A history step was running: try again in 2 minutes (history steps give way to the nightly, see below)
    if (r.busy) await b.send(QUEUE_THOMAX_NIGHTLY, {}, { startAfter: 120 });
  });
  await b.work<{ anyTime?: boolean }>(QUEUE_THOMAX_HISTORY, async ([job]) => {
    const { getCreds, historyStep, nightlyDueNow } = await import("@/lib/thomax/sync");
    if (!(await getCreds())) return;
    const anyTime = !!job.data?.anyTime;
    const { thomaxWindowOpen } = await import("@/lib/thomax/window");
    if (!anyTime && !thomaxWindowOpen(new Date())) return; // tonight's 20:05 run picks it up
    // Give way to the nightly copy (02:15) so master tables and recent changes are read every night
    if (await nightlyDueNow(new Date())) {
      await b.send(QUEUE_THOMAX_HISTORY, { anyTime }, { startAfter: 600 });
      return;
    }
    const r = await historyStep(6, new Date(), { signal: job.signal });
    // Next step when this one made progress, or try again shortly when another copy was running.
    // "Keep loading now" (anyTime) carries on during the day; otherwise only in the 20:00–06:00 window.
    if (r.remaining > 0 && ((r.windows > 0 && !r.stopped) || r.busy)) await b.send(QUEUE_THOMAX_HISTORY, { anyTime }, { startAfter: r.busy ? 120 : 30 });
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
