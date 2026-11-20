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
  /** Calls with a missing, unknown, revoked or expired key, per IP */
  apiBadIp: { limit: 30, windowSec: 15 * 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

export interface RateResult {
  ok: boolean;
  retryAfterSec: number;
}

export async function hitRateLimit(name: LimitName, who: string): Promise<RateResult> {
  const { limit, windowSec } = LIMITS[name];
  if (!who) return { ok: true, retryAfterSec: 0 }; // no trustworthy address: per-address limits don't apply
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

/**
 * Caller address for rate limits. X-Forwarded-For is set by whoever calls, so it is trusted only when the app runs
 * behind a proxy that sets it (TRUST_PROXY=1). Otherwise "" = unknown: per-address limits are skipped (one shared
 * bucket would let anyone lock everyone out); the per-email, per-account and per-key limits still apply.
 */
export function ipFromHeaders(get: (name: string) => string | null): string {
  // Vercel sets X-Forwarded-For itself (the caller can't), so it is trusted there too
  if (process.env.TRUST_PROXY !== "1" && !process.env.VERCEL) return "";
  // The proxy appends the address it saw on the right; anything to its left was typed by the caller
  const hops = (get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return (hops.at(-1) ?? get("x-real-ip")?.trim() ?? "local").slice(0, 100);
}

export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return ipFromHeaders((n) => h.get(n));
  } catch {
    return "";
  }
}

/** Is this limit already used up (without counting a new hit)? */
export async function isLimited(name: LimitName, who: string): Promise<boolean> {
  const { limit, windowSec } = LIMITS[name];
  if (!who) return false;
  const row = await prisma.authRateLimit.findUnique({ where: { key: `${name}:${who.toLowerCase().slice(0, 200)}` } });
  return !!row && row.count >= limit && row.windowStart.getTime() > Date.now() - windowSec * 1000;
}
