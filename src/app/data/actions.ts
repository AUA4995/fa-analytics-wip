"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth/session";
import { deleteWmsImport } from "@/lib/wms/import";
import { plainError } from "@/lib/plain-error";

export type DataActionState = { ok: boolean; message: string };

/** Xero read now (incremental) or a full re-read; runs in the background job queue. */
export async function syncXeroAction(rawKind: "FULL" | "INCREMENTAL"): Promise<DataActionState> {
  const kind: "FULL" | "INCREMENTAL" = rawKind === "FULL" ? "FULL" : "INCREMENTAL";
  try {
    const me = await assertAdmin();
    const { getConnection } = await import("@/lib/xero/auth");
    if (!(await getConnection())) return { ok: false, message: "Connect Xero first (Settings → Company)." };
    if (process.env.JOBS_DISABLED === "1") {
      const { runXeroSync } = await import("@/lib/xero/sync");
      const s = await runXeroSync(kind, me.name);
      await (await import("@/lib/jobs/after-sync")).afterSync(me.name);
      revalidatePath("/data");
      return { ok: true, message: `Done: ${s.sales} invoices / credit notes, ${s.pnlMonths} P&L months, ${s.payslips} payslips.` };
    }
    const { enqueue, QUEUE_XERO_SYNC } = await import("@/lib/jobs/scheduler");
    await enqueue(QUEUE_XERO_SYNC, { kind, by: me.name });
    const { jobsRunner } = await import("@/lib/jobs/runner");
    return { ok: true, message: `${kind === "FULL" ? "Full re-read" : "Sync"} ${jobsRunner() === "cron" ? "queued — it starts within 5 minutes; refresh this page after that" : "started in the background — refresh this page in a minute or two"}.${kind === "FULL" ? " The first full read of history since 2021 can take a while (Xero allows 60 calls a minute)." : ""}` };
  } catch (err) {
    return { ok: false, message: plainError(err) };
  }
}

export async function recountFrontAction(rawMonths: number): Promise<DataActionState> {
  const months = Math.min(24, Math.max(1, Math.round(Number(rawMonths) || 2)));
  try {
    const me = await assertAdmin();
    const { enqueue, QUEUE_FRONT_TICKETS } = await import("@/lib/jobs/scheduler");
    await enqueue(QUEUE_FRONT_TICKETS, { months, by: me.name });
    const { jobsRunner } = await import("@/lib/jobs/runner");
    return { ok: true, message: jobsRunner() === "cron" ? "Queued — counting starts within 5 minutes; refresh after that." : "Counting in the background — refresh in a minute." };
  } catch (err) {
    return { ok: false, message: plainError(err) };
  }
}

export async function deleteImportAction(id: string): Promise<DataActionState> {
  try {
    await assertAdmin();
    const n = await deleteWmsImport(id);
    revalidatePath("/data");
    return { ok: true, message: `Removed the file and its ${n.toLocaleString("en-AU")} rows.` };
  } catch (err) {
    return { ok: false, message: plainError(err) };
  }
}
