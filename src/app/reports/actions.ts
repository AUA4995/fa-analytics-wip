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

export async function updateReportAction(id: string, data: { forecast?: boolean; costing?: string; schedule?: string; mode?: string; sendTime?: string; recipients?: string[]; name?: string }): Promise<RepState> {
  const me = await assertUser();
  const cur = await prisma.report.findUniqueOrThrow({ where: { id } });
  if (data.recipients) {
    const bad = (await checkRecipients({ ...cur, approvedAt: cur.approvedAt ?? new Date() }, data.recipients)).filter((c) => !c.ok);
    if (bad.length) return { ok: false, message: `Not allowed: ${bad.map((b) => `${b.email} (${b.why})`).join(", ")}. Add them in Settings → Contacts & recipients first.` };
  }
  if (data.mode === "AUTO" && cur.cls === "CLIENT_SAFE" && !(await prisma.reportSend.count({ where: { reportId: id, mode: "DRAFT", ok: true } }))) return { ok: false, message: "The first client send is always a draft — save one as a draft first." };
  const upd = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
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
  const r = await sendReport(id, { name: me.name, email: me.email }, { mode });
  revalidatePath("/reports");
  revalidatePath("/tasks");
  return r;
}

/** External finance: the owner (or Mark through the owner) approves before anything goes to lenders. */
export async function approveReportAction(id: string): Promise<RepState> {
  const me = await assertOwner();
  await prisma.report.update({ where: { id }, data: { approvedBy: me.name, approvedAt: new Date() } });
  await logChange({ entity: "report", entityId: id, field: "approved", oldValue: null, newValue: me.name, actor: actor(me) });
  revalidatePath("/reports");
  revalidatePath("/finance");
  return { ok: true, message: "Approved." };
}
