"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { completeTwoFactor, destroySession, ENROLLED_MARK, getPendingLogin } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/paths";
import { clearRateLimit, hitRateLimit, tooManyMessage } from "@/lib/auth/rate-limit";
import { confirmEnrolment, rememberThisDevice, TwoFactorError, verifySecondFactor } from "@/lib/auth/two-factor";

export type CodeFormState = { error?: string; codes?: string[]; next?: string };

const WRONG_CODE = "That code didn't work. Use the newest code in your authenticator app (phone clock set automatically), or one of your backup codes.";

/** Login step 2: 6-digit code or a backup code. */
export async function verifyLoginCode(_prev: CodeFormState, formData: FormData): Promise<CodeFormState> {
  const pending = await getPendingLogin();
  if (!pending) redirect("/login");
  const next = safeNext(String(formData.get("next") ?? ""));
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the 6-digit code from your authenticator app." };
  const limit = await hitRateLimit("code", `user:${pending.user.id}`);
  if (!limit.ok) return { error: tooManyMessage(limit) };
  const method = await verifySecondFactor(pending.user.id, code);
  if (!method) return { error: WRONG_CODE };
  await clearRateLimit("code", `user:${pending.user.id}`);
  await completeTwoFactor(pending, method);
  if (formData.get("remember") === "on") {
    const u = await prisma.user.findUnique({ where: { id: pending.user.id }, select: { totpEnabledAt: true } });
    if (u?.totpEnabledAt) await rememberThisDevice(pending.user.id, u.totpEnabledAt);
  }
  redirect(next);
}

/** First sign-in after the release (or after a 2FA reset): confirm the authenticator with one code, then show backup codes. */
export async function confirmTwoFactorSetup(_prev: CodeFormState, formData: FormData): Promise<CodeFormState> {
  const pending = await getPendingLogin();
  if (!pending) redirect("/login");
  const next = safeNext(String(formData.get("next") ?? ""));
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) return { error: "Enter the 6-digit code your authenticator app shows for FA Analytics." };
  const limit = await hitRateLimit("code", `user:${pending.user.id}`);
  if (!limit.ok) return { error: tooManyMessage(limit) };
  let codes: string[] | null;
  try {
    codes = await confirmEnrolment(pending.user.id, code);
  } catch (err) {
    if (err instanceof TwoFactorError) return { error: err.message };
    throw err;
  }
  if (!codes) return { error: "That code didn't match. Check you scanned this page's QR code (or typed the key) and use the newest code." };
  await clearRateLimit("code", `user:${pending.user.id}`);
  // Stay on the pending session while the backup codes are on screen (signing in fully here would swap the page
  // into the app shell and lose them). Only this marker — set after a correct code — lets "Continue" finish.
  await prisma.session.update({ where: { id: pending.sessionId }, data: { twoFactorMethod: ENROLLED_MARK } });
  if (formData.get("remember") === "on") {
    const u = await prisma.user.findUnique({ where: { id: pending.user.id }, select: { totpEnabledAt: true } });
    if (u?.totpEnabledAt) await rememberThisDevice(pending.user.id, u.totpEnabledAt);
  }
  return { codes, next };
}

/** "I've saved them — continue": finishes the sign-in after a set-up confirmed on this same session. */
export async function finishTwoFactorSetup(formData: FormData): Promise<void> {
  const pending = await getPendingLogin();
  if (!pending) redirect("/login");
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!pending.enrolledNow) redirect(`/login${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}`);
  await completeTwoFactor(pending, "enrolled");
  redirect(next);
}

export async function cancelLogin(): Promise<void> {
  await destroySession();
  redirect("/login");
}
