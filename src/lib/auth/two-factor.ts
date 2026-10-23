import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { backupCodeCandidates, hashBackupCode, openSecret, sealSecret, signValue, verifySignedValue } from "./secrets";
import { newBackupCodes, newTotpSecret, normaliseBackupCode, normaliseCode, stepAt, verifyTotp } from "./totp";
import { secureCookies } from "./session";

/**
 * 2FA (Batch 2 item 32): TOTP authenticator app + 10 single-use backup codes, for everyone.
 * The TOTP secret is encrypted at rest; backup codes are stored as keyed hashes; a used code is removed.
 */

export const TRUST_COOKIE = "fan_2fa_trust";
export const DEVICE_COOKIE = "fan_device";
export const TRUST_HOURS = 8;

export class TwoFactorError extends Error {}

/** The secret being set up (made once, kept until confirmed so a page reload shows the same QR code). */
export async function getOrCreateEnrolmentSecret(userId: string): Promise<string> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpSecret: true, totpEnabledAt: true } });
  if (u.totpEnabledAt) throw new TwoFactorError("Two-step sign-in is already set up.");
  if (u.totpSecret) {
    try {
      return openSecret(u.totpSecret);
    } catch {
      /* key changed — make a new one */
    }
  }
  const secret = newTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: sealSecret(secret), totpLastStep: null } });
  return secret;
}

async function storeNewBackupCodes(userId: string): Promise<string[]> {
  const codes = newBackupCodes();
  const hashes = codes.map((c) => hashBackupCode(userId, normaliseBackupCode(c)!));
  await prisma.user.update({ where: { id: userId }, data: { backupCodes: hashes } });
  return codes;
}

/** First code from the app confirms the set-up. Returns the 10 backup codes (shown once). */
export async function confirmEnrolment(userId: string, code: string, now = new Date()): Promise<string[] | null> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpSecret: true, totpEnabledAt: true } });
  if (u.totpEnabledAt) throw new TwoFactorError("Two-step sign-in is already set up.");
  if (!u.totpSecret) throw new TwoFactorError("Start the set-up again — the key has expired.");
  const step = verifyTotp(openSecret(u.totpSecret), code, now.getTime());
  if (step === null) return null;
  const done = await prisma.user.updateMany({ where: { id: userId, totpEnabledAt: null }, data: { totpEnabledAt: now, totpLastStep: step } });
  if (done.count !== 1) throw new TwoFactorError("Two-step sign-in is already set up.");
  return storeNewBackupCodes(userId);
}

/**
 * Checks a 6-digit code (each code works once) or a backup code (removed when used).
 * Returns how it was checked, or null when wrong.
 */
export async function verifySecondFactor(userId: string, input: string, now = new Date()): Promise<"code" | "backup" | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true } });
  if (!u?.totpEnabledAt || !u.totpSecret) return null;
  const digits = normaliseCode(input);
  if (digits) {
    const step = verifyTotp(openSecret(u.totpSecret), digits, now.getTime(), u.totpLastStep);
    if (step === null) return null;
    // Atomic: two requests with the same code can't both win.
    const r = await prisma.user.updateMany({ where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
    return r.count === 1 ? "code" : null;
  }
  const backup = normaliseBackupCode(input);
  if (!backup) return null;
  for (const hash of backupCodeCandidates(userId, backup)) {
    const n = await prisma.$executeRaw`UPDATE "User" SET "backupCodes" = array_remove("backupCodes", ${hash}) WHERE "id" = ${userId} AND ${hash} = ANY("backupCodes")`;
    if (n === 1) return "backup";
  }
  return null;
}

/** New set of 10 backup codes (old ones stop working). Needs a current code from the app. */
export async function regenerateBackupCodes(userId: string, code: string): Promise<string[] | null> {
  const ok = await verifySecondFactor(userId, code);
  if (ok !== "code") return null;
  return storeNewBackupCodes(userId);
}

/** Turns 2FA off for a user: they set it up again at their next sign-in. Signs them out everywhere. */
export async function resetTwoFactor(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, backupCodes: [] } });
  await prisma.session.deleteMany({ where: { userId } });
}

export function currentStep(now = new Date()): number {
  return stepAt(now.getTime());
}

// ---------- "Don't ask again on this device for 8 hours" ----------

function trustPayload(userId: string, deviceId: string, expMs: number, enabledAt: Date): string {
  return `${userId}|${deviceId}|${expMs}|${enabledAt.getTime()}`;
}

/** Sets the signed device cookie: bound to this user, this browser's device id and this 2FA set-up; 8 hours. */
export async function rememberThisDevice(userId: string, enabledAt: Date): Promise<void> {
  const jar = await cookies();
  let deviceId = jar.get(DEVICE_COOKIE)?.value;
  if (!deviceId || !/^[A-Za-z0-9_-]{16,64}$/.test(deviceId)) {
    deviceId = randomBytes(18).toString("base64url");
    jar.set(DEVICE_COOKIE, deviceId, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: 400 * 86_400 });
  }
  const exp = Date.now() + TRUST_HOURS * 3_600_000;
  jar.set(TRUST_COOKIE, signValue(trustPayload(userId, deviceId, exp, enabledAt)), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires: new Date(exp),
  });
}

/** True when this browser has a valid 8-hour device cookie for this user and their current 2FA set-up. */
export async function isThisDeviceTrusted(userId: string, enabledAt: Date | null, now = Date.now()): Promise<boolean> {
  if (!enabledAt) return false;
  const jar = await cookies();
  const deviceId = jar.get(DEVICE_COOKIE)?.value;
  const payload = verifySignedValue(jar.get(TRUST_COOKIE)?.value);
  if (!deviceId || !payload) return false;
  const [u, d, exp, v] = payload.split("|");
  return u === userId && d === deviceId && Number(exp) > now && Number(v) === enabledAt.getTime();
}

export async function forgetThisDevice(): Promise<void> {
  (await cookies()).delete(TRUST_COOKIE);
}
