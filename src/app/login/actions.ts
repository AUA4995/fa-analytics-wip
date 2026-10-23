"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, userCount } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/paths";
import { clearRateLimit, clientIp, hitRateLimit, tooManyMessage } from "@/lib/auth/rate-limit";
import { isAuthKeyConfigured } from "@/lib/auth/secrets";
import { isThisDeviceTrusted } from "@/lib/auth/two-factor";

export type AuthFormState = { error?: string; email?: string; name?: string };

// Dummy hash so unknown emails take the same time as wrong passwords.
let dummyHash: Promise<string> | null = null;

const NOT_SET_UP = "Sign-in isn't set up on this server yet: add AUTH_SECRET to .env (see .env.example) and restart the app.";

/** Step 1: email + password. Step 2 (code, or 2FA set-up) is /login/verify or /login/setup-2fa. */
export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!email || !password) return { error: "Enter your email and password.", email };

  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([hitRateLimit("loginIp", ip), hitRateLimit("loginEmail", email)]);
  if (!byIp.ok || !byEmail.ok) return { error: tooManyMessage(byIp.ok ? byEmail : byIp), email };

  const user = await prisma.user.findUnique({ where: { email } });
  dummyHash ??= hashPassword("timing-equaliser-not-a-real-password");
  // An invited user has no password yet (passwordHash "") — verifyPassword is false for it.
  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : (await verifyPassword(password, await dummyHash), false);
  if (!user || !ok || !user.active) {
    await new Promise((r) => setTimeout(r, 400));
    return { error: user && ok && !user.active ? "This account is deactivated — ask an admin." : "Email or password is incorrect.", email };
  }
  if (!isAuthKeyConfigured()) return { error: NOT_SET_UP, email };
  await clearRateLimit("loginEmail", email);

  const q = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  if (user.totpEnabledAt && (await isThisDeviceTrusted(user.id, user.totpEnabledAt))) {
    await createSession(user.id, { stage: "full", method: "device" });
    redirect(next);
  }
  await createSession(user.id, { stage: "pending" });
  redirect(user.totpEnabledAt ? `/login/verify${q}` : `/login/setup-2fa${q}`);
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

const SetupForm = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string(),
  confirm: z.string(),
});

/** First-run only: creates the first user as the OWNER when there are no users yet, then 2FA set-up. */
export async function setupFirstAdmin(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if ((await userCount()) > 0) return { error: "Setup is already done — sign in instead." };
  const keep = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") };
  const parsed = SetupForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, ...keep };
  const { name, email, password, confirm } = parsed.data;
  const problem = passwordProblem(password);
  if (problem) return { error: problem, ...keep };
  if (password !== confirm) return { error: "Passwords don't match.", ...keep };
  if (!isAuthKeyConfigured()) return { error: NOT_SET_UP, ...keep };

  const passwordHash = await hashPassword(password);
  const created = await prisma.$transaction(async (tx) => {
    if ((await tx.user.count()) > 0) return null;
    return tx.user.create({ data: { name, email, passwordHash, passwordSetAt: new Date(), role: "OWNER" } });
  });
  if (!created) return { error: "Setup is already done — sign in instead." };
  await createSession(created.id, { stage: "pending" });
  redirect("/login/setup-2fa?next=%2Fsettings");
}
