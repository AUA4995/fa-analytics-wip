import { prisma } from "@/lib/db";
import { countConversations, isFrontConfigured } from "./client";

/**
 * Client-service effort for cost to serve (brief §6 account management): Front conversations per client per month,
 * matched by the client's email domains (Settings → Clients). Read-only; re-counts the current and previous month
 * nightly, or `months` back on demand.
 */
export function monthRange(month: string): { after: number; before: number } {
  const [y, m] = month.split("-").map(Number);
  return { after: Date.UTC(y, m - 1, 1) / 1000, before: Date.UTC(y, m, 1) / 1000 };
}

export function lastMonths(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

export function ticketQuery(domains: string[], month: string): string {
  const { after, before } = monthRange(month);
  const from = domains.map((d) => `from:@${d.replace(/^@/, "")}`).join(" OR ");
  return `${domains.length > 1 ? `(${from})` : from} after:${after} before:${before}`;
}

export async function syncFrontTickets(months = 2, startedBy: string | null = null): Promise<{ clients: number; months: number; tickets: number }> {
  if (!isFrontConfigured()) throw new Error("Front isn't connected (FRONT_API_TOKEN).");
  const run = await prisma.sourceRun.create({ data: { source: "front", label: `tickets · ${months} months`, startedBy } });
  try {
    const clients = await prisma.client.findMany({ where: { status: { not: "INACTIVE" }, NOT: { frontDomains: { isEmpty: true } } }, select: { id: true, frontDomains: true } });
    let tickets = 0;
    const ms = lastMonths(months);
    for (const c of clients)
      for (const month of ms) {
        const n = await countConversations(ticketQuery(c.frontDomains, month));
        tickets += n;
        await prisma.frontTicketMonth.upsert({ where: { clientId_month: { clientId: c.id, month } }, update: { tickets: n }, create: { clientId: c.id, month, tickets: n } });
      }
    const stats = { clients: clients.length, months: ms.length, tickets };
    await prisma.sourceRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), stats } });
    return stats;
  } catch (err) {
    await prisma.sourceRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}
