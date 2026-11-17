"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/model/store";
import { plainError } from "@/lib/plain-error";

/** Revenue protection cases (batch 4): admins add and edit; every change is logged. */

export type CaseState = { ok: boolean; message: string; id?: string };

// Plain dollar amounts only ("1,400", "$1400.50"); no negatives (the kind says whether it's a saving or a loss)
const money = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\$?\d{1,3}(,?\d{3})*(\.\d{1,2})?$/.test(v.replace(/\s/g, "")), "Amounts are dollars like 1,400 or 1400.50 — no minus sign (the kind says if it's a loss)")
  .transform((v) => (v === "" ? null : Number(v.replace(/[$,\s]/g, ""))))
  .refine((v) => v === null || v < 1e9, "That amount is too big");

const CaseForm = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  clientId: z.string().trim().max(40).optional().default(""),
  clientName: z.string().trim().max(120).optional().default(""),
  title: z.string().trim().min(3, "Give it a short title").max(160, "The title is too long (160 characters at most)"),
  kind: z.enum(["COST_AVOIDED", "LOSS", "RECOVERED"], { message: "Pick what kind of case it is" }),
  whatHappened: z.string().trim().min(3, "Say what happened").max(4000, "“What happened” is too long (4,000 characters at most)"),
  amountBefore: money,
  amountAfter: money,
  pending: z.string().trim().max(500, "“Still to confirm” is too long (500 characters at most)").optional().default(""),
  status: z.enum(["OPEN", "CLOSED"], { message: "Status must be open or closed" }).default("OPEN"),
  stoppedBy: z.string().trim().max(120, "“Stopped by” is too long").optional().default(""),
  carNumber: z.string().trim().max(40, "The CAR number is too long").optional().default(""),
  lessons: z.string().trim().max(4000, "Lessons are too long (4,000 characters at most)").optional().default(""),
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
    if (Number.isNaN(Date.parse(`${parsed.data.date}T00:00:00Z`)) || new Date(`${parsed.data.date}T00:00:00Z`).toISOString().slice(0, 10) !== parsed.data.date) return { ok: false, message: "That date doesn't exist." };
    const { amountBefore: b, amountAfter: a, kind } = parsed.data;
    if (b != null && a != null && kind === "LOSS" && a < b) return { ok: false, message: "For a loss, “actually cost” is more than “should have earned / cost” — check the two amounts or choose “Cost avoided”." };
    if (b != null && a != null && kind === "COST_AVOIDED" && a > b) return { ok: false, message: "For cost avoided, “actually cost” is less than “would have cost” — check the two amounts or choose “Loss”." };
    const d = new Date(`${parsed.data.date}T00:00:00Z`);
    const tomorrow = new Date(Date.now() + 36 * 3_600_000);
    if (d.getUTCFullYear() < 2020 || d > tomorrow) return { ok: false, message: "The date must be between 2020 and today." };
    if (parsed.data.kind === "RECOVERED" && parsed.data.amountBefore != null && parsed.data.amountAfter != null && parsed.data.amountAfter > parsed.data.amountBefore)
      return { ok: false, message: "“Still missed” can't be more than what was missed." };
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
    return { ok: false, message: plainError(err) };
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
    return { ok: false, message: plainError(err) };
  }
}
