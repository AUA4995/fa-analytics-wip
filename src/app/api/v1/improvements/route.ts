import { NextResponse } from "next/server";
import { authorise, isResponse } from "@/lib/apikeys";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/v1/improvements — ideas and initiatives with estimated / measured savings and steps. Scope improve:read. */
export async function GET(req: Request) {
  const who = await authorise(req, "improve:read");
  if (isResponse(who)) return who;
  const rows = await prisma.improvement.findMany({ include: { steps: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({
    items: rows.map((i) => ({ id: i.id, name: i.name, category: i.category, sub: i.sub, stage: i.stage, savingType: i.savingType, estimatedMonthly: i.estMonthly != null ? Number(i.estMonthly) : null, measuredMonthly: i.measuredMonthly != null ? Number(i.measuredMonthly) : null, owner: i.owner, reviewDue: i.reviewDue, startDate: i.startDate, dueDate: i.dueDate, steps: i.steps.map((s) => ({ name: s.name, start: s.start, due: s.due, owner: s.owner, status: s.status })) })),
  });
}
