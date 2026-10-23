import { NextResponse } from "next/server";
import { authorise, isResponse } from "@/lib/apikeys";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/v1/leakage?status=open|recovered|all — findings with their working. Scope leakage:read. */
export async function GET(req: Request) {
  const who = await authorise(req, "leakage:read");
  if (isResponse(who)) return who;
  const status = new URL(req.url).searchParams.get("status") ?? "open";
  if (!["open", "recovered", "all"].includes(status)) return NextResponse.json({ error: "status must be open, recovered or all" }, { status: 400 });
  const where = status === "open" ? { status: { in: ["OPEN" as const, "TASK" as const] } } : status === "recovered" ? { status: "RECOVERED" as const } : {};
  const [rows, clients] = await Promise.all([prisma.leakageItem.findMany({ where, orderBy: { foundOn: "desc" }, take: 1000 }), prisma.client.findMany({ select: { id: true, name: true } })]);
  return NextResponse.json({
    findings: rows.map((r) => ({ id: r.id, kind: r.kind, client: clients.find((c) => c.id === r.clientId)?.name ?? null, clientId: r.clientId, service: r.serviceCode, period: r.period, expected: Number(r.expected), billed: Number(r.billed), gap: Number(r.gap), working: r.working, status: r.status, foundOn: r.foundOn, recoveredAmount: r.recoveredAmount != null ? Number(r.recoveredAmount) : null, recoveredInvoice: r.recoveredInvoice, recoveredOn: r.recoveredOn })),
  });
}
