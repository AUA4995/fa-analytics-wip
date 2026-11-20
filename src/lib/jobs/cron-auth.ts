import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron calls /api/cron/tick with `Authorization: Bearer <CRON_SECRET>` (the env variable of that name).
 * Anything else is refused — including every call when CRON_SECRET isn't set. Compared in constant time.
 */
export function isCronAuthorized(authorization: string | null | undefined, secret: string | null | undefined): boolean {
  const s = (secret ?? "").trim();
  if (s.length < 16) return false; // not set (or too short to be a secret)
  const given = (authorization ?? "").trim();
  const want = `Bearer ${s}`;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(want).digest();
  return timingSafeEqual(a, b) && given === want;
}
