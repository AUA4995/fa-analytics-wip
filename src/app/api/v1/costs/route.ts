import { NextResponse } from "next/server";
import { authorise, isResponse, monthParam } from "@/lib/apikeys";
import { loadCostRun } from "@/lib/cost/load";

export const dynamic = "force-dynamic";

/** GET /api/v1/costs?month=YYYY-MM — base cost per order (TDABC / Full absorption) and margin per client. Scope costs:read. */
export async function GET(req: Request) {
  const who = await authorise(req, "costs:read");
  if (isResponse(who)) return who;
  const month = monthParam(req.url);
  if (!month) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  const run = await loadCostRun(month);
  const r = run.result;
  return NextResponse.json({
    month: run.month,
    base: { tdabc: r.base.T, fullAbsorption: r.base.F },
    unusedCapacity: { amount: r.unused.total, share: r.unused.pct },
    clients: r.clients.map((c) => ({ id: c.id, name: c.name, orders: c.orders, costTdabc: c.costT, costFull: c.costF, revenue: c.revenue, marginBasis: c.marginBasis, marginTdabc: c.marginT, marginFull: c.marginF, costPerOrderTdabc: c.cpoT, costPerOrderFull: c.cpoF })),
    warnings: r.warnings,
  });
}
