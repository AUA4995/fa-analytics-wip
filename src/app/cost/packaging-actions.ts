"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/** Packaging cost method (batch 3): AVERAGE now; PRECISE (real usage from Logiwa pack scans) once Logiwa is connected. */
export async function setPackagingMode(mode: "AVERAGE" | "PRECISE"): Promise<{ ok: boolean; message: string }> {
  try {
    const me = await assertAdmin();
    if (mode !== "AVERAGE" && mode !== "PRECISE") return { ok: false, message: "Unknown method" };
    await prisma.setting.upsert({ where: { key: "packagingMode" }, update: { value: mode }, create: { key: "packagingMode", value: mode } });
    await prisma.changeLog.create({ data: { entity: "setting", entityId: "packagingMode", field: "packagingMode", newValue: mode, actorType: "USER", actorName: me.name } }).catch(() => {});
    revalidatePath("/cost");
    return { ok: true, message: mode === "PRECISE" ? "Precise selected — awaiting Logiwa integration, so the average is still used." : "Average per order." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
