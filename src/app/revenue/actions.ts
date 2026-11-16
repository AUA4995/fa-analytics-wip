"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/model/store";

/** Revenue protection cases (batch 4): admins add and edit; every change is logged. */

export type CaseState = { ok: boolean; message: string; id?: string };

const money = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v.replace(/[$,\s]/g, ""))))
  .refine((v) => v === null || (Number.isFinite(v) && Math.abs(v) < 1e9), "Amounts must be numbers");

const CaseForm = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  clientId: z.string().trim().max(40).optional().default(""),
  clientName: z.string().trim().max(120).optional().default(""),
  title: z.string().trim().min(3, "Give it a short title").max(160),
  kind: z.enum(["COST_AVOIDED", "LOSS", "RECOVERED"], { message: "Pick what kind of case it is" }),
  whatHappened: z.string().trim().min(3, "Say what happened").max(4000),
  amountBefore: money,
  amountAfter: money,
  pending: z.string().trim().max(500).optional().default(""),
  status: z.enum(["OPEN", "CLOSED"]).default("OPEN"),
  stoppedBy: z.string().trim().max(120).optional().default(""),
  carNumber: z.string().trim().max(40).optional().default(""),
  lessons: z.string().trim().max(4000).optional().default(""),
});

function read(form: FormData) {
  const g = (k: string) => String(form.get(k) ?? "");
  return CaseForm.safeParse({
    date: g("date"),
    clientId: g("clientId"),
    clientName: g("clientName"),
    title: g("title"),
    kind: g("kind"),
    whatHappened: g("whatHappened"),
    amountBefore: g("amountBefore"),
    amountAfter: g("amountAfter"),
    pending: g("pending"),
    status: g("status") || "OPEN",
    stoppedBy: g("stoppedBy"),
    carNumber: g("carNumber"),
    lessons: g("lessons"),
  });
}

async function toData(v: z.infer<typeof CaseForm>) {
  const clientId = v.clientId && (await prisma.client.findUnique({ where: { id: v.clientId }, select: { id: true } })) ? v.clientId : null;
  return {
    date: new Date(`${v.date}T00:00:00Z`),
    clientId,
    clientName: v.clientName || null,
    title: v.title,
    kind: v.kind,
    whatHappened: v.whatHappened,
    amountBefore: v.amountBefore,
    amountAfter: v.amountAfter,
    pending: v.pending || null,
    status: v.status,
    stoppedBy: v.stoppedBy || null,
    carNumber: v.carNumber || null,
    lessons: v.lessons || null,
  };
}

export async function saveCase(_prev: CaseState | null, form: FormData): Promise<CaseState> {
  try {
    const me = await assertAdmin();
    const parsed = read(form);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
    if (parsed.data.status === "CLOSED" && (parsed.data.amountBefore == null || parsed.data.amountAfter == null)) return { ok: false, message: "A case can be closed once both amounts are known." };
    const data = await toData(parsed.data);
    const id = String(form.get("id") ?? "");
    if (id) {
      const before = await prisma.revenueCase.findUnique({ where: { id } });
      if (!before) return { ok: false, message: "That case no longer exists." };
      await prisma.revenueCase.update({ where: { id }, data });
      await logChange({ entity: "revenuecase", entityId: id, field: "*", oldValue: { ...before, amountBefore: before.amountBefore?.toString() ?? null, amountAfter: before.amountAfter?.toString() ?? null }, newValue: { ...data, date: parsed.data.date }, actor: { type: "USER", name: me.name } });
      revalidatePath("/revenue");
      return { ok: true, message: "Saved.", id };
    }
    const c = await prisma.revenueCase.create({ data: { ...data, createdBy: me.name } });
    await logChange({ entity: "revenuecase", entityId: c.id, field: "*", oldValue: null, newValue: { ...data, date: parsed.data.date }, actor: { type: "USER", name: me.name } });
    revalidatePath("/revenue");
    return { ok: true, message: "Case added.", id: c.id };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteCase(id: string): Promise<CaseState> {
  try {
    const me = await assertAdmin();
    const c = await prisma.revenueCase.findUnique({ where: { id } });
    if (!c) return { ok: false, message: "That case no longer exists." };
    await prisma.revenueCase.delete({ where: { id } });
    await logChange({ entity: "revenuecase", entityId: id, field: "*", oldValue: { title: c.title, date: c.date.toISOString().slice(0, 10) }, newValue: null, actor: { type: "USER", name: me.name }, reason: "deleted" });
    revalidatePath("/revenue");
    return { ok: true, message: "Deleted." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
