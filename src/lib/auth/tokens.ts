import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { AuthTokenPurpose } from "@/generated/prisma/enums";
import { hashToken } from "./session";

/**
 * One-time email links (Batch 2 items 2, 30, 31, 33). Raw tokens are 32 random bytes in the link only;
 * the database keeps the SHA-256. Every token is single use and expires.
 */

export const TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  INVITE: 7 * 86_400_000,
  RESET: 2 * 3_600_000,
  ACCESS_APPROVE: 7 * 86_400_000,
  TWO_FACTOR_RESET: 2 * 3_600_000,
};

export async function createAuthToken(opts: {
  purpose: AuthTokenPurpose;
  userId?: string;
  accessRequestId?: string;
  createdById?: string;
  /** Unused links of the same purpose for the same user stop working (default true) */
  replacePrevious?: boolean;
  now?: Date;
}): Promise<string> {
  const now = opts.now ?? new Date();
  if (opts.userId && opts.replacePrevious !== false) {
    await prisma.authToken.updateMany({ where: { userId: opts.userId, purpose: opts.purpose, usedAt: null }, data: { usedAt: now } });
  }
  const raw = randomBytes(32).toString("base64url");
  await prisma.authToken.create({
    data: {
      purpose: opts.purpose,
      tokenHash: hashToken(raw),
      userId: opts.userId ?? null,
      accessRequestId: opts.accessRequestId ?? null,
      createdById: opts.createdById ?? null,
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[opts.purpose]),
    },
  });
  return raw;
}

export type TokenCheck =
  | { ok: true; token: NonNullable<Awaited<ReturnType<typeof loadToken>>> }
  | { ok: false; reason: "unknown" | "used" | "expired" };

function loadToken(raw: string) {
  return prisma.authToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: {
      user: { select: { id: true, email: true, name: true, role: true, active: true, passwordSetAt: true } },
      accessRequest: true,
    },
  });
}

/** Looks a link up without using it. */
export async function checkAuthToken(raw: string | null | undefined, purposes: AuthTokenPurpose[], now = new Date()): Promise<TokenCheck> {
  if (!raw || raw.length < 20 || raw.length > 100) return { ok: false, reason: "unknown" };
  const token = await loadToken(raw);
  if (!token || !purposes.includes(token.purpose)) return { ok: false, reason: "unknown" };
  if (token.usedAt) return { ok: false, reason: "used" };
  if (token.expiresAt <= now) return { ok: false, reason: "expired" };
  return { ok: true, token };
}

/** Marks a link used. False when someone used it first (or it expired) — callers must stop then. */
export async function consumeAuthToken(id: string, now = new Date()): Promise<boolean> {
  const r = await prisma.authToken.updateMany({ where: { id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  return r.count === 1;
}

export function tokenProblemMessage(reason: "unknown" | "used" | "expired", what: string): string {
  if (reason === "used") return `This ${what} link has already been used. Ask for a new one if you still need it.`;
  if (reason === "expired") return `This ${what} link has expired. Ask for a new one.`;
  return `This ${what} link isn't valid. Check you copied the whole link, or ask for a new one.`;
}
