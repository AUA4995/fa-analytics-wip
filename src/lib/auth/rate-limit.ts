import { headers } from "next/headers";
import { prisma } from "@/lib/db";

/**
 * Fixed-window rate limits in the database (AuthRateLimit), so they hold across restarts and workers.
 * Keys: "<action>:<ip|email|user>:<value>".
 */

export const LIMITS = {
  loginIp: { limit: 30, windowSec: 15 * 60 },
  loginEmail: { limit: 8, windowSec: 15 * 60 },
  code: { limit: 6, windowSec: 15 * 60 },
  forgotIp: { limit: 10, windowSec: 60 * 60 },
  forgotEmail: { limit: 3, windowSec: 60 * 60 },
  requestIp: { limit: 5, windowSec: 60 * 60 },
  requestEmail: { limit: 3, windowSec: 24 * 60 * 60 },
  tokenIp: { limit: 30, windowSec: 15 * 60 },
  /** Per API key, all /api/v1 routes together */
  apiKey: { limit: 120, windowSec: 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

export interface RateResult {
  ok: boolean;
  retryAfterSec: number;
}

export async function hitRateLimit(name: LimitName, who: string): Promise<RateResult> {
  const { limit, windowSec } = LIMITS[name];
  const key = `${name}:${who.toLowerCase().slice(0, 200)}`;
  const rows = await prisma.$queryRaw<Array<{ count: number; retry: number }>>`
    INSERT INTO "AuthRateLimit" ("key", "count", "windowStart") VALUES (${key}, 1, (now() AT TIME ZONE 'UTC'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AuthRateLimit"."windowStart" < (now() AT TIME ZONE 'UTC') - make_interval(secs => ${windowSec}) THEN 1 ELSE "AuthRateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "AuthRateLimit"."windowStart" < (now() AT TIME ZONE 'UTC') - make_interval(secs => ${windowSec}) THEN (now() AT TIME ZONE 'UTC') ELSE "AuthRateLimit"."windowStart" END
    RETURNING "count", CEIL(EXTRACT(EPOCH FROM ("windowStart" + make_interval(secs => ${windowSec}) - (now() AT TIME ZONE 'UTC'))))::int AS "retry"`;
  if (Math.random() < 0.02) {
    await prisma.$executeRaw`DELETE FROM "AuthRateLimit" WHERE "windowStart" < (now() AT TIME ZONE 'UTC') - interval '2 days'`.catch(() => 0);
  }
  const r = rows[0];
  return { ok: (r?.count ?? 1) <= limit, retryAfterSec: Math.max(1, r?.retry ?? windowSec) };
}

export async function clearRateLimit(name: LimitName, who: string): Promise<void> {
  await prisma.authRateLimit.deleteMany({ where: { key: `${name}:${who.toLowerCase().slice(0, 200)}` } });
}

/** "Too many attempts — try again in 12 minutes." */
export function tooManyMessage(r: RateResult): string {
  const mins = Math.ceil(r.retryAfterSec / 60);
  return `Too many attempts — try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
}

/** Client IP for rate limits (first X-Forwarded-For hop when behind a proxy). */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim() || "local";
  } catch {
    return "local";
  }
}
