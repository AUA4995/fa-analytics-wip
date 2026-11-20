/**
 * The background work itself, shared by both runners (pg-boss workers in scheduler.ts and the Vercel cron tick in
 * tick.ts), so the laptop and Vercel do exactly the same thing.
 */

export type XeroJob = { kind?: "FULL" | "INCREMENTAL"; by?: string | null };
export type FrontJob = { months?: number; by?: string | null };

export async function doXeroSync(data: XeroJob = {}): Promise<string> {
  const { getConnection } = await import("@/lib/xero/auth");
  if (!(await getConnection())) return "Xero not connected — skipped";
  const { runXeroSync } = await import("@/lib/xero/sync");
  const { recordFailure, recordSuccess } = await import("@/lib/integrations/status");
  try {
    await runXeroSync(data.kind ?? "INCREMENTAL", data.by ?? null);
    await recordSuccess("xero");
    await (await import("./after-sync")).afterSync(data.by ?? null);
    return "Xero synced";
  } catch (err) {
    await recordFailure("xero", err);
    throw err;
  }
}

export async function doFrontTickets(data: FrontJob = {}): Promise<string> {
  const { isFrontConfigured } = await import("@/lib/front/client");
  if (!isFrontConfigured()) return "Front not connected — skipped";
  const { syncFrontTickets } = await import("@/lib/front/tickets");
  await syncFrontTickets(data.months ?? 2, data.by ?? null);
  // Batch 3: weighted ticket scores for the last 2 full weeks (or more when recounting history)
  const { syncTicketScores } = await import("@/lib/tickets/sync");
  await syncTicketScores(data.months && data.months > 2 ? Math.min(104, Math.round(data.months * 4.35)) : 2, data.by ?? null);
  return "Front tickets counted";
}

export async function doReportTick(now = new Date()): Promise<string> {
  const { runReportTick } = await import("@/lib/reports/send");
  const r = await runReportTick(now);
  return `${r.length} report${r.length === 1 ? "" : "s"} due`;
}
