"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, assertOwner } from "@/lib/auth/session";
import { THOMAX_TABLE_NAMES } from "@/lib/thomax/tables";
import { prisma } from "@/lib/db";
import type { DataActionState } from "./actions";
import { plainError } from "@/lib/plain-error";

/**
 * Thomax (.wms) copy — buttons on Data sources → WMS.
 * Connection and table settings: owner only (a .wms login). Sync / explore buttons: admins.
 */

const ok = (message: string): DataActionState => ({ ok: true, message });
const fail = (err: unknown): DataActionState => ({ ok: false, message: plainError(err) });

export async function saveThomaxConnectionAction(_: DataActionState | null, form: FormData): Promise<DataActionState> {
  try {
    const me = await assertOwner();
    const { saveConnection, testConnection } = await import("@/lib/thomax/sync");
    const recheck = String(form.get("recheckDays") ?? "").trim();
    await saveConnection(
      {
        cluster: String(form.get("cluster") ?? ""),
        username: String(form.get("username") ?? ""),
        password: String(form.get("password") ?? ""),
        historyFrom: String(form.get("historyFrom") ?? "") || undefined,
        recheckDays: recheck ? Number(recheck) : undefined,
      },
      me.name,
    );
    revalidatePath("/data");
    try {
      await testConnection();
      return ok("Saved and tested: Thomax answered. Next: Explore tables.");
    } catch (err) {
      return { ok: false, message: `Saved, but the test failed: ${plainError(err)}` };
    }
  } catch (err) {
    return fail(err);
  }
}

export async function disconnectThomaxAction(): Promise<DataActionState> {
  try {
    const me = await assertOwner();
    const { disconnect } = await import("@/lib/thomax/sync");
    await disconnect(me.name);
    revalidatePath("/data");
    return ok("Disconnected. The copied rows are kept.");
  } catch (err) {
    return fail(err);
  }
}

export async function testThomaxAction(): Promise<DataActionState> {
  try {
    await assertAdmin();
    const { testConnection } = await import("@/lib/thomax/sync");
    await testConnection();
    return ok("Thomax answered.");
  } catch (err) {
    return fail(err);
  }
}

export async function exploreThomaxAction(table?: string): Promise<DataActionState> {
  try {
    await assertAdmin();
    const { exploreAll, exploreTable } = await import("@/lib/thomax/sync");
    if (table) {
      if (!THOMAX_TABLE_NAMES.includes(table)) throw new Error("Unknown table");
      const r = await exploreTable(table);
      revalidatePath("/data");
      return ok(r.empty ? `${table}: the table returned no rows${r.fields ? " — the fields found before are kept" : " — nothing to set up yet"}.` : `${table}: ${r.fields} fields found.`);
    }
    const r = await exploreAll();
    revalidatePath("/data");
    if (r.stopped) return { ok: false, message: `${r.stopped}${r.ok ? ` (${r.ok} tables explored before that)` : ""}` };
    return { ok: !r.failed.length, message: `Explored ${r.ok} tables${r.failed.length ? `; failed: ${r.failed.join(", ")} (see each table)` : ""}. Check the suggested settings on each table and save them.` };
  } catch (err) {
    return fail(err);
  }
}

export async function saveThomaxTableAction(_: DataActionState | null, form: FormData): Promise<DataActionState> {
  try {
    const me = await assertOwner();
    const name = String(form.get("table") ?? "");
    if (!THOMAX_TABLE_NAMES.includes(name)) throw new Error("Unknown table");
    const kind = String(form.get("kind") ?? "TRANSACTIONAL") === "MASTER" ? "MASTER" : "TRANSACTIONAL";
    const { saveTableSettings } = await import("@/lib/thomax/sync");
    const r = await saveTableSettings(
      name,
      {
        enabled: form.get("enabled") === "on",
        kind,
        dateField: String(form.get("dateField") ?? "") || null,
        keyFields: form.getAll("keyFields").map(String).filter(Boolean),
        lookupFields: form.getAll("lookupFields").map(String).filter(Boolean),
        excludeFields: form.getAll("excludeFields").map(String).filter(Boolean),
        confirmKeyChange: form.get("confirmKeyChange") === "on",
      },
      me.name,
    );
    revalidatePath("/data");
    return ok(r.cleared ? `${name} saved — its copied rows were cleared and will be copied again with the new key.` : `${name} saved.`);
  } catch (err) {
    return fail(err);
  }
}

/** "Sync now" = the nightly run (masters + last N days). "Load history now" = history steps even by day. */
export async function runThomaxAction(what: "nightly" | "history"): Promise<DataActionState> {
  try {
    await assertAdmin();
    if (what !== "nightly" && what !== "history") throw new Error("Unknown action");
    const { getCreds } = await import("@/lib/thomax/sync");
    if (!(await getCreds())) throw new Error("Thomax isn't connected, or its login was refused — check Change login.");
    if (!(await prisma.thomaxTable.count({ where: { enabled: true, confirmedAt: { not: null } } }))) throw new Error("No table is saved yet — Explore, check and save the tables first.");
    if (process.env.JOBS_DISABLED === "1") {
      const { historyStep, nightly } = await import("@/lib/thomax/sync");
      const r = what === "nightly" ? await nightly() : await historyStep(2);
      revalidatePath("/data");
      if (r.stopped) return { ok: false, message: r.stopped };
      return { ok: !r.errors.length, message: `${r.rows.toLocaleString("en-AU")} rows read${r.remaining ? `, ${r.remaining} month windows still to load` : ""}.${r.errors.length ? ` Problems: ${r.errors.join("; ")}` : ""}` };
    }
    const { enqueue, QUEUE_THOMAX_HISTORY, QUEUE_THOMAX_NIGHTLY } = await import("@/lib/jobs/scheduler");
    await enqueue(what === "nightly" ? QUEUE_THOMAX_NIGHTLY : QUEUE_THOMAX_HISTORY, what === "history" ? { anyTime: true } : {});
    const { jobsRunner } = await import("@/lib/jobs/runner");
    const soon = jobsRunner() === "cron" ? "starts within 5 minutes" : "runs now";
    return ok(what === "nightly" ? `Sync queued — it ${soon}; refresh in a few minutes.` : `History load: the next step ${soon} and loading carries on step by step until the history is in. Refresh to see progress.`);
  } catch (err) {
    return fail(err);
  }
}
