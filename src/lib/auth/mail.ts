import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getCompany } from "@/lib/company";
import { isFrontConfigured, sendEmail } from "@/lib/front/client";
import { COLOURS, brandFromCompany, esc, layout } from "@/lib/emails/layout";

/**
 * Sign-in emails (invite, reset, access request, owner recovery) sent through Front from the same channel as the
 * digests (Settings → Digests → send channel, normally FA Accounts). Brand chrome = the digest email layout.
 * When Front can't send, callers get { sent: false, reason } — admin screens then show the link once instead.
 */

export type MailResult = { sent: true } | { sent: false; reason: string };

export async function frontSendChannel(): Promise<{ ok: true; channelId: string } | { ok: false; reason: string }> {
  if (!isFrontConfigured()) return { ok: false, reason: "Front isn't connected" };
  const row = await prisma.setting.findUnique({ where: { key: "frontSendChannelId" } }).catch(() => null);
  const channelId = typeof row?.value === "string" && row.value ? row.value : null;
  if (!channelId) return { ok: false, reason: "no Front send channel is picked in Settings → Company" };
  return { ok: true, channelId };
}

/** Absolute base URL for links in emails: APP_URL, else the address this request came in on. */
export async function appBaseUrl(): Promise<string> {
  const env = (process.env.APP_URL ?? "").trim().replace(/\/$/, "");
  if (env) return env;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  } catch {
    /* not in a request (CLI) */
  }
  return "http://localhost:3002";
}

export interface AuthEmail {
  to: string;
  subject: string;
  title: string;
  /** Paragraphs (plain text, escaped here) */
  paragraphs: string[];
  buttons: Array<{ label: string; href: string; tone?: "primary" | "plain" }>;
  /** Small grey line under the buttons */
  note?: string;
}

function button(label: string, href: string, colour: string, plain: boolean): string {
  const bg = plain ? "#ffffff" : colour;
  const fg = plain ? colour : "#ffffff";
  return `<td style="padding:0 8px 8px 0;"><a href="${esc(href)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:${bg};color:${fg};border:1px solid ${colour};font-size:14px;font-weight:600;text-decoration:none;">${esc(label)}</a></td>`;
}

export function renderAuthEmail(mail: AuthEmail, brand: Awaited<ReturnType<typeof brandFromCompany>>): { html: string; text: string } {
  const primary = /^#[0-9a-fA-F]{6}$/.test(brand.primaryColour) ? brand.primaryColour : COLOURS.blue;
  const paras = mail.paragraphs.map((p) => `<tr><td style="padding:6px 0;font-size:14px;line-height:1.5;">${esc(p)}</td></tr>`).join("");
  const btns = `<tr><td style="padding:12px 0 4px 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${mail.buttons.map((b) => button(b.label, b.href, primary, b.tone === "plain")).join("")}</tr></table></td></tr>`;
  const fallback = mail.buttons
    .map((b) => `<div style="margin-top:4px;">${esc(b.label)}: <span style="word-break:break-all;color:${COLOURS.greyDark};">${esc(b.href)}</span></div>`)
    .join("");
  const note = `<tr><td style="padding:8px 0 0 0;font-size:12px;color:${COLOURS.grey};line-height:1.5;">${mail.note ? `${esc(mail.note)}<br>` : ""}If the button doesn't work, copy the link into your browser:${fallback}</td></tr>`;
  const html = layout(brand, {
    title: mail.title,
    dateLabel: "",
    preheader: mail.paragraphs[0] ?? mail.title,
    bodyRows: paras + btns + note,
    footerNote: `${brand.companyName} Analytics`,
    footerTail: "Sent automatically by the app's sign-in system. If you didn't expect this email, you can ignore it.",
  });
  const text = [mail.title, "", ...mail.paragraphs, "", ...mail.buttons.map((b) => `${b.label}: ${b.href}`), "", mail.note ?? ""].join("\n").trim();
  return { html, text };
}

export async function sendAuthEmail(mail: AuthEmail): Promise<MailResult> {
  const ch = await frontSendChannel();
  if (!ch.ok) return { sent: false, reason: ch.reason };
  const company = await getCompany();
  const brand = await brandFromCompany(await appBaseUrl());
  const { html, text } = renderAuthEmail(mail, brand);
  try {
    await sendEmail({ channelId: ch.channelId, to: [mail.to], subject: mail.subject, html, text, senderName: `${company.shortName} Analytics` });
    return { sent: true };
  } catch (err) {
    const { recordFrontFailure } = await import("@/lib/integrations/status");
    await recordFrontFailure(err).catch(() => {});
    return { sent: false, reason: `Front didn't send it (${err instanceof Error ? err.message : String(err)})` };
  }
}
