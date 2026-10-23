"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { clientIp, hitRateLimit, tooManyMessage } from "@/lib/auth/rate-limit";
import { requestPasswordReset, setPasswordFromToken, submitAccessRequest } from "@/lib/auth/flows";
import { FORGOT_REPLY, REQUEST_REPLY } from "@/lib/auth/copy";

export type PublicFormState = { ok?: boolean; message?: string; error?: string; values?: Record<string, string> };


export async function forgotPassword(_prev: PublicFormState, formData: FormData): Promise<PublicFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { error: "Enter your email address.", values: { email } };
  const [byIp, byEmail] = await Promise.all([hitRateLimit("forgotIp", await clientIp()), hitRateLimit("forgotEmail", email)]);
  if (!byIp.ok) return { error: tooManyMessage(byIp), values: { email } };
  // Over the per-email limit: same neutral reply, nothing sent.
  if (byEmail.ok) await requestPasswordReset(email);
  return { ok: true, message: FORGOT_REPLY };
}

/** /set-password (invite) and /reset-password (reset, owner recovery). */
export async function setNewPassword(_prev: PublicFormState, formData: FormData): Promise<PublicFormState> {
  const token = String(formData.get("token") ?? "");
  const kind = String(formData.get("kind") ?? "reset");
  const limit = await hitRateLimit("tokenIp", await clientIp());
  if (!limit.ok) return { error: tooManyMessage(limit) };
  const r = await setPasswordFromToken(token, String(formData.get("password") ?? ""), String(formData.get("confirm") ?? ""), kind === "invite" ? ["INVITE"] : ["RESET", "TWO_FACTOR_RESET"]);
  if (!r.ok) return { error: r.message };
  if (r.purpose === "RESET") redirect("/login?done=reset");
  // New user or owner recovery: straight on to setting up two-step sign-in.
  await createSession(r.userId, { stage: "pending" });
  redirect("/login/setup-2fa");
}

const AccessForm = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
  email: z.string().trim().toLowerCase().email("Enter your work email"),
  reason: z.string().trim().min(5, "Say in a few words why you need access").max(500, "Keep the reason under 500 characters"),
});


export async function requestAccess(_prev: PublicFormState, formData: FormData): Promise<PublicFormState> {
  const values = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? ""), reason: String(formData.get("reason") ?? "") };
  if (String(formData.get("website") ?? "")) return { ok: true, message: REQUEST_REPLY }; // bot trap
  const parsed = AccessForm.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values };
  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([hitRateLimit("requestIp", ip), hitRateLimit("requestEmail", parsed.data.email)]);
  if (!byIp.ok) return { error: tooManyMessage(byIp), values };
  if (!byEmail.ok) return { ok: true, message: REQUEST_REPLY };
  const r = await submitAccessRequest({ ...parsed.data, ip });
  if (!r.ok) return { error: r.message, values };
  return { ok: true, message: REQUEST_REPLY };
}
