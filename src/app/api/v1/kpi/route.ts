import { NextResponse } from "next/server";
import { authorise, isResponse } from "@/lib/apikeys";
import { computeKpis, type Site } from "@/lib/kpi/compute";
import { KPIS, kpiStatus } from "@/lib/kpi/defs";

export const dynamic = "force-dynamic";

/** GET /api/v1/kpi?site=all|smi|par — 12 months per KPI, target and status. Scope kpi:read. */
export async function GET(req: Request) {
  const who = await authorise(req, "kpi:read");
  if (isResponse(who)) return who;
  const site = (new URL(req.url).searchParams.get("site") ?? "all") as Site;
  if (!["all", "smi", "par"].includes(site)) return NextResponse.json({ error: "site must be all, smi or par" }, { status: 400 });
  const d = await computeKpis(site);
  return NextResponse.json({
    site,
    months: d.months,
    kpis: KPIS.map((k) => {
      const v = d.values[k.id] ?? null;
      const target = d.targets[k.id];
      return { id: k.id, group: k.group, label: k.label, unit: k.unit, better: k.better, target, values: v, status: k.needs ? "needs-data" : kpiStatus(v?.at(-1) ?? null, target, k.better), needs: k.needs ?? null };
    }),
  });
}
