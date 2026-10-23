import type { PageKey } from "@/components/ui/sections";
import { prisma } from "@/lib/db";

/** Menu count badges: Tasks = open tasks + new notifications; Leakage = open findings. */
export async function navCounts(): Promise<Partial<Record<PageKey, number>>> {
  const now = new Date();
  const [tasks, notices, leaks] = await Promise.all([
    prisma.task.count({ where: { OR: [{ status: "OPEN" }, { status: "SNOOZED", snoozedUntil: { lt: now } }] } }),
    prisma.notification.count({ where: { state: "NEW" } }),
    prisma.leakageItem.count({ where: { status: "OPEN" } }),
  ]);
  return { tasks: tasks + notices, leakage: leaks };
}
