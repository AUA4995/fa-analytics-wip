"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertOwner } from "@/lib/auth/session";
import { isFrontConfigured, listChannels } from "@/lib/front/client";
import { recordFailure, recordSuccess } from "@/lib/integrations/status";
import { plainError } from "@/lib/plain-error";

export type FrontActionState = { ok: boolean; message: string };

/** Owner: read the Front channels (read-only call) so one can be picked for sending emails. */
export async function loadFrontChannels(): Promise<FrontActionState> {
  try {
    await assertOwner();
    if (!isFrontConfigured()) return { ok: false, message: "Add FRONT_API_TOKEN to .env, then restart the app." };
    const channels = await listChannels();
    const value = channels.filter((c) => !!c.address).map((c) => ({ id: c.id, name: c.name, address: c.address }));
    await prisma.setting.upsert({ where: { key: "frontChannels" }, update: { value }, create: { key: "frontChannels", value } });
    await recordSuccess("front");
    revalidatePath("/settings");
    return { ok: true, message: `${value.length} channels found.` };
  } catch (err) {
    await recordFailure("front", err).catch(() => undefined);
    return { ok: false, message: plainError(err) };
  }
}

/** Owner: the Front channel used for sign-in emails and (later) report emails. */
export async function setFrontSendChannel(_prev: FrontActionState | null, formData: FormData): Promise<FrontActionState> {
  try {
    await assertOwner();
    const id = String(formData.get("channelId") ?? "");
    await prisma.setting.upsert({ where: { key: "frontSendChannelId" }, update: { value: id }, create: { key: "frontSendChannelId", value: id } });
    revalidatePath("/settings");
    return { ok: true, message: id ? "Saved." : "Cleared." };
  } catch (err) {
    return { ok: false, message: plainError(err) };
  }
}
