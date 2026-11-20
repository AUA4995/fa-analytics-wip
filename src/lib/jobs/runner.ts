/**
 * How background jobs run (batch 7, same design as the Accounts Hub):
 *
 *   pg-boss  — default on the laptop / a server: a long-running Next.js process starts pg-boss from instrumentation.ts
 *              and its workers run the schedules (src/lib/jobs/scheduler.ts).
 *   cron     — on Vercel (env VERCEL is set) or with JOBS_RUNNER=cron: there is no long-running process, so pg-boss is
 *              never started; Vercel Cron calls /api/cron/tick every 5 minutes and the tick works out what is due
 *              (src/lib/jobs/tick.ts). Buttons ("Sync now") queue their work in the Setting table for the next tick.
 *
 * JOBS_RUNNER=pg-boss forces pg-boss even on Vercel (not useful there; for tests and odd hosts).
 */
export type JobsRunner = "pg-boss" | "cron";

export function jobsRunner(env: Record<string, string | undefined> = process.env): JobsRunner {
  const v = (env.JOBS_RUNNER ?? "").trim().toLowerCase();
  if (v === "cron") return "cron";
  if (v === "pg-boss" || v === "pgboss") return "pg-boss";
  return env.VERCEL ? "cron" : "pg-boss";
}

/**
 * Seconds the cron tick may run — Vercel Pro allows up to 800 s with Fluid compute (on by default for new projects).
 * Keep equal to the literal `maxDuration` in src/app/api/cron/tick/route.ts (Next.js needs a literal there).
 */
export const TICK_MAX_SECONDS = 800;
/** Stop starting new work this long before the function's time is up (a running piece still has to finish). */
export const SAFETY_MARGIN_MS = 60_000;
