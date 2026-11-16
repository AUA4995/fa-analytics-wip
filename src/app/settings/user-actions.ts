"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { AuthError, assertAdmin, assertOwner, assertPrimaryOwner, assertUser, type CurrentUser } from "@/lib/auth/session";
import { isOwnerRole, isPrimaryOwner } from "@/lib/auth/roles";
import { approveAccessRequest, declineAccessRequest, inviteUser, sendInvite, sendResetLink, type LinkOutcome } from "@/lib/auth/flows";
import { forgetThisDevice, regenerateBackupCodes, resetTwoFactor, verifySecondFactor } from "@/lib/auth/two-factor";
import { hitRateLimit, tooManyMessage } from "@/lib/auth/rate-limit";
import { setAccessDomain } from "@/lib/auth/domain";

/**
 * Users (Batch 2 items 1, 2, 31, 32; four roles batch 3, 16/11/2026 — same rules as the Accounts Hub).
 * Every rule is enforced here, whatever the screen shows. Primary owner > owners > admins > users:
 *   • nobody changes the primary owner's role, resets their password/2FA or deactivates them
 *   • only the primary owner makes or removes owners, manages another owner's account and transfers "primary owner"
 *     (confirmed with their own 2FA code)
 *   • owners make or remove admins, reset 2FA, approve access requests
 *   • admins add, deactivate and reset USERs only (never another admin)
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
function manageProblem(me: CurrentUser, t: { id: string; role: string; extraOwner: boolean; name: string }, what: string): string | null {
  if (isPrimaryOwner(t)) return `No one can ${what} the primary owner.`;
  if (isOwnerRole(t.role) && !me.primary) return `Only the primary owner can ${what} an owner.`;
  if (t.role === "ADMIN" && !isOwnerRole(me.role)) return `Only an owner can ${what} an admin.`;
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
    if (parsed.data.role === "ADMIN" && !isOwnerRole(me.role)) return { ...fail("Only an owner can add admins."), values };
    if (await prisma.user.findUnique({ where: { email: parsed.data.email } })) return { ...fail("A user with that email already exists."), values };
    const out = await inviteUser({ ...parsed.data, byId: me.id, byName: me.name });
    revalidatePath("/settings");
    const lm = linkMessage(parsed.data.name, parsed.data.email, out, `${parsed.data.name} added — invitation emailed to`, "7 days");
    return { ok: true, ...lm, message: out.mail.sent ? lm.message : `${parsed.data.name} added. ${lm.message}` };
  });
}

/** Emails a 2-hour reset link (never on the primary owner). */
export async function resetUserPassword(userId: string): Promise<UserActionState> {
  return run(async () => {
    const me = await assertAdmin();
    const t = await target(userId);
    if (t.id === me.id) return fail("Use My password below to change your own password.");
    const problem = manageProblem(me, t, "reset the password of");
    if (problem) return fail(isPrimaryOwner(t) ? "No one can reset the primary owner's password. They can use Forgot password? on the sign-in page." : problem);
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

const ROLE_WORD = { OWNER: "an owner", ADMIN: "an admin", USER: "a user" } as const;

/** Owners make someone an admin or a user; only the primary owner makes someone an (extra) owner or removes one. */
export async function setUserRole(userId: string, role: "OWNER" | "ADMIN" | "USER"): Promise<UserActionState> {
  return run(async () => {
    const me = await assertOwner().catch(() => {
      throw new AuthError("Only an owner can make or remove admins.");
    });
    if (role !== "OWNER" && role !== "ADMIN" && role !== "USER") return fail("Pick User, Admin or Owner.");
    if (userId === me.id) return fail("You can't change your own role.");
    const t = await target(userId);
    if (isPrimaryOwner(t)) return fail("No one can change the primary owner's role.");
    if ((role === "OWNER" || isOwnerRole(t.role)) && !me.primary) return fail("Only the primary owner can make or remove owners.");
    if (role === t.role) return { ok: true, message: `${t.name} is already ${ROLE_WORD[role]}.` };
    if (role === "OWNER" && !t.active) return fail(`Re-activate ${t.name} first.`);
    if (role === "OWNER" && !t.passwordSetAt) return fail(`${t.name} needs to set a password and sign in once first.`);
    // extraOwner is true only while someone is an extra owner (the primary owner never changes here)
    await prisma.user.update({ where: { id: userId }, data: { role, extraOwner: role === "OWNER" } });
    if (isOwnerRole(t.role) || role === "OWNER") revalidatePath("/", "layout");
    revalidatePath("/settings");
    return { ok: true, message: `${t.name} is now ${ROLE_WORD[role]}.` };
  });
}

/** Owners: turn off someone's 2FA so they set it up again at their next sign-in (another owner's: primary owner only). */
export async function resetUserTwoFactor(userId: string): Promise<UserActionState> {
  return run(async () => {
    const me = await assertOwner();
    const t = await target(userId);
    if (t.id === me.id) return fail("You can't reset your own two-step sign-in here — use a backup code, or the emergency command (npm run owner:recover).");
    if (isPrimaryOwner(t)) return fail("No one can reset the primary owner's two-step sign-in. The primary owner can use a backup code, or the emergency command (npm run owner:recover).");
    const problem = manageProblem(me, t, "reset two-step sign-in for");
    if (problem) return fail(problem);
    await resetTwoFactor(t.id);
    revalidatePath("/settings");
    return { ok: true, message: `${t.name}'s two-step sign-in was reset and they were signed out. They'll set it up again next time they sign in.` };
  });
}

/**
 * Primary owner only: hand "primary owner" to an active admin or owner, confirmed with their own 2FA code.
 * Afterwards the old primary owner is an admin (default) or stays an owner ("then" = OWNER).
 */
export async function transferPrimaryOwner(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  return run(async () => {
    const me = await assertPrimaryOwner();
    const userId = String(formData.get("userId") ?? "");
    const code = String(formData.get("code") ?? "");
    const then = formData.get("then") === "OWNER" ? "OWNER" : "ADMIN";
    const t = await target(userId);
    if (t.id === me.id) return fail("You're already the primary owner.");
    if ((t.role !== "ADMIN" && t.role !== "OWNER") || !t.active) return fail("Primary owner can only go to an active admin or owner. Make them an admin first.");
    if (!t.totpEnabledAt) return fail(`${t.name} needs to set up two-step sign-in first (at their next sign-in).`);
    const limit = await hitRateLimit("code", `user:${me.id}`);
    if (!limit.ok) return fail(tooManyMessage(limit));
    if (!(await verifySecondFactor(me.id, code))) return fail("That code didn't work. Use the newest code in your authenticator app.");
    await prisma.$transaction(async (tx) => {
      // Step down first: the database allows only one primary owner at a time.
      const down = await tx.user.updateMany({
        where: { id: me.id, role: "OWNER", extraOwner: false },
        data: then === "OWNER" ? { extraOwner: true } : { role: "ADMIN", extraOwner: false },
      });
      if (down.count !== 1) throw new AuthError("You're no longer the primary owner.");
      await tx.user.update({ where: { id: t.id }, data: { role: "OWNER", extraOwner: false } });
    });
    revalidatePath("/", "layout");
    return { ok: true, message: `${t.name} is now the primary owner. You're ${then === "OWNER" ? "an owner" : "an admin"}.` };
  });
}

// ---------- Access requests (Settings → Company & users) ----------

export async function decideAccessRequest(requestId: string, decision: "approve" | "decline", role: "USER" | "ADMIN" = "USER"): Promise<UserActionState> {
  return run(async () => {
    const me = await assertOwner().catch(() => {
      throw new AuthError("Only an owner can approve or decline access requests.");
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
