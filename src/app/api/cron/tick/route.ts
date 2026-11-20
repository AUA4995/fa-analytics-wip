import { isCronAuthorized } from "@/lib/jobs/cron-auth";
import { jobsRunner } from "@/lib/jobs/runner";

export const dynamic = "force-dynamic";
/** Seconds — keep equal to TICK_MAX_SECONDS in src/lib/jobs/runner.ts (Next.js needs a literal here). */
export const maxDuration = 800;

/**
 * Vercel Cron, every 5 minutes (vercel.json): runs whatever background work is due — see src/lib/jobs/tick.ts.
 * Only Vercel Cron may call it (Authorization: Bearer $CRON_SECRET). No session by design; the proxy lets it through
 * (src/lib/auth/paths.ts) and the secret is the gate.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const secret = (process.env.CRON_SECRET ?? "").trim();
  // A secret that's set but too short refuses every call — say why in the log, so the cron doesn't fail silently
  if (secret && secret.length < 16) console.warn("[cron] CRON_SECRET is set but shorter than 16 characters — every tick is refused. Use a longer secret.");
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (jobsRunner() !== "cron") return Response.json({ error: "Background jobs run on pg-boss here (not on Vercel) — the cron tick is off." }, { status: 409 });
  try {
    const { runTick } = await import("@/lib/jobs/tick");
    return Response.json({ ok: true, ...(await runTick({ startedAt })) });
  } catch (err) {
    console.error("[cron] tick failed:", err instanceof Error ? (err.stack ?? err.message) : err);
    return Response.json({ ok: false, error: "tick failed — see the function log" }, { status: 500 });
  }
}
