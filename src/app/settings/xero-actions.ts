"use server";

import { revalidatePath } from "next/cache";
import { disconnect, getConnection } from "@/lib/xero/auth";
import { xeroGet } from "@/lib/xero/client";
import { assertAdmin, assertOwner, ownerName } from "@/lib/auth/session";
import { classifyCode, describeProblem, toRawFailure } from "@/lib/integrations/errors";
import { clearStatus, recordFailure, recordSuccess } from "@/lib/integrations/status";
import { getCompany } from "@/lib/company";

export type XeroActionState = { ok: boolean; message: string };

/** Read the organisation from Xero (read-only) to prove the connection works. The full sync comes with Data sources. */
export async function testXero(): Promise<XeroActionState> {
  try {
    await assertAdmin();
    const conn = await getConnection();
    if (!conn) return { ok: false, message: "Xero isn't connected yet." };
    const org = await xeroGet<{ Organisations?: Array<{ Name?: string; BaseCurrency?: string }> }>("/Organisation");
    await recordSuccess("xero");
    revalidatePath("/settings");
    const o = org.Organisations?.[0];
    return { ok: true, message: `Connected and readable: ${o?.Name ?? conn.tenantName}${o?.BaseCurrency ? ` (${o.BaseCurrency})` : ""}.` };
  } catch (err) {
    await recordFailure("xero", err).catch(() => undefined);
    revalidatePath("/settings");
    return { ok: false, message: await plainXeroError(err) };
  }
}

/** The reason in plain words + what to do (never a bare "failed"). */
async function plainXeroError(err: unknown): Promise<string> {
  if (err instanceof Error && /^(Only an admin|Not signed in)/.test(err.message)) return err.message;
  const f = toRawFailure(err);
  const p = describeProblem("xero", classifyCode("xero", f), f, { at: new Date(), timeZone: (await getCompany()).timezone, ownerName: await ownerName() });
  return `${p.reason}. ${p.action}`;
}

/** Owner only. */
export async function disconnectXero(): Promise<XeroActionState> {
  try {
    await assertOwner();
  } catch {
    return { ok: false, message: "Only the owner can connect or disconnect Xero." };
  }
  await disconnect();
  await clearStatus("xero");
  revalidatePath("/settings");
  return { ok: true, message: "Disconnected. Data already read is kept; connect again to resume." };
}
