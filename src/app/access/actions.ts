"use server";

import { prisma } from "@/lib/db";
import { approveAccessRequest, declineAccessRequest } from "@/lib/auth/flows";
import { checkAuthToken, consumeAuthToken, tokenProblemMessage } from "@/lib/auth/tokens";
import { clientIp, hitRateLimit, tooManyMessage } from "@/lib/auth/rate-limit";
import { verifySecondFactor } from "@/lib/auth/two-factor";

export type AccessDecisionState = { ok?: boolean; message?: string; error?: string; link?: string };

/**
 * Approve / Decline from the owner's email (Batch 2 item 31): no full sign-in, but the owner's 2FA code is required.
 * The link is single use and expires after 7 days.
 */
export async function decideAccessWithLink(_prev: AccessDecisionState, formData: FormData): Promise<AccessDecisionState> {
  const raw = String(formData.get("token") ?? "");
  const decision = formData.get("decision") === "decline" ? "decline" : "approve";
  const role = formData.get("role") === "ADMIN" ? "ADMIN" : "USER";
  const code = String(formData.get("code") ?? "").trim();

  const byIp = await hitRateLimit("tokenIp", await clientIp());
  if (!byIp.ok) return { error: tooManyMessage(byIp) };
  const check = await checkAuthToken(raw, ["ACCESS_APPROVE"]);
  if (!check.ok) return { error: tokenProblemMessage(check.reason, "approval") };
  const req = check.token.accessRequest;
  if (!req || req.status !== "PENDING") return { error: "This request has already been dealt with." };

  const owner = await prisma.user.findFirst({ where: { role: "OWNER", active: true } });
  if (!owner) return { error: "There's no owner account to confirm with." };
  if (!owner.totpEnabledAt) return { error: "Set up two-step sign-in first (sign in to the app), then open this link again." };
  if (!code) return { error: "Enter the 6-digit code from your authenticator app." };
  const limit = await hitRateLimit("code", `user:${owner.id}`);
  if (!limit.ok) return { error: tooManyMessage(limit) };
  if (!(await verifySecondFactor(owner.id, code))) return { error: "That code didn't work. Use the newest code in your authenticator app, or a backup code." };
  if (!(await consumeAuthToken(check.token.id))) return { error: tokenProblemMessage("used", "approval") };

  const by = { id: owner.id, name: owner.name };
  const r = decision === "approve" ? await approveAccessRequest(req.id, role, by) : await declineAccessRequest(req.id, by);
  if (!r.ok) return { error: r.message };
  return { ok: true, message: r.message, link: "outcome" in r ? r.outcome?.link : undefined };
}
