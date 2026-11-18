"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertOwner, assertUser } from "@/lib/auth/session";
import { logChange } from "@/lib/model/store";
import { TEMPLATES } from "@/lib/reports/build";
import { checkRecipients } from "@/lib/reports/recipients";
import { sendReport } from "@/lib/reports/send";

export type RepState = { ok: boolean; message: string; id?: string };
const actor = (u: { name: string }) => ({ type: "USER" as const, name: u.name });

const New = z.object({ name: z.string().trim().min(2).max(80), template: z.string(), period: z.enum(["WEEK", "MONTH", "QUARTER", "YEAR"]), cls: z.enum(["INTERNAL", "CLIENT_SAFE", "EXTERNAL"]), clientId: z.string().optional() });
export async function createReportAction(_p: RepState | null, fd: FormData): Promise<RepState> {
  const me = await assertUser();
  const p = New.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { ok: false, message: "Give it a name, template and period." };
  const t = TEMPLATES[p.data.template];
  if (!t) return { ok: false, message: "Unknown template." };
  if (!t.periods.includes(p.data.period)) return { ok: false, message: `${t.label} works for: ${t.periods.join(", ").toLowerCase()}.` };
  if (p.data.cls === "CLIENT_SAFE" && (!t.clientSafe || !p.data.clientId)) return { ok: false, message: "Client reports need one client and a client-safe template (workload, trends, quarterly or volumes)." };
  if (p.data.cls === "EXTERNAL" && !t.external) return { ok: false, message: "External finance reports use the Finance · bank pack template." };
  const r = await prisma.report.create({ data: { name: p.data.name, template: p.data.template, period: p.data.period, cls: p.data.cls, clientId: p.data.clientId || null, createdBy: me.name, sortOrder: await prisma.report.count() } });
  await logChange({ entity: "report", entityId: r.id, field: "_created", oldValue: null, newValue: p.data, actor: actor(me) });
  revalidatePath("/reports");
  return { ok: true, message: "Report added.", id: r.id };
}

/** Only these fields can be changed here — never the approval, template, class, client or author (security review). */
const Update = z
  .object({
    forecast: z.boolean(),
    costing: z.enum(["T", "F", "B"]),
    schedule: z.enum(["OFF", "WEEKLY", "MONTHLY", "QUARTERLY"]),
    mode: z.enum(["DRY_RUN", "DRAFT", "AUTO"]),
    sendTime: z.string().regex(/^\d{2}:\d{2}$/),
    recipients: z.array(z.string().trim().toLowerCase().email().max(200)).max(50),
    name: z.string().trim().min(2).max(80),
  })
  .partial()
  .strict();

export async function updateReportAction(id: string, raw: unknown): Promise<RepState> {
  const me = await assertUser();
  const parsed = Update.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "That change isn't allowed here." };
  const data = parsed.data;
  const cur = await prisma.report.findUniqueOrThrow({ where: { id } });
  if (data.recipients) {
    const bad = (await checkRecipients({ ...cur, approvedAt: cur.approvedAt ?? new Date() }, data.recipients)).filter((c) => !c.ok);
    if (bad.length) return { ok: false, message: `Not allowed: ${bad.map((b) => `${b.email} (${b.why})`).join(", ")}. Add them in Settings → Contacts & recipients first.` };
  }
  if (data.mode === "AUTO" && cur.cls === "CLIENT_SAFE" && !(await prisma.reportSend.count({ where: { reportId: id, mode: "DRAFT", ok: true } }))) return { ok: false, message: "The first client send is always a draft — save one as a draft first." };
  const upd: Record<string, unknown> = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  // New recipients for a lender pack need the owner's approval again
  const recipientsChanged = data.recipients && JSON.stringify([...data.recipients].sort()) !== JSON.stringify([...(cur.recipients ?? [])].sort());
  if (cur.cls === "EXTERNAL" && recipientsChanged && cur.approvedAt) Object.assign(upd, { approvedAt: null, approvedBy: null });
  await prisma.report.update({ where: { id }, data: upd });
  for (const [k, v] of Object.entries(upd)) await logChange({ entity: "report", entityId: id, field: k, oldValue: (cur as Record<string, unknown>)[k] ?? null, newValue: v as never, actor: actor(me) });
  revalidatePath("/reports");
  return { ok: true, message: "Saved." };
}

export async function deleteReportAction(id: string): Promise<RepState> {
  const me = await assertUser();
  const r = await prisma.report.delete({ where: { id } });
  await logChange({ entity: "report", entityId: id, field: "_deleted", oldValue: { name: r.name, template: r.template }, newValue: null, actor: actor(me) });
  revalidatePath("/reports");
  return { ok: true, message: "Deleted." };
}

export async function sendNowAction(id: string, mode: string): Promise<RepState> {
  const me = await assertUser();
  if (mode !== "DRY_RUN" && mode !== "DRAFT" && mode !== "AUTO") return { ok: false, message: "Unknown send mode." };
  const r = await sendReport(id, { name: me.name, email: me.email }, { mode });
  revalidatePath("/reports");
  revalidatePath("/tasks");
  return r;
}

/** External finance: the owner (or Mark through the owner) approves before anything goes to lenders. */
export async function approveReportAction(id: string): Promise<RepState> {
  const me = await assertOwner().catch(() => null);
  if (!me) return { ok: false, message: "Only an owner can approve a report." };
  await prisma.report.update({ where: { id }, data: { approvedBy: me.name, approvedAt: new Date() } });
  await logChange({ entity: "report", entityId: id, field: "approved", oldValue: null, newValue: me.name, actor: actor(me) });
  revalidatePath("/reports");
  revalidatePath("/finance");
  return { ok: true, message: "Approved." };
}
