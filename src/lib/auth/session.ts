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
 *   full     twoFactorAt set. The only kind that signs anyone in.
 * Completing the 2FA step replaces the pending session with a new full one (new token).
 *
 * Sign-in rules (Asal, 25/10/2026):
 *   - at most SESSION_HOURS (8 h) from the password; then password + code again;
 *   - the cookie is a browser-session cookie: closing the browser / turning the computer off signs out
 *     (unless the browser is set to restore the previous session);
 *   - IDLE_MINUTES (60) without any activity locks the session: the next visit asks for the code only
 *     (not the password), within the same 8 hours.
 */

export const SESSION_COOKIE = "fan_session";
export const SESSION_HOURS = 8;
export const IDLE_MINUTES = 60;
const PENDING_MINUTES = 30;
/** lastSeenAt is written at most this often (avoids a database write on every request) */
const TOUCH_SECONDS = 60;
export const IDLE_LOCK = "idle-lock";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface PendingLogin {
  sessionId: string;
  /** Locked after an hour without activity: only the code is asked, the 8-hour limit is kept */
  idleLocked: boolean;
  capAt: Date | null;
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

export async function createSession(userId: string, stage: SessionStage, capAt?: Date | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const full = stage.stage === "full";
  const cap = full ? (capAt && capAt.getTime() > Date.now() ? capAt : new Date(Date.now() + SESSION_HOURS * 3_600_000)) : null;
  const expiresAt = cap ?? new Date(Date.now() + PENDING_MINUTES * 60_000);
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: ua,
      twoFactorAt: full ? new Date() : null,
      twoFactorMethod: full ? stage.method : null,
      capAt: cap,
    },
  });
  if (full) await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    // No expiry on the cookie: it lives until the browser closes. The 8-hour limit is enforced on the server.
  });
}

/** Activity rules on a full session: lock after IDLE_MINUTES without activity, otherwise record this visit. */
export function idleState(lastSeenAt: Date, now: Date): "locked" | "touch" | "fresh" {
  const gap = now.getTime() - lastSeenAt.getTime();
  if (gap > IDLE_MINUTES * 60_000) return "locked";
  return gap > TOUCH_SECONDS * 1000 ? "touch" : "fresh";
}

async function sessionFromCookie() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, name: true, role: true, active: true, totpEnabledAt: true } } },
    });
    const now = new Date();
    if (!session || session.expiresAt < now || !session.user.active) return null;
    if (session.twoFactorAt) {
      const st = idleState(session.lastSeenAt, now);
      if (st === "locked") {
        // Locked for inactivity: back to "code needed" (no password), still within the original 8 hours
        const cap = session.capAt ?? session.expiresAt;
        const locked = await prisma.session.update({
          where: { id: session.id },
          data: { twoFactorAt: null, twoFactorMethod: IDLE_LOCK, capAt: cap, expiresAt: new Date(Math.min(cap.getTime(), now.getTime() + PENDING_MINUTES * 60_000)) },
          include: { user: { select: { id: true, email: true, name: true, role: true, active: true, totpEnabledAt: true } } },
        });
        return locked;
      }
      if (st === "touch") await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => {});
    }
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
  return { sessionId: session.id, idleLocked: session.twoFactorMethod === IDLE_LOCK, capAt: session.capAt, user: { id, email, name, role, totpEnabled: !!totpEnabledAt }, enrolledNow: !!totpEnabledAt && session.twoFactorMethod === ENROLLED_MARK };
}

/** 2FA done: swap the pending session for a full one (fresh token, so the pre-2FA cookie is worthless). */
export async function completeTwoFactor(pending: PendingLogin, method: "code" | "backup" | "device" | "enrolled"): Promise<void> {
  await prisma.session.deleteMany({ where: { id: pending.sessionId } });
  await createSession(pending.user.id, { stage: "full", method }, pending.idleLocked ? pending.capAt : null);
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

/** "Stay signed in" from the inactivity warning: counts as activity. */
export async function touchSession(): Promise<boolean> {
  return !!(await getCurrentUser());
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
