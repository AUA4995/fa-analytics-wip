import { authorise, isResponse } from "@/lib/apikeys";
import { NextResponse } from "next/server";
import { lastN, loadFinance, ratiosAt } from "@/lib/finance/load";

export const dynamic = "force-dynamic";

/** GET /api/v1/finance — company P&L by month (last 24) and bank ratios. No pay by person. Scope finance:read. */
export async function GET(req: Request) {
  const who = await authorise(req, "finance:read");
  if (isResponse(who)) return who;
  const d = await loadFinance();
  return NextResponse.json({ latestMonth: d.current, months: lastN(d.months, 24, d.current), ratios: d.current ? ratiosAt(d, d.current) : null, cash: d.bal.find((b) => b.month === d.current)?.cash ?? null });
}
