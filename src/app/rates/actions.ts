"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertAdmin, assertUser } from "@/lib/auth/session";
import { logChange, updateValue } from "@/lib/model/store";
import { createTask } from "@/lib/tasks";
import { planRateUpload, saveRateUpload, type RateSource } from "@/lib/rates/checks";
import { plainError } from "@/lib/plain-error";

export type RateState = { ok: boolean; message: string; id?: string };
const actor = (u: { name: string }) => ({ type: "USER" as const, name: u.name });

export async function uploadRatesAction(source: RateSource, text: string, fileName: string | null): Promise<RateState> {
  try {
    await assertAdmin();
    const plan = await planRateUpload(source, text);
    if (plan.errors.length && !plan.saved.length) return { ok: false, message: plan.errors[0].message };
    const n = await saveRateUpload(source, plan, fileName, new Date());
    revalidatePath("/leakage");
    return { ok: true, message: `${n} rates saved.${plan.unknownClients.length ? ` Unknown clients: ${plan.unknownClients.slice(0, 6).join(", ")}.` : ""}${plan.unknownCodes.length ? ` Codes not mapped: ${plan.unknownCodes.slice(0, 6).join(", ")}.` : ""}` };
  } catch (err) {
    return { ok: false, message: plainError(err) };
  }
}

/** A person decides which system is right. Analytics is updated here; the others get a task to fix by hand. */
export async function decideRateAction(clientId: string, serviceCode: string, right: "CLM" | "DYSPATCH" | "WMS", rate: number): Promise<RateState> {
  const me = await assertUser();
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const fix = (["CLM", "DYSPATCH", "WMS"] as const).filter((x) => x !== right);
  for (const sys of fix) {
    if (sys === "CLM") {
      await updateValue("rate", `${clientId}|${serviceCode}`, "rate", String(rate), actor(me), `Rate check: ${right} is right`);
      await createTask({ title: `Update ${serviceCode} for ${c.name} in CLM to $${rate}`, detail: `${right} holds the right rate. Analytics already updated.`, where: "CLM", clientId, source: `ratecheck:${clientId}:${serviceCode}:CLM` });
    } else
      await createTask({ title: `Fix ${serviceCode} for ${c.name} in ${sys === "DYSPATCH" ? "Dyspach" : "the WMS"} to $${rate}`, detail: `${right === "CLM" ? "CLM" : right === "DYSPATCH" ? "Dyspach" : "The WMS"} holds the right rate. Change it by hand, then re-upload the ${sys === "DYSPATCH" ? "Dyspach" : "WMS"} rate export to confirm.`, where: sys === "DYSPATCH" ? "Dyspach" : "WMS", clientId, source: `ratecheck:${clientId}:${serviceCode}:${sys}` });
  }
  await logChange({ entity: "ratecheck", entityId: `${clientId}|${serviceCode}`, field: "decision", oldValue: null, newValue: { right, rate }, actor: actor(me) });
  revalidatePath("/leakage");
  revalidatePath("/tasks");
  return { ok: true, message: `Tasks created to fix ${fix.join(" and ")}.` };
}

/** Starts an ad-hoc review to hold proposed rates. Review types and due dates are scheduled in the CLM, not here. */
export async function createReviewAction(clientId: string, _type?: unknown, _due?: unknown, note?: string | null): Promise<RateState> {
  const me = await assertUser();
  if (!(await prisma.client.findUnique({ where: { id: String(clientId) }, select: { id: true } }))) return { ok: false, message: "Unknown client." };
  const type = "ADHOC" as const;
  const due = null;
  const r = await prisma.rateReview.create({ data: { clientId, type, due, note: typeof note === "string" ? note.slice(0, 2000) : null, owner: me.name, createdBy: me.name } });
  await logChange({ entity: "review", entityId: r.id, field: "_created", oldValue: null, newValue: { clientId, type, due }, actor: actor(me) });
  revalidatePath("/cost");
  return { ok: true, message: "Review started.", id: r.id };
}

/** Analytics saves only the proposed rates and target margin; stage, owner and due date live in the CLM (16/11). */
export async function updateReviewAction(id: string, data: { note?: string; newRates?: Record<string, number>; target?: number | null }): Promise<RateState> {
  const me = await assertUser();
  const cur = await prisma.rateReview.findUniqueOrThrow({ where: { id } });
  const upd: Record<string, unknown> = {};
  if (typeof data.note === "string") upd.note = data.note.slice(0, 2000);
  if (data.newRates && typeof data.newRates === "object") upd.newRates = Object.fromEntries(Object.entries(data.newRates).filter(([k, v]) => /^[A-Za-z0-9_.-]{1,40}$/.test(k) && Number.isFinite(v)));
  if (data.target === null || (typeof data.target === "number" && Number.isFinite(data.target))) upd.target = data.target;
  await prisma.rateReview.update({ where: { id }, data: upd });
  for (const [k, v] of Object.entries(upd)) await logChange({ entity: "review", entityId: id, field: k, oldValue: (cur as Record<string, unknown>)[k] ?? null, newValue: v as never, actor: actor(me) });
  revalidatePath("/cost");
  return { ok: true, message: "Saved." };
}
