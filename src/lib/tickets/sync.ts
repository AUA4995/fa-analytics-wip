import { prisma } from "@/lib/db";
import { getRule } from "@/lib/model/store";
import { isFrontConfigured, listConversationsForScore } from "@/lib/front/client";
import { DEFAULT_TICKET_TYPES, lastWeeks, scoreTickets, type Department, type TypeDef } from "./score";

/**
 * Weekly weighted ticket scores per client (batch 3). Read-only on Front: lists the conversations from the client's
 * email domains each week, classifies them by tag (Settings → Ticket types) and stores count + score.
 */

export async function ensureTicketTypes(): Promise<void> {
  if ((await prisma.ticketType.count()) > 0) return;
  await prisma.ticketType.createMany({ data: DEFAULT_TICKET_TYPES.map((t, i) => ({ ...t, sortOrder: i })), skipDuplicates: true });
}

export async function loadTicketTypes(): Promise<TypeDef[]> {
  await ensureTicketTypes();
  const rows = await prisma.ticketType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return rows.map((r) => ({ name: r.name, department: r.department as Department, weight: r.weight, tags: r.tags }));
}

/** Seconds since 1970 of Sydney midnight on a YYYY-MM-DD day (AEST +10 or AEDT +11, whichever applies that day). */
export function sydneyMidnight(day: string): number {
  for (const off of ["+11:00", "+10:00"]) {
    const t = Date.parse(`${day}T00:00:00${off}`);
    const h = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", hourCycle: "h23" }).format(new Date(t));
    if (Number(h) === 0) return t / 1000;
  }
  return Date.parse(`${day}T00:00:00+10:00`) / 1000;
}

export function weekQuery(domains: string[], monday: string): string {
  const after = sydneyMidnight(monday);
  const next = new Date(Date.parse(`${monday}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const before = sydneyMidnight(next);
  const from = domains.map((d) => `from:@${d.replace(/^@/, "")}`).join(" OR ");
  return `${domains.length > 1 ? `(${from})` : from} after:${after} before:${before}`;
}

export async function syncTicketScores(weeks = 2, startedBy: string | null = null, now = new Date()): Promise<{ clients: number; weeks: number; tickets: number }> {
  if (!isFrontConfigured()) throw new Error("Front isn't connected (FRONT_API_TOKEN).");
  const run = await prisma.sourceRun.create({ data: { source: "front", label: `ticket scores · ${weeks} weeks`, startedBy } });
  try {
    const types = await loadTicketTypes();
    const rules = { weekStep: (await getRule("ticketWeekStep")) ?? 0.25, maxMultiplier: (await getRule("ticketMaxMultiplier")) ?? 3 };
    const clients = await prisma.client.findMany({ where: { status: { not: "INACTIVE" }, NOT: { frontDomains: { isEmpty: true } } }, select: { id: true, frontDomains: true } });
    let tickets = 0;
    const capped: string[] = [];
    // Open tickets keep getting heavier each week (duration multiplier), so re-score at least the last 12 weeks
    const ws = lastWeeks(Math.max(weeks, 12), now);
    for (const c of clients)
      for (const week of ws) {
        const convs = await listConversationsForScore(weekQuery(c.frontDomains, week));
        if (convs.length >= 2000) capped.push(`${c.id} ${week}`);
        const s = scoreTickets(convs, types, now, rules);
        tickets += s.tickets;
        const data = { tickets: s.tickets, score: s.score, supportScore: s.supportScore, accountsScore: s.accountsScore, byType: s.byType };
        await prisma.frontTicketWeek.upsert({ where: { clientId_week: { clientId: c.id, week } }, update: data, create: { clientId: c.id, week, ...data } });
      }
    const stats = { clients: clients.length, weeks: ws.length, tickets, ...(capped.length ? { warning: `More than 2,000 conversations in a week for ${capped.length} client-weeks — only the first 2,000 were scored` } : {}) };
    await prisma.sourceRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), stats } });
    return stats;
  } catch (err) {
    await prisma.sourceRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}

/** Support and accounts scores per client for a month (weeks whose Monday falls in that month). */
export async function monthScores(month: string): Promise<Map<string, { support: number; accounts: number }>> {
  const rows = await prisma.frontTicketWeek.findMany({ where: { week: { startsWith: month } } });
  const out = new Map<string, { support: number; accounts: number }>();
  for (const r of rows) {
    const cur = out.get(r.clientId) ?? { support: 0, accounts: 0 };
    cur.support += Number(r.supportScore);
    cur.accounts += Number(r.accountsScore);
    out.set(r.clientId, cur);
  }
  return out;
}
