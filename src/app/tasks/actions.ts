"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";
import { resolveTask, snoozeTask } from "@/lib/tasks";
import { addFromNotification } from "@/lib/tasks/notices";

export type TaskState = { ok: boolean; message: string };
const refresh = () => {
  revalidatePath("/tasks");
  revalidatePath("/", "layout");
};

export async function resolveTaskAction(id: string, note: string): Promise<TaskState> {
  const me = await assertUser();
  const r = await resolveTask(id, me.name, note);
  refresh();
  return { ok: r.ok, message: r.ok ? r.message : `${r.message} — snoozed for 24 hours; it's checked again after each sync.` };
}

export async function snoozeTaskAction(id: string): Promise<TaskState> {
  const me = await assertUser();
  await snoozeTask(id, me.name, 48);
  refresh();
  return { ok: true, message: "Snoozed 48 hours." };
}

export async function addFromNoticeAction(id: string, form: Record<string, string>): Promise<TaskState> {
  const me = await assertUser();
  const r = await addFromNotification(id, form, { type: "USER", name: me.name });
  refresh();
  revalidatePath("/settings");
  return r;
}

export async function dismissNoticeAction(id: string): Promise<TaskState> {
  await assertUser();
  await prisma.notification.update({ where: { id }, data: { state: "DISMISSED" } });
  refresh();
  return { ok: true, message: "Dismissed." };
}
