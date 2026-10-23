import { NextResponse } from "next/server";
import { authorise, isResponse, monthParam } from "@/lib/apikeys";
import { ordersIn } from "@/lib/reports/data";

export const dynamic = "force-dynamic";

/** GET /api/v1/volumes?month=YYYY-MM — orders, units and average SKUs per client (WMS). Scope volumes:read. */
export async function GET(req: Request) {
  const who = await authorise(req, "volumes:read");
  if (isResponse(who)) return who;
  const month = monthParam(req.url);
  if (!month) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  const from = new Date(month + "-01T00:00:00Z");
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const rows = await ordersIn({ from, to, label: month });
  const by = new Map<string, { client: string; clientId: string | null; orders: number; units: number; skus: number }>();
  for (const o of rows) {
    const k = o.client.id;
    const r = by.get(k) ?? { client: o.client.name, clientId: k.startsWith("tenant:") ? null : k, orders: 0, units: 0, skus: 0 };
    r.orders++;
    r.units += o.units;
    r.skus += o.skus;
    by.set(k, r);
  }
  return NextResponse.json({ month, clients: [...by.values()].map((r) => ({ client: r.client, clientId: r.clientId, orders: r.orders, units: r.units, unitsPerOrder: r.orders ? r.units / r.orders : null, skusPerOrder: r.orders ? r.skus / r.orders : null })).sort((a, b) => b.orders - a.orders) });
}
