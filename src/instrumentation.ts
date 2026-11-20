/**
 * Runs once when the Next.js server starts (Node runtime only).
 * Starts the pg-boss scheduler so the daily Xero sync (and, from 1d, digest sends)
 * run without anyone opening the app.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    // Vercel: no long-running process — Vercel Cron calls /api/cron/tick instead (src/lib/jobs/runner.ts)
    const { jobsRunner } = await import("@/lib/jobs/runner");
    if (jobsRunner() === "cron") return;
    const { startScheduler } = await import("@/lib/jobs/scheduler");
    await startScheduler();
  } catch (err) {
    console.error("[jobs] scheduler failed to start:", err instanceof Error ? err.message : err);
  }
}
