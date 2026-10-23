import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness + database check. Used by the Docker HEALTHCHECK. */
export async function GET() {
  const startedAt = Date.now();
  try {
    const [users, connections] = await Promise.all([prisma.user.count(), prisma.xeroConnection.count()]);
    return Response.json({ ok: true, db: "up", latencyMs: Date.now() - startedAt, counts: { users, xeroConnections: connections } });
  } catch (err) {
    return Response.json({ ok: false, db: "down", error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
