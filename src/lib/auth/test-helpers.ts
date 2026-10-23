import { prisma } from "@/lib/db";
import { createSession } from "./session";
import { sealSecret } from "./secrets";
import { base32Decode, newTotpSecret, totp } from "./totp";

/**
 * Tests only. Every helper throws outside Vitest / NODE_ENV=test, so none of this can weaken sign-in in the app.
 */
function testsOnly(name: string): void {
  if (!process.env.VITEST && process.env.NODE_ENV !== "test") throw new Error(`${name} is for tests only`);
}

/** A fully signed-in session (password + 2FA done). The cookie goes to the test's next/headers mock. */
export async function signInForTest(userId: string): Promise<void> {
  testsOnly("signInForTest");
  await createSession(userId, { stage: "full", method: "test" });
}

/** Turns 2FA on for a user without the screens. Returns the base32 secret so the test can make codes. */
export async function enrolForTest(userId: string): Promise<string> {
  testsOnly("enrolForTest");
  const secret = newTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: sealSecret(secret), totpEnabledAt: new Date(), totpLastStep: null } });
  return secret;
}

/** The authenticator code for `secret` now (+ `steps` × 30 s). */
export function codeForTest(secret: string, steps = 0): string {
  testsOnly("codeForTest");
  return totp(base32Decode(secret), Date.now() + steps * 30_000);
}

/**
 * The database allows one owner. Tests that need their own owner park any existing one as ADMIN and put it back after.
 */
export async function parkExistingOwner(): Promise<() => Promise<void>> {
  testsOnly("parkExistingOwner");
  const existing = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (existing) await prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
  return async () => {
    if (!existing) return;
    await prisma.user.updateMany({ where: { role: "OWNER", id: { not: existing.id } }, data: { role: "ADMIN" } });
    await prisma.user.update({ where: { id: existing.id }, data: { role: "OWNER" } }).catch(() => {});
  };
}

/** Saves a Setting and returns a function that puts the old value (or nothing) back. */
export async function withSetting(key: string, value: string): Promise<() => Promise<void>> {
  testsOnly("withSetting");
  const before = await prisma.setting.findUnique({ where: { key } });
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  return async () => {
    if (before) await prisma.setting.update({ where: { key }, data: { value: before.value as never } });
    else await prisma.setting.deleteMany({ where: { key } });
  };
}
