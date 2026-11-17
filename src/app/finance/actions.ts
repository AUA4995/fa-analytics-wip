"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { logChange } from "@/lib/model/store";
import { plainError } from "@/lib/plain-error";

export type DebtState = { ok: boolean; message: string };
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[$,\s%]/g, "");
  return s === "" ? null : Number(s);
};

const Debt = z.object({
  name: z.string().trim().min(1, "Name the facility"),
  lender: z.string().trim().max(80).nullable(),
  limit: z.number().nonnegative().nullable(),
  balance: z.number({ message: "Balance is required" }).nonnegative(),
  rate: z.number().min(0).max(40).nullable(),
  principalMonthly: z.number().nonnegative(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  security: z.string().trim().max(200).nullable(),
});

/** Debt schedule rows are entered by hand (the bank's statement, not Xero). */
export async function addDebtAction(_p: DebtState | null, fd: FormData): Promise<DebtState> {
  try {
    const me = await assertAdmin();
    const v = Debt.safeParse({
      name: String(fd.get("name") ?? ""),
      lender: String(fd.get("lender") ?? "") || null,
      limit: num(fd.get("limit")),
      balance: num(fd.get("balance")),
      rate: num(fd.get("rate")),
      principalMonthly: num(fd.get("principalMonthly")) ?? 0,
      endDate: String(fd.get("endDate") ?? "") || null,
      security: String(fd.get("security") ?? "") || null,
    });
    if (!v.success) return { ok: false, message: v.error.issues[0].message };
    const d = v.data;
    const row = await prisma.debtFacility.create({ data: { ...d, rate: d.rate != null ? d.rate / 100 : null, endDate: d.endDate ? new Date(d.endDate + "T00:00:00Z") : null, createdBy: me.name } });
    await logChange({ entity: "debt", entityId: row.id, field: "added", oldValue: null, newValue: `${d.name} · $${d.balance}`, actor: { type: "USER", name: me.name } });
    revalidatePath("/finance");
    return { ok: true, message: "Added" };
  } catch (err) {
    return { ok: false, message: plainError(err) };
  }
}

export async function deleteDebtAction(id: string): Promise<DebtState> {
  try {
    const me = await assertAdmin();
    const r = await prisma.debtFacility.delete({ where: { id } });
    await logChange({ entity: "debt", entityId: id, field: "removed", oldValue: `${r.name} · $${r.balance}`, newValue: null, actor: { type: "USER", name: me.name } });
    revalidatePath("/finance");
    return { ok: true, message: "Removed" };
  } catch (err) {
    return { ok: false, message: plainError(err) };
  }
}
