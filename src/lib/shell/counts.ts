import type { PageKey } from "@/components/ui/sections";
import { prisma } from "@/lib/db";

/** Menu count badges. Tasks = open tasks (added with the Tasks chunk); empty until then. */
export async function navCounts(): Promise<Partial<Record<PageKey, number>>> {
  void prisma;
  return {};
}
