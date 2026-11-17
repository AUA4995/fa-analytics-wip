import { NextResponse } from "next/server";
import { flowReady, getOpsConfig, type FlowKey } from "./config";
import { siteCodes, tenantNames } from "./load";

/** Shared parameter handling for the Operations API routes (batch 6, for the HR app's Workforce Planning). */

const DAY = 86_400_000;
const isDay = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export interface OpsQuery {
  from: Date;
  to: Date;
  site: string | null;
  warehouses: string[] | null;
  names: Map<string, string>;
}

/** from / to (YYYY-MM-DD, to inclusive, at most 93 days), site (smi / par, optional). Errors → a 400 response. */
export async function opsQuery(url: string, flows: FlowKey[]): Promise<{ q: OpsQuery; cfg: Awaited<ReturnType<typeof getOpsConfig>> } | NextResponse> {
  const sp = new URL(url).searchParams;
  const f = sp.get("from");
  const t = sp.get("to");
  if (!isDay(f) || !isDay(t)) return NextResponse.json({ error: "from and to must be dates YYYY-MM-DD" }, { status: 400 });
  const from = new Date(`${f}T00:00:00Z`);
  const to = new Date(new Date(`${t}T00:00:00Z`).getTime() + DAY);
  if (to <= from) return NextResponse.json({ error: "to must be on or after from" }, { status: 400 });
  if (to.getTime() - from.getTime() > 93 * DAY) return NextResponse.json({ error: "at most 93 days per call" }, { status: 400 });
  const siteKey = sp.get("site");
  const sites = await siteCodes();
  const site = siteKey ? sites.find((s) => s.key === siteKey) : undefined;
  if (siteKey && !site) return NextResponse.json({ error: `site must be one of ${sites.map((s) => s.key).join(", ")}` }, { status: 400 });
  const cfg = await getOpsConfig();
  const missing = flows.filter((k) => !flowReady(cfg, k));
  if (missing.length) return NextResponse.json({ error: "not set up yet", detail: `Operations → Setup in Analytics: choose the Thomax fields for ${missing.join(", ")}` }, { status: 409 });
  // Never return all-site numbers labelled as one site
  if (site && !site.codes.length) return NextResponse.json({ error: "site filter not available", detail: `${site.name} has no WMS warehouse codes yet (Analytics → Settings → Sites). Leave out site= for all sites.` }, { status: 409 });
  const noWarehouse = site ? flows.filter((k) => !cfg.flows[k].roles.warehouse) : [];
  if (noWarehouse.length) return NextResponse.json({ error: "site filter not available", detail: `Operations → Setup in Analytics: choose the Warehouse field for ${noWarehouse.join(", ")}. Leave out site= for all sites.` }, { status: 409 });
  return { q: { from, to, site: site?.key ?? null, warehouses: site ? site.codes : null, names: await tenantNames() }, cfg };
}
