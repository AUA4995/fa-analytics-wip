"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, assertOwner } from "@/lib/auth/session";
import { THOMAX_TABLE_NAMES } from "@/lib/thomax/tables";
import type { DataActionState } from "./actions";

/**
 * Thomax (.wms) copy — buttons on Data sources → WMS.
 * Connection and table settings: owner only (a .wms login). Sync / explore buttons: admins.
 */

const ok = (message: string): DataActionState => ({ ok: true, message });
const fail = (err: unknown): DataActionState => ({ ok: false, message: err instanceof Error ? err.message : String(err) });

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
      return { ok: false, message: `Saved, but the test failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  } catch (err) {
    return fail(err);
  }
}

export async function disconnectThomaxAction(): Promise<DataActionState> {
  try {
    await assertOwner();
    const { disconnect } = await import("@/lib/thomax/sync");
    await disconnect();
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
      return ok(`${table}: ${r.fields} fields found.`);
    }
    const r = await exploreAll();
    revalidatePath("/data");
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
    await saveTableSettings(
      name,
      {
        enabled: form.get("enabled") === "on",
        kind,
        dateField: String(form.get("dateField") ?? "") || null,
        keyFields: form.getAll("keyFields").map(String).filter(Boolean),
        lookupFields: form.getAll("lookupFields").map(String).filter(Boolean),
      },
      me.name,
    );
    revalidatePath("/data");
    return ok(`${name} saved.`);
  } catch (err) {
    return fail(err);
  }
}

/** "Sync now" = the nightly run (masters + last N days). "Load history now" = history steps even by day. */
export async function runThomaxAction(what: "nightly" | "history"): Promise<DataActionState> {
  try {
    await assertAdmin();
    const { getCreds } = await import("@/lib/thomax/sync");
    if (!(await getCreds())) throw new Error("Connect Thomax first.");
    if (process.env.JOBS_DISABLED === "1") {
      const { historyStep, nightly } = await import("@/lib/thomax/sync");
      const r = what === "nightly" ? await nightly() : await historyStep(2);
      revalidatePath("/data");
      return { ok: !r.errors.length, message: `${r.rows.toLocaleString("en-AU")} rows read${r.remaining ? `, ${r.remaining} month windows still to load` : ""}.${r.errors.length ? ` Problems: ${r.errors.join("; ")}` : ""}` };
    }
    const { enqueue, QUEUE_THOMAX_HISTORY, QUEUE_THOMAX_NIGHTLY } = await import("@/lib/jobs/scheduler");
    await enqueue(what === "nightly" ? QUEUE_THOMAX_NIGHTLY : QUEUE_THOMAX_HISTORY, what === "history" ? { anyTime: true } : {});
    return ok(what === "nightly" ? "Sync started in the background — refresh in a few minutes." : "History load started in the background. It keeps going step by step; refresh to see progress. By default it only runs 20:00–06:00, this button starts it now.");
  } catch (err) {
    return fail(err);
  }
}
