"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth/session";
import { FLOW_INFO, FLOW_KEYS, saveOpsConfig, type FlowKey, type RoleKey } from "@/lib/ops/config";

export type OpsActionState = { ok: boolean; message: string };

/** Operations → Setup (admins): which Thomax fields mean what, and the SLA rules. Validated against Explore's field lists. */
export async function saveOpsSetupAction(_: OpsActionState | null, form: FormData): Promise<OpsActionState> {
  try {
    await assertAdmin();
    const flows = {} as Record<FlowKey, { table: string; roles: Partial<Record<RoleKey, string>> }>;
    for (const k of FLOW_KEYS) {
      const roles: Partial<Record<RoleKey, string>> = {};
      for (const [r] of FLOW_INFO[k].roles) roles[r] = String(form.get(`${k}.${r}`) ?? "");
      flows[k] = { table: String(form.get(`${k}.table`) ?? ""), roles };
    }
    await saveOpsConfig({
      flows,
      b2bValues: String(form.get("b2bValues") ?? ""),
      cutoffHour: String(form.get("cutoffHour") ?? ""),
      b2bExtraDays: String(form.get("b2bExtraDays") ?? ""),
      receivingHours: String(form.get("receivingHours") ?? ""),
      holidays: String(form.get("holidays") ?? ""),
    });
    revalidatePath("/operations");
    return { ok: true, message: "Saved." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
