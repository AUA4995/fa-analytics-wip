"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { logChange } from "@/lib/model/store";

export type ContactState = { ok: boolean; message: string };

const Rec = z.object({
  list: z.enum(["INTERNAL", "CLIENT", "LENDER"]),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Not a valid email"),
  clientId: z.string().trim().optional().nullable(),
  role: z.string().trim().max(60).optional().nullable(),
});

/** Add someone to Internal, a client's contacts, or Lenders & advisers. Only people on these lists can get reports. */
export async function addRecipientAction(_p: ContactState | null, fd: FormData): Promise<ContactState> {
  try {
    const me = await assertAdmin();
    const v = Rec.safeParse(Object.fromEntries(fd));
    if (!v.success) return { ok: false, message: v.error.issues[0].message };
    const d = v.data;
    if (d.list === "CLIENT" && !d.clientId) return { ok: false, message: "Pick the client this contact belongs to" };
    if (d.list === "CLIENT") {
      const other = await prisma.recipient.findFirst({ where: { list: "CLIENT", email: d.email } });
      if (other && other.clientId !== d.clientId) return { ok: false, message: "This email is already another client's contact" };
    }
    const r = await prisma.recipient.upsert({
      where: { list_email: { list: d.list, email: d.email } },
      create: { list: d.list, name: d.name, email: d.email, clientId: d.list === "CLIENT" ? d.clientId : null, role: d.list === "LENDER" ? d.role || null : null, createdBy: me.name },
      update: { name: d.name, clientId: d.list === "CLIENT" ? d.clientId : null, role: d.list === "LENDER" ? d.role || null : null },
    });
    await logChange({ entity: "recipient", entityId: r.id, field: "added", oldValue: null, newValue: `${d.list} · ${d.email}`, actor: { type: "USER", name: me.name } });
    revalidatePath("/settings");
    return { ok: true, message: `Added ${d.email}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function removeRecipientAction(id: string): Promise<ContactState> {
  try {
    const me = await assertAdmin();
    const r = await prisma.recipient.delete({ where: { id } });
    // Remove the address from saved reports too, so nothing can be sent to it later
    const reps = await prisma.report.findMany({ where: { recipients: { has: r.email } } });
    for (const rep of reps) await prisma.report.update({ where: { id: rep.id }, data: { recipients: rep.recipients.filter((e) => e !== r.email) } });
    await logChange({ entity: "recipient", entityId: id, field: "removed", oldValue: `${r.list} · ${r.email}`, newValue: null, actor: { type: "USER", name: me.name } });
    revalidatePath("/settings");
    return { ok: true, message: `Removed ${r.email}${reps.length ? ` (and from ${reps.length} report${reps.length > 1 ? "s" : ""})` : ""}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Internal domains: anyone @ these domains counts as internal (Internal reports only). */
export async function saveDomainsAction(raw: string): Promise<ContactState> {
  try {
    const me = await assertAdmin();
    const list = [...new Set(raw.split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))];
    if (list.some((d) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))) return { ok: false, message: "One of the domains doesn't look right" };
    const old = await prisma.setting.findUnique({ where: { key: "internalDomains" } });
    await prisma.setting.upsert({ where: { key: "internalDomains" }, create: { key: "internalDomains", value: list }, update: { value: list } });
    await logChange({ entity: "setting", entityId: "internalDomains", field: "value", oldValue: old?.value ?? null, newValue: list, actor: { type: "USER", name: me.name } });
    revalidatePath("/settings");
    return { ok: true, message: "Saved" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
