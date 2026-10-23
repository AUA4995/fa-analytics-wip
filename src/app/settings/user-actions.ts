"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { AuthError, assertAdmin, assertOwner, assertUser, type CurrentUser } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/roles";
import { approveAccessRequest, declineAccessRequest, inviteUser, sendInvite, sendResetLink, type LinkOutcome } from "@/lib/auth/flows";
import { forgetThisDevice, regenerateBackupCodes, resetTwoFactor, verifySecondFactor } from "@/lib/auth/two-factor";
import { hitRateLimit, tooManyMessage } from "@/lib/auth/rate-limit";
import { setAccessDomain } from "@/lib/auth/domain";

/**
 * Users (Batch 2 items 1, 2, 31, 32). Every rule is enforced here, whatever the screen shows:
 *   • nobody changes the owner's role, resets the owner's password/2FA or deactivates the owner
 *   • only the owner makes or removes admins, resets 2FA, approves access requests and transfers ownership
 *   • admins add, deactivate and reset USERs only
 *   • no temporary passwords: invites and resets are one-time email links
 */

export type UserActionState = {
  ok: boolean;
  message: string;
  /** One-time link, only when the email could not be sent */
  link?: string;
  linkNote?: string;
  /** New backup codes (shown once) */
  codes?: string[];
  values?: { name: string; email: string; role: string };
};

const fail = (message: string): UserActionState => ({ ok: false, message });

async function run(fn: () => Promise<UserActionState>): Promise<UserActionState> {
  try {
    return await fn();
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

async function target(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new AuthError("That user no longer exists.");
  return u;
}

/** Can `me` manage this person's account (reset, invite again, deactivate)? null = yes, else why not. */
function manageProblem(me: CurrentUser, t: { id: string; role: string; name: string }, what: string): string | null {
  if (isOwnerRole(t.role)) return `No one can ${what} the owner.`;
  if (t.role === "ADMIN" && !isOwnerRole(me.role)) return `Only the owner can ${what} an admin.`;
  return null;
}

function linkMessage(name: string, email: string, out: LinkOutcome, sentText: string, days: string): Pick<UserActionState, "message" | "link" | "linkNote"> {
  if (out.mail.sent) return { message: `${sentText} ${email}.` };
  return {
    message: `The email to ${email} wasn't sent: ${out.mail.reason}.`,
    link: out.link,
    linkNote: `Copy this link and send it to ${name.split(" ")[0]} yourself. It's shown only once and works for ${days}.`,
  };
}

const AddUser = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["ADMIN", "USER"], { message: "Pick User or Admin" }),
});

/** Adds a user with no password and emails them a 7-day "Set your password" link. */
export async function addUser(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const values = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? ""), role: String(formData.get("role") ?? "USER") };
  return run(async () => {
    const me = await assertAdmin();
    const parsed = AddUser.safeParse(values);
    if (!parsed.success) return { ...fail(parsed.error.issues[0]?.message ?? "Check the form."), values };
    if (parsed.data.role === "ADMIN" && !isOwnerRole(me.role)) return { ...fail("Only the owner can add admins."), values };
    if (await prisma.user.findUnique({ where: { email: parsed.data.email } })) return { ...fail("A user with that email already exists."), values };
    const out = await inviteUser({ ...parsed.data, byId: me.id, byName: me.name });
    revalidatePath("/settings");
    const lm = linkMessage(parsed.data.name, parsed.data.email, out, `${parsed.data.name} added — invitation emailed to`, "7 days");
    return { ok: true, ...lm, message: out.mail.sent ? lm.message : `${parsed.data.name} added. ${lm.message}` };
  });
}

/** Emails a 2-hour reset link (never on the owner). */
export async function resetUserPassword(userId: string): Promise<UserActionState> {
  return run(async () => {
    const me = await assertAdmin();
    const t = await target(userId);
    if (t.id === me.id) return fail("Use My password below to change your own password.");
    const problem = manageProblem(me, t, "reset the password of");
    if (problem) return fail(isOwnerRole(t.role) ? "No one can reset the owner's password. The owner can use Forgot password? on the sign-in page." : problem);
    if (!t.active) return fail(`Re-activate ${t.name} first.`);
    if (!t.passwordSetAt) return fail(`${t.name} hasn't set a password yet — use Send invite again.`);
    const out = await sendResetLink(t.id, me.id, me.name);
    return { ok: true, ...linkMessage(t.name, t.email, out, "Reset link emailed to", "2 hours") };
  });
}

/** New invitation link for someone who hasn't set a password yet (old links stop working). */
export async function resendInvite(userId: string): Promise<UserActionState> {
  return run(async () => {
    const me = await assertAdmin();
    const t = await target(userId);
    const problem = manageProblem(me, t, "invite");
    if (problem) return fail(problem);
    if (t.passwordSetAt) return fail(`${t.name} has already set a password — use Reset password instead.`);
    if (!t.active) return fail(`Re-activate ${t.name} first.`);
    const out = await sendInvite(t.id, me.id, me.name);
    return { ok: true, ...linkMessage(t.name, t.email, out, "New invitation emailed to", "7 days") };
  });
}

export async function setUserActive(userId: string, active: boolean): Promise<UserActionState> {
  return run(async () => {
    const me = await assertAdmin();
    if (userId === me.id && !active) return fail("You can't deactivate yourself.");
    const t = await target(userId);
    const problem = manageProblem(me, t, active ? "re-activate" : "deactivate");
    if (problem) return fail(problem);
    await prisma.user.update({ where: { id: userId }, data: { active } });
    if (!active) await prisma.session.deleteMany({ where: { userId } });
    revalidatePath("/settings");
    return { ok: true, message: active ? `${t.name} re-activated.` : `${t.name} deactivated and signed out.` };
  });
}

/** Owner only: make someone an admin or a user. */
export async function setUserRole(userId: string, role: "ADMIN" | "USER"): Promise<UserActionState> {
  return run(async () => {
    const me = await assertOwner().catch(() => {
      throw new AuthError("Only the owner can make or remove admins.");
    });
    if (role !== "ADMIN" && role !== "USER") return fail("Pick User or Admin.");
    if (userId === me.id) return fail("You can't change your own role.");
    const t = await target(userId);
    if (isOwnerRole(t.role)) return fail("No one can change the owner's role.");
    await prisma.user.update({ where: { id: userId }, data: { role } });
    revalidatePath("/settings");
    return { ok: true, message: `${t.name} is now ${role === "ADMIN" ? "an admin" : "a user"}.` };
  });
}

/** Owner only: turn off someone's 2FA so they set it up again at their next sign-in. */
export async function resetUserTwoFactor(userId: string): Promise<UserActionState> {
  return run(async () => {
    const me = await assertOwner();
    const t = await target(userId);
    if (t.id === me.id || isOwnerRole(t.role)) return fail("You can't reset your own two-step sign-in here — use a backup code, or the emergency command (npm run owner:recover).");
    await resetTwoFactor(t.id);
    revalidatePath("/settings");
    return { ok: true, message: `${t.name}'s two-step sign-in was reset and they were signed out. They'll set it up again next time they sign in.` };
  });
}

/** Owner only: hand the owner role to an active admin, confirmed with the owner's own 2FA code. */
export async function transferOwnership(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  return run(async () => {
    const me = await assertOwner();
    const userId = String(formData.get("userId") ?? "");
    const code = String(formData.get("code") ?? "");
    const t = await target(userId);
    if (t.id === me.id) return fail("You're already the owner.");
    if (t.role !== "ADMIN" || !t.active) return fail("Ownership can only go to an active admin. Make them an admin first.");
    if (!t.totpEnabledAt) return fail(`${t.name} needs to set up two-step sign-in first (at their next sign-in).`);
    const limit = await hitRateLimit("code", `user:${me.id}`);
    if (!limit.ok) return fail(tooManyMessage(limit));
    if (!(await verifySecondFactor(me.id, code))) return fail("That code didn't work. Use the newest code in your authenticator app.");
    await prisma.$transaction(async (tx) => {
      // Demote first: the database allows only one owner at a time.
      const demoted = await tx.user.updateMany({ where: { id: me.id, role: "OWNER" }, data: { role: "ADMIN" } });
      if (demoted.count !== 1) throw new AuthError("You're no longer the owner.");
      await tx.user.update({ where: { id: t.id }, data: { role: "OWNER" } });
    });
    revalidatePath("/", "layout");
    return { ok: true, message: `${t.name} is now the owner. You're an admin.` };
  });
}

// ---------- Access requests (Settings → Company & users) ----------

export async function decideAccessRequest(requestId: string, decision: "approve" | "decline", role: "USER" | "ADMIN" = "USER"): Promise<UserActionState> {
  return run(async () => {
    const me = await assertOwner().catch(() => {
      throw new AuthError("Only the owner can approve or decline access requests.");
    });
    const r = decision === "approve" ? await approveAccessRequest(requestId, role === "ADMIN" ? "ADMIN" : "USER", me) : await declineAccessRequest(requestId, me);
    revalidatePath("/settings");
    if (!r.ok) return fail(r.message);
    const link = "outcome" in r ? r.outcome?.link : undefined;
    return { ok: true, message: r.message, link, linkNote: link ? "Copy this link and send it to them yourself. It's shown only once and works for 7 days." : undefined };
  });
}

export async function saveAccessDomain(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  return run(async () => {
    await assertAdmin();
    const d = await setAccessDomain(String(formData.get("domain") ?? ""));
    revalidatePath("/settings");
    return { ok: true, message: `Saved — only @${d} emails can request access.` };
  });
}

// ---------- My account ----------

export async function changeMyPassword(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  return run(async () => {
    const me = await assertUser();
    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("next") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await verifyPassword(current, row.passwordHash))) return fail("Current password is incorrect.");
    const problem = passwordProblem(next);
    if (problem) return fail(problem);
    if (next !== confirm) return fail("New passwords don't match.");
    await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next), passwordSetAt: new Date() } });
    return { ok: true, message: "Password changed." };
  });
}

/** New set of 10 backup codes; needs a current code from the authenticator app. */
export async function newBackupCodes(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  return run(async () => {
    const me = await assertUser();
    const limit = await hitRateLimit("code", `user:${me.id}`);
    if (!limit.ok) return fail(tooManyMessage(limit));
    const codes = await regenerateBackupCodes(me.id, String(formData.get("code") ?? ""));
    if (!codes) return fail("That code didn't work. Use the newest 6-digit code in your authenticator app.");
    revalidatePath("/settings");
    return { ok: true, message: "New backup codes made — the old ones no longer work. Save these now; they won't be shown again.", codes };
  });
}

export async function forgetMyDevice(): Promise<UserActionState> {
  return run(async () => {
    await assertUser();
    await forgetThisDevice();
    return { ok: true, message: "This device will ask for a code next time you sign in." };
  });
}
