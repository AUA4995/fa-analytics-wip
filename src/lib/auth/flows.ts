import { prisma } from "@/lib/db";
import { getCompany } from "@/lib/company";
import type { AuthTokenPurpose } from "@/generated/prisma/enums";
import { hashPassword, passwordProblem } from "./password";
import { appBaseUrl, frontSendChannel, sendAuthEmail, type MailResult } from "./mail";
import { checkAuthToken, consumeAuthToken, createAuthToken, tokenProblemMessage, TOKEN_TTL_MS } from "./tokens";
import { emailInDomain, getAccessDomain } from "./domain";

/**
 * Email-link flows (Batch 2 items 2, 30, 31, 33). Permission checks live in the server actions that call these;
 * these functions do the work and never return a link when the email went out.
 */

export interface LinkOutcome {
  mail: MailResult;
  /** Only when the email could NOT be sent: shown once on screen to the admin/owner who asked. */
  link?: string;
}

async function hubName(): Promise<string> {
  return `${(await getCompany()).shortName} Analytics`;
}

const days = (p: AuthTokenPurpose) => Math.round(TOKEN_TTL_MS[p] / 86_400_000);
const hours = (p: AuthTokenPurpose) => Math.round(TOKEN_TTL_MS[p] / 3_600_000);

async function linkFor(path: string, token: string): Promise<string> {
  return `${await appBaseUrl()}${path}?token=${encodeURIComponent(token)}`;
}

// ---------- Invite ----------

/** Creates the user with no password (they set one from the link) and emails a 7-day "Set your password" link. */
export async function inviteUser(input: { name: string; email: string; role: "USER" | "ADMIN"; byId: string | null; byName: string }): Promise<LinkOutcome & { userId: string }> {
  const user = await prisma.user.create({ data: { name: input.name, email: input.email.toLowerCase(), role: input.role, passwordHash: "", passwordSetAt: null } });
  const out = await sendInvite(user.id, input.byId, input.byName);
  return { ...out, userId: user.id };
}

export async function sendInvite(userId: string, byId: string | null, byName: string): Promise<LinkOutcome> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = await createAuthToken({ purpose: "INVITE", userId, createdById: byId ?? undefined });
  const link = await linkFor("/set-password", token);
  const name = await hubName();
  const mail = await sendAuthEmail({
    to: user.email,
    subject: `Set your password for the ${name}`,
    title: "Set your password",
    paragraphs: [
      `Hi ${user.name.split(" ")[0]},`,
      `${byName} added you to the ${name}. Set your password to sign in.`,
      "After that you'll set up two-step sign-in with an authenticator app (Microsoft Authenticator or Google Authenticator) on your phone.",
    ],
    buttons: [{ label: "Set your password", href: link }],
    note: `The link works once and for ${days("INVITE")} days.`,
  });
  return mail.sent ? { mail } : { mail, link };
}

// ---------- Password reset ----------

/** Admin/owner action: emails a 2-hour reset link. The current password keeps working until a new one is set. */
export async function sendResetLink(userId: string, byId: string | null, byName: string): Promise<LinkOutcome> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = await createAuthToken({ purpose: "RESET", userId, createdById: byId ?? undefined });
  const link = await linkFor("/reset-password", token);
  const mail = await sendAuthEmail({
    to: user.email,
    subject: `Reset your ${await hubName()} password`,
    title: "Reset your password",
    paragraphs: [`Hi ${user.name.split(" ")[0]},`, `${byName} sent you a link to set a new password.`, "Your current password keeps working until you set a new one."],
    buttons: [{ label: "Set a new password", href: link }],
    note: `The link works once and for ${hours("RESET")} hours.`,
  });
  return mail.sent ? { mail } : { mail, link };
}

/**
 * "Forgot password?" on the login page. Always the same answer for the caller (no account check);
 * sends a link only to an active user. Never shows the link on screen.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.active) return;
  const token = await createAuthToken({ purpose: "RESET", userId: user.id });
  const link = await linkFor("/reset-password", token);
  const mail = await sendAuthEmail({
    to: user.email,
    subject: `Reset your ${await hubName()} password`,
    title: "Reset your password",
    paragraphs: [`Hi ${user.name.split(" ")[0]},`, "Someone (hopefully you) asked to reset your password.", "If it wasn't you, ignore this email — your password stays the same."],
    buttons: [{ label: "Set a new password", href: link }],
    note: `The link works once and for ${hours("RESET")} hours.`,
  });
  if (!mail.sent) console.warn(`[auth] password reset for a user not emailed: ${mail.reason}`);
}

export type SetPasswordResult =
  | { ok: true; userId: string; purpose: AuthTokenPurpose }
  | { ok: false; message: string };

/** /set-password and /reset-password: checks the link, sets the password, signs the user out everywhere. */
export async function setPasswordFromToken(raw: string, password: string, confirm: string, purposes: AuthTokenPurpose[]): Promise<SetPasswordResult> {
  const check = await checkAuthToken(raw, purposes);
  const what = purposes.includes("INVITE") ? "invitation" : "reset";
  if (!check.ok) return { ok: false, message: tokenProblemMessage(check.reason, what) };
  const { token } = check;
  if (!token.user) return { ok: false, message: tokenProblemMessage("unknown", what) };
  if (!token.user.active) return { ok: false, message: "This account is deactivated — ask an admin." };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, message: problem };
  if (password !== confirm) return { ok: false, message: "Passwords don't match." };
  const passwordHash = await hashPassword(password);
  if (!(await consumeAuthToken(token.id))) return { ok: false, message: tokenProblemMessage("used", what) };
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: token.user.id },
      data: {
        passwordHash,
        passwordSetAt: now,
        ...(token.purpose === "TWO_FACTOR_RESET" ? { totpSecret: null, totpEnabledAt: null, totpLastStep: null, backupCodes: [] } : {}),
      },
    }),
    prisma.session.deleteMany({ where: { userId: token.user.id } }),
    // Any other unused password links for this user stop working.
    prisma.authToken.updateMany({ where: { userId: token.user.id, purpose: { in: ["INVITE", "RESET", "TWO_FACTOR_RESET"] }, usedAt: null }, data: { usedAt: now } }),
  ]);
  return { ok: true, userId: token.user.id, purpose: token.purpose };
}

// ---------- Access requests ----------

export type AccessRequestInput = { name: string; email: string; reason: string; ip: string | null };

/**
 * Public "Request access". Same answer whatever happens (no account check). Wrong domain is the one thing
 * the form says no to — it's a rule about the address, not about an account.
 */
export async function submitAccessRequest(input: AccessRequestInput): Promise<{ ok: true } | { ok: false; message: string }> {
  const email = input.email.trim().toLowerCase();
  const domain = await getAccessDomain();
  if (!emailInDomain(email, domain)) return { ok: false, message: `Use your @${domain} email address.` };
  const [existingUser, pending] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.accessRequest.findFirst({ where: { email, status: "PENDING" }, select: { id: true } }),
  ]);
  if (existingUser || pending) return { ok: true };
  const req = await prisma.accessRequest.create({ data: { name: input.name.trim(), email, reason: input.reason.trim(), ip: input.ip } });
  await emailOwnerAboutRequest(req.id);
  return { ok: true };
}

/** Owner email with Approve / Decline links (one single-use token covers both; 7 days). */
export async function emailOwnerAboutRequest(requestId: string): Promise<MailResult> {
  const [req, owner] = await Promise.all([
    prisma.accessRequest.findUniqueOrThrow({ where: { id: requestId } }),
    prisma.user.findFirst({ where: { role: "OWNER", active: true } }),
  ]);
  if (!owner) return { sent: false, reason: "there is no owner" };
  const ch = await frontSendChannel();
  if (!ch.ok) return { sent: false, reason: ch.reason };
  const token = await createAuthToken({ purpose: "ACCESS_APPROVE", accessRequestId: req.id, replacePrevious: false });
  const base = await appBaseUrl();
  const t = encodeURIComponent(token);
  return sendAuthEmail({
    to: owner.email,
    subject: `${req.name} (${req.email}) asked for access`,
    title: `${req.name} asked for access`,
    paragraphs: [`${req.name} (${req.email}) asked for access to the ${await hubName()}.`, `Reason: ${req.reason}`, "Approve to choose User or Admin and send them an invitation. You'll be asked for your two-step sign-in code."],
    buttons: [
      { label: "Approve", href: `${base}/access/approve?token=${t}` },
      { label: "Decline", href: `${base}/access/decline?token=${t}`, tone: "plain" },
    ],
    note: `The links work once and for ${days("ACCESS_APPROVE")} days. You can also approve or decline in Settings → Company & users.`,
  });
}

export type DecideResult = { ok: true; message: string; outcome?: LinkOutcome } | { ok: false; message: string };

/** Approve: creates the user (no password) and sends the invitation. Only a PENDING request can be decided. */
export async function approveAccessRequest(requestId: string, role: "USER" | "ADMIN", by: { id: string; name: string }): Promise<DecideResult> {
  const now = new Date();
  const claimed = await prisma.accessRequest.updateMany({ where: { id: requestId, status: "PENDING" }, data: { status: "APPROVED", decidedAt: now, decidedByName: by.name, role } });
  if (claimed.count !== 1) return { ok: false, message: "This request has already been dealt with." };
  await prisma.authToken.updateMany({ where: { accessRequestId: requestId, usedAt: null }, data: { usedAt: now } });
  const req = await prisma.accessRequest.findUniqueOrThrow({ where: { id: requestId } });
  const existing = await prisma.user.findUnique({ where: { email: req.email } });
  if (existing) {
    await prisma.accessRequest.update({ where: { id: requestId }, data: { userId: existing.id } });
    return { ok: true, message: `${req.email} already has an account — nothing new was created.` };
  }
  const outcome = await inviteUser({ name: req.name, email: req.email, role, byId: by.id, byName: by.name });
  await prisma.accessRequest.update({ where: { id: requestId }, data: { userId: outcome.userId } });
  const roleWord = role === "ADMIN" ? "an admin" : "a user";
  return {
    ok: true,
    message: outcome.mail.sent ? `Approved — ${req.name} is ${roleWord} and has been emailed an invitation.` : `Approved — ${req.name} is ${roleWord}, but the invitation email wasn't sent (${outcome.mail.reason}).`,
    outcome,
  };
}

export async function declineAccessRequest(requestId: string, by: { name: string }): Promise<DecideResult> {
  const now = new Date();
  const claimed = await prisma.accessRequest.updateMany({ where: { id: requestId, status: "PENDING" }, data: { status: "DECLINED", decidedAt: now, decidedByName: by.name } });
  if (claimed.count !== 1) return { ok: false, message: "This request has already been dealt with." };
  await prisma.authToken.updateMany({ where: { accessRequestId: requestId, usedAt: null }, data: { usedAt: now } });
  const req = await prisma.accessRequest.findUniqueOrThrow({ where: { id: requestId } });
  return { ok: true, message: `Declined — ${req.name} (${req.email}) won't get access. Nothing was sent to them.` };
}

// ---------- Emergency owner recovery (npm run owner:recover) ----------

export type RecoveryResult = { sent: true; to: string } | { sent: false; message: string };

/** a***@fulfilmentaustralia.com.au */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain ?? ""}`;
}

/**
 * Emails the owner one link to set a new password and set up 2FA again (2 hours). Changes nothing else:
 * no password is set, nothing secret is printed. Without Front nothing happens at all.
 */
export async function sendOwnerRecovery(): Promise<RecoveryResult> {
  const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (!owner) return { sent: false, message: "No owner found — nothing changed." };
  const ch = await frontSendChannel();
  if (!ch.ok) return { sent: false, message: "Front not connected — cannot send; nothing changed." };
  const token = await createAuthToken({ purpose: "TWO_FACTOR_RESET", userId: owner.id });
  const link = await linkFor("/reset-password", token);
  const mail = await sendAuthEmail({
    to: owner.email,
    subject: `Owner recovery for the ${await hubName()}`,
    title: "Reset your password and two-step sign-in",
    paragraphs: [
      `Hi ${owner.name.split(" ")[0]},`,
      "The emergency owner recovery was run for FA Analytics. Use this link to set a new password; you'll then set up two-step sign-in again.",
      "If you didn't ask for this, ignore this email — nothing changes until the link is used.",
    ],
    buttons: [{ label: "Reset password and two-step sign-in", href: link }],
    note: `The link works once and for ${hours("TWO_FACTOR_RESET")} hours.`,
  });
  if (!mail.sent) {
    await prisma.authToken.updateMany({ where: { userId: owner.id, purpose: "TWO_FACTOR_RESET", usedAt: null }, data: { usedAt: new Date() } });
    return { sent: false, message: `Front didn't send the email (${mail.reason}) — nothing changed.` };
  }
  return { sent: true, to: maskEmail(owner.email) };
}
