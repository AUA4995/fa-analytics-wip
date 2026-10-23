import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isAdminRole, isOwnerRole, type Role } from "./roles";

/**
 * Database-backed sessions. The cookie holds a random token; only its SHA-256 is stored.
 * Pages, server actions and route handlers must call requireUser()/requireAdmin()/requireOwner() (or the assert*
 * versions) — src/proxy.ts only does a fast "has a cookie" redirect.
 *
 * Two stages (Batch 2 item 32 — 2FA for everyone):
 *   pending  password OK, 6-digit code (or 2FA set-up) still needed. 30 minutes. getCurrentUser() ignores it.
 *   full     twoFactorAt set. 14 days. The only kind that signs anyone in.
 * Completing the 2FA step replaces the pending session with a new full one (new token).
 */

export const SESSION_COOKIE = "fan_session";
const SESSION_DAYS = 14;
const PENDING_MINUTES = 30;

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface PendingLogin {
  sessionId: string;
  user: CurrentUser & { totpEnabled: boolean };
  /** 2FA was just set up on this very session (codes on screen); "Continue" finishes the sign-in. */
  enrolledNow: boolean;
}

/** Marker on a pending session after a successful 2FA set-up (only confirmTwoFactorSetup sets it). */
export const ENROLLED_MARK = "enrolled-awaiting-continue";

export type SessionStage = { stage: "pending" } | { stage: "full"; method: "code" | "backup" | "device" | "enrolled" | "test" };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function secureCookies(): boolean {
  return (process.env.APP_URL ?? "").startsWith("https://");
}

export async function createSession(userId: string, stage: SessionStage): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const full = stage.stage === "full";
  const expiresAt = new Date(Date.now() + (full ? SESSION_DAYS * 86_400_000 : PENDING_MINUTES * 60_000));
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: ua,
      twoFactorAt: full ? new Date() : null,
      twoFactorMethod: full ? stage.method : null,
    },
  });
  if (full) await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires: expiresAt,
  });
}

async function sessionFromCookie() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, name: true, role: true, active: true, totpEnabledAt: true } } },
    });
    if (!session || session.expiresAt < new Date() || !session.user.active) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await sessionFromCookie();
  // A session counts only once the 2FA step is done.
  if (!session || !session.twoFactorAt) return null;
  const { id, email, name, role } = session.user;
  return { id, email, name, role };
}

/** Password accepted, 2FA step (or set-up) still to do. */
export async function getPendingLogin(): Promise<PendingLogin | null> {
  const session = await sessionFromCookie();
  if (!session || session.twoFactorAt) return null;
  const { id, email, name, role, totpEnabledAt } = session.user;
  return { sessionId: session.id, user: { id, email, name, role, totpEnabled: !!totpEnabledAt }, enrolledNow: !!totpEnabledAt && session.twoFactorMethod === ENROLLED_MARK };
}

/** 2FA done: swap the pending session for a full one (fresh token, so the pre-2FA cookie is worthless). */
export async function completeTwoFactor(pending: PendingLogin, method: "code" | "backup" | "device" | "enrolled"): Promise<void> {
  await prisma.session.deleteMany({ where: { id: pending.sessionId } });
  await createSession(pending.user.id, { stage: "full", method });
}

/** For pages: redirects to /login when signed out (the login page sends a half-done sign-in to its 2FA step). */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isAdminRole(user.role)) redirect("/");
  return user;
}

export async function requireOwner(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isOwnerRole(user.role)) redirect("/");
  return user;
}

/** For server actions / route handlers: throws instead of redirecting. */
export class AuthError extends Error {}

export async function assertUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not signed in — please sign in again.");
  return user;
}

export async function assertAdmin(): Promise<CurrentUser> {
  const user = await assertUser();
  if (!isAdminRole(user.role)) throw new AuthError("Only an admin can do that.");
  return user;
}

export async function assertOwner(): Promise<CurrentUser> {
  const user = await assertUser();
  if (!isOwnerRole(user.role)) throw new AuthError("Only the owner can do that.");
  return user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function userCount(): Promise<number> {
  return prisma.user.count();
}

/** Name of the owner, for "ask <owner> to connect". */
export async function ownerName(): Promise<string> {
  const owner = await prisma.user.findFirst({ where: { role: "OWNER" }, select: { name: true } }).catch(() => null);
  return owner?.name ?? "the owner";
}
