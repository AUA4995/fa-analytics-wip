import { NextResponse } from "next/server";
import { authorise, isResponse } from "@/lib/apikeys";
import { opsQuery } from "@/lib/ops/api";
import { loadFlow } from "@/lib/ops/load";

export const dynamic = "force-dynamic";

const wall = (d: Date | null) => (d ? d.toISOString().slice(0, 19) : null);

/**
 * GET /api/v1/inbound?from=YYYY-MM-DD&to=YYYY-MM-DD[&site=smi] — expected deliveries (ASN, by expected date) and
 * receipts (by arrival) from the Thomax copy. Times are Sydney wall-clock without a zone. Scope volumes:read.
 */
export async function GET(req: Request) {
  const who = await authorise(req, "volumes:read");
  if (isResponse(who)) return who;
  const r = await opsQuery(req.url, ["receiving", "expected"]);
  if (r instanceof NextResponse) return r;
  const { q, cfg } = r;
  const [exp, rec] = await Promise.all([loadFlow(cfg.flows.expected, q.from, q.to, { warehouses: q.warehouses }), loadFlow(cfg.flows.receiving, q.from, q.to, { warehouses: q.warehouses })]);
  const item = (x: (typeof exp.rows)[number]) => ({ tenant: x.tenant, client: q.names.get(x.tenant) ?? null, reference: x.ref, type: x.type, warehouse: x.warehouse });
  return NextResponse.json({
    from: q.from.toISOString().slice(0, 10),
    to: new Date(q.to.getTime() - 86_400_000).toISOString().slice(0, 10),
    site: q.site,
    truncated: exp.capped || rec.capped,
    expected: exp.rows.map((x) => ({ ...item(x), expectedAt: wall(x.created) })),
    receipts: rec.rows.map((x) => ({ ...item(x), arrivedAt: wall(x.created), receivedAt: wall(x.done) })),
  });
}
