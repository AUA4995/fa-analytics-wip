import { NextResponse } from "next/server";
import { authorise, isResponse } from "@/lib/apikeys";
import { opsQuery } from "@/lib/ops/api";
import { dailyCounts } from "@/lib/ops/load";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/workload/daily?from=YYYY-MM-DD&to=YYYY-MM-DD[&site=smi] — orders created per client per day, from the
 * Thomax copy (Operations → Setup fields). For normal volume and weekday patterns. Scope volumes:read.
 */
export async function GET(req: Request) {
  const who = await authorise(req, "volumes:read");
  if (isResponse(who)) return who;
  const r = await opsQuery(req.url, ["dispatch"]);
  if (r instanceof NextResponse) return r;
  const { q, cfg } = r;
  const rows = await dailyCounts(cfg.flows.dispatch, q.from, q.to, { warehouses: q.warehouses });
  return NextResponse.json({
    from: q.from.toISOString().slice(0, 10),
    to: new Date(q.to.getTime() - 86_400_000).toISOString().slice(0, 10),
    site: q.site,
    timeZone: "Australia/Sydney (as Thomax records it)",
    days: rows.map((x) => ({ date: x.day, tenant: x.tenant, client: q.names.get(x.tenant) ?? null, orders: x.n })),
  });
}
