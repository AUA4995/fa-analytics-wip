import { prisma } from "@/lib/db";
import { getRules } from "@/lib/model/store";

/**
 * Logiwa as a step / semi-variable cost (batch 3, 16/11/2026): a yearly plan of credits (800,000), one credit per
 * order of up to 25 unique lines (26–50 lines = 2 credits …), credits above the plan cost 150% of the plan price.
 * Tracker: credits used this contract year (Logiwa orders), and a projection if all current volume ran on Logiwa.
 * No dollar figure for overage — the plan price per credit isn't known here.
 */

export function creditsForOrder(lines: number, linesPerCredit: number): number {
  return Math.max(1, Math.ceil(Math.max(0, lines) / Math.max(1, linesPerCredit)));
}

/** Contract year containing `now` (start month 1–12); null start → the last 12 months. */
export function contractYear(startMonth: number | null, now: Date): { from: Date; to: Date; label: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  if (!startMonth) {
    // last 12 complete months
    const from = new Date(Date.UTC(y, m - 13, 1));
    return { from, to: new Date(Date.UTC(y, m - 1, 1)), label: "last 12 full months (set the contract start month in Rules)" };
  }
  const startYear = m >= startMonth ? y : y - 1;
  const from = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const to = new Date(Date.UTC(startYear + 1, startMonth - 1, 1));
  return { from, to, label: `${from.toISOString().slice(0, 7)} → ${new Date(to.getTime() - 86_400_000).toISOString().slice(0, 7)}` };
}

export interface LogiwaTracker {
  allowance: number;
  linesPerCredit: number;
  overage: number;
  year: { from: Date; to: Date; label: string };
  usedLogiwa: number;
  /** Credits a month if all orders (any WMS) ran on Logiwa — average of the last 3 complete months */
  monthlyAllVolume: number | null;
  projectedYear: number | null;
  projectedOver: number | null;
}

export function project(allowance: number, monthly: number | null): { projectedYear: number | null; projectedOver: number | null } {
  if (monthly == null) return { projectedYear: null, projectedOver: null };
  const projectedYear = Math.round(monthly * 12);
  return { projectedYear, projectedOver: Math.max(0, projectedYear - allowance) };
}

export async function loadLogiwaTracker(now = new Date()): Promise<LogiwaTracker> {
  const rules = await getRules();
  const allowance = rules.logiwaCreditsYear ?? 800_000;
  const lpc = rules.logiwaLinesPerCredit ?? 25;
  const year = contractYear(rules.logiwaStartMonth ?? null, now);
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from3 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const [used, recent] = await Promise.all([
    prisma.$queryRaw<Array<{ c: number | null }>>`SELECT SUM(GREATEST(1, CEIL(skus::numeric / ${lpc})))::float AS c FROM "OrderFact" WHERE source = 'LOGIWA' AND date >= ${year.from} AND date < ${year.to}`,
    prisma.$queryRaw<Array<{ m: string; c: number }>>`SELECT to_char(date, 'YYYY-MM') AS m, SUM(GREATEST(1, CEIL(skus::numeric / ${lpc})))::float AS c FROM "OrderFact" WHERE date >= ${from3} AND date < ${thisMonth} GROUP BY 1`,
  ]);
  const monthly = recent.length === 3 ? recent.reduce((a, r) => a + Number(r.c), 0) / 3 : null;
  return { allowance, linesPerCredit: lpc, overage: rules.logiwaOverage ?? 1.5, year, usedLogiwa: Number(used[0]?.c ?? 0), monthlyAllVolume: monthly, ...project(allowance, monthly) };
}
