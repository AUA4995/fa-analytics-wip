import { hitRateLimit, LIMITS } from "@/lib/auth/rate-limit";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SCOPE_KEYS } from "./scopes";

/** fa_live_<32 base62 chars>. Only the sha256 is stored; the key is shown once. */
export function generateKey(): { key: string; prefix: string; hash: string } {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = randomBytes(32);
  const body = Array.from(bytes, (b) => alphabet[b % 62]).join("");
  const key = `fa_live_${body}`;
  return { key, prefix: key.slice(0, 16), hash: hashKey(key) };
}
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function validScopes(scopes: string[]): boolean {
  return scopes.length > 0 && scopes.every((s) => SCOPE_KEYS.includes(s));
}

export interface ApiCaller {
  id: string;
  name: string;
  scopes: string[];
}

/**
 * Check the Bearer key for one scope. Returns the caller, or a JSON error response (401 / 403) to send back.
 * Every successful call is counted (last used, IP).
 */
export async function authorise(req: Request, scope: string): Promise<ApiCaller | NextResponse> {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(fa_live_[0-9A-Za-z]{32})$/);
  if (!m) return NextResponse.json({ error: "Missing or malformed API key (Authorization: Bearer fa_live_…)" }, { status: 401 });
  const hash = hashKey(m[1]);
  const row = await prisma.apiKey.findUnique({ where: { hash } });
  if (!row || !timingSafeEqual(Buffer.from(row.hash), Buffer.from(hash))) return NextResponse.json({ error: "Unknown API key" }, { status: 401 });
  if (row.revokedAt) return NextResponse.json({ error: "This API key was revoked" }, { status: 401 });
  if (row.expiresAt && row.expiresAt < new Date()) return NextResponse.json({ error: "This API key has expired" }, { status: 401 });
  if (!row.scopes.includes(scope)) return NextResponse.json({ error: `This key doesn't have the ${scope} scope` }, { status: 403 });
  const limit = await hitRateLimit("apiKey", row.id);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests for this key", detail: `At most ${LIMITS.apiKey.limit} calls a minute — try again in ${limit.retryAfterSec} s` }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date(), lastUsedIp: ip, uses: { increment: 1 } } });
  return { id: row.id, name: row.name, scopes: row.scopes };
}

export const isResponse = (x: ApiCaller | NextResponse): x is NextResponse => x instanceof NextResponse;

/** ?month=YYYY-MM (defaults to last complete month). */
export function monthParam(url: string): string | null {
  const m = new URL(url).searchParams.get("month");
  if (m == null) {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  }
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null;
}
