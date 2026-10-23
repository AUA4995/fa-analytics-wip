import { prisma } from "@/lib/db";
import { getCompany } from "@/lib/company";
import { createTask } from "@/lib/tasks";
import { isFrontConfigured, sendWithAttachment } from "@/lib/front/client";
import { frontSendChannel } from "@/lib/auth/mail";
import { brandFromCompany, esc, layout } from "@/lib/emails/layout";
import { buildReport, scanReport, type BuiltReport } from "./build";
import { renderPdf } from "./pdf";
import { checkRecipients } from "./recipients";

/** FA white logo (public/brand) for the PDF header when no PNG logo is uploaded in Branding. */
async function defaultLogo(): Promise<Buffer | null> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  return readFile(join(process.cwd(), "public/brand/fa-logo-white.png")).catch(() => null);
}

export interface SendResult {
  ok: boolean;
  message: string;
}

export async function reportPdf(reportId: string, opts: { withSummary?: boolean } = {}): Promise<{ pdf: Buffer; built: BuiltReport; fileName: string; summary: string | null }> {
  const r = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
  const built = await buildReport(r);
  const company = await getCompany();
  const summary = opts.withSummary ? await aiSummary(built).catch(() => null) : null;
  const logo = await prisma.company.findUnique({ where: { id: "default" }, select: { logoDark: true, logoDarkMime: true } });
  const pdf = await renderPdf(built, { companyName: company.name, accent: company.accentColour, blue: company.primaryColour, logo: logo?.logoDark && logo.logoDarkMime === "image/png" ? Buffer.from(logo.logoDark) : await defaultLogo() }, { cls: r.cls, generated: new Date().toLocaleDateString("en-AU", { timeZone: company.timezone }), aiSummary: summary });
  const fileName = `${r.name.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { pdf, built, fileName, summary };
}

/** Claude summary from the figures in the report only (marked AI in the PDF). Skipped when there's no key. */
async function aiSummary(built: BuiltReport): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { callClaude } = await import("@/lib/ai/anthropic");
  const facts = JSON.stringify(built.blocks).slice(0, 12000);
  const r = await callClaude({
    model: "claude-haiku-5-5",
    maxTokens: 300,
    system: "You write a 2–3 sentence summary for a 3PL management report in Australian English. Use only numbers present in the data. No advice, no speculation, no numbers that aren't in the data.",
    messages: [{ role: "user", content: `Report: ${built.title} — ${built.subtitle}\nData: ${facts}` }],
  });
  await prisma.aiCallLog.create({ data: { job: "report-summary", model: "claude-haiku-5-5", inputTokens: r.inputTokens, outputTokens: r.outputTokens, ok: true, ref: built.title } }).catch(() => {});
  return r.text.trim() || null;
}

/**
 * Send a report: build → scan (brake) → recipients re-checked → PDF → Front (dry run to me / draft / send).
 * Anything blocked creates a task and is logged; nothing is sent in part.
 */
export async function sendReport(reportId: string, by: { name: string; email: string }, override?: { mode?: string; to?: string[] }): Promise<SendResult> {
  const r = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
  const mode = override?.mode ?? r.mode;
  const to = mode === "DRY_RUN" ? [by.email] : (override?.to ?? r.recipients);
  const log = async (ok: boolean, subject: string, error: string | null, frontId: string | null = null) => prisma.reportSend.create({ data: { reportId, mode, to, subject, ok, error, frontId, by: by.name } });
  const block = async (why: string) => {
    await log(false, r.name, why);
    await createTask({ title: `Report not sent: ${r.name}`, detail: why, where: "Analytics", link: `/reports?r=${r.id}`, priority: "High", source: `report-block:${r.id}:${new Date().toISOString().slice(0, 10)}` });
    return { ok: false, message: `Not sent — ${why}. A task was created.` };
  };
  if (!to.length) return { ok: false, message: "Add recipients first." };
  if (mode !== "DRY_RUN") {
    const checks = await checkRecipients(r, to);
    const bad = checks.filter((c) => !c.ok);
    if (bad.length) return block(`recipient${bad.length > 1 ? "s" : ""} not allowed: ${bad.map((b) => `${b.email} (${b.why})`).join(", ")}`);
  }
  const { pdf, built, fileName, summary } = await reportPdf(reportId, { withSummary: true });
  const problems = await scanReport(r, built);
  if (problems.length) return block(problems.join("; "));
  if (!isFrontConfigured()) return { ok: false, message: "Front isn't connected (Settings → Company)." };
  const ch = await frontSendChannel();
  if (!ch.ok) return { ok: false, message: `Can't send: ${ch.reason}.` };
  const company = await getCompany();
  const brand = await brandFromCompany();
  const subject = `${mode === "DRY_RUN" ? "[Dry run] " : ""}${r.name} · ${built.subtitle.split(" · ")[0]}`;
  const kpis = built.blocks.find((b) => b.kind === "kpis");
  const kpiHtml = kpis && kpis.kind === "kpis" ? `<table role="presentation" width="100%" style="margin:8px 0 14px;border-collapse:collapse"><tr>${kpis.items.map((k) => `<td style="padding:8px 10px;border:1px solid #E4E3EE;font-size:12px;color:#6B6A80">${esc(k.label)}<br><strong style="font-size:18px;color:#14132E">${esc(k.value)}</strong></td>`).join("")}</tr></table>` : "";
  const body = `${summary ? `<p style="font-size:13px;color:#14132E"><em>Summary (AI, from the figures in the PDF):</em> ${esc(summary)}</p>` : ""}${kpiHtml}<p style="font-size:13px;color:#14132E">The full report is attached as a PDF.</p>`;
  const html = layout(brand, { title: r.name, dateLabel: built.subtitle.split(" · ")[0], preheader: built.subtitle, bodyRows: `<tr><td style="padding:16px 22px;">${body}</td></tr>`, footerNote: `${company.name} Analytics`, footerTail: "" });
  try {
    const res = await sendWithAttachment({ channelId: ch.channelId, to, subject, html, senderName: `${company.shortName} Analytics`, attachment: { name: fileName, type: "application/pdf", bytes: pdf }, draft: mode === "DRAFT" });
    await log(true, subject, null, res.id);
    return { ok: true, message: mode === "DRAFT" ? "Saved as a draft in Front for review." : mode === "DRY_RUN" ? `Dry run sent to ${by.email}.` : `Sent to ${to.length} recipient${to.length > 1 ? "s" : ""}.` };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    await log(false, subject, why);
    return { ok: false, message: `Front didn't accept it: ${why}` };
  }
}

/** Is a scheduled report due today? WEEKLY = Mondays; MONTHLY = 1st business day; QUARTERLY = 5th business day of Jan/Apr/Jul/Oct. */
export function isDue(schedule: string, d: Date): boolean {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (schedule === "WEEKLY") return dow === 1;
  const bd = businessDayOfMonth(d);
  if (schedule === "MONTHLY") return bd === 1;
  if (schedule === "QUARTERLY") return [0, 3, 6, 9].includes(d.getUTCMonth()) && bd === 5;
  return false;
}
export function businessDayOfMonth(d: Date): number {
  let n = 0;
  for (let i = 1; i <= d.getUTCDate(); i++) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), i)).getUTCDay();
    if (x !== 0 && x !== 6) n++;
  }
  return n;
}

/** Sydney local date (as a UTC-midnight Date) and hour for a moment. */
export function sydneyParts(now: Date): { day: Date; hour: number; ymd: string } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const ymd = `${p.year}-${p.month}-${p.day}`;
  return { day: new Date(`${ymd}T00:00:00Z`), hour: Number(p.hour), ymd };
}

/**
 * Hourly tick: send every scheduled report that is due today (Sydney) and whose send hour has come, once per day.
 * Scheduled sends run as the owner (dry runs go to the owner).
 */
export async function runReportTick(now = new Date()): Promise<Array<{ id: string; result: SendResult }>> {
  const { day, hour, ymd } = sydneyParts(now);
  const reps = await prisma.report.findMany({ where: { schedule: { not: "OFF" } } });
  const owner = await prisma.user.findFirst({ where: { role: "OWNER" }, select: { name: true, email: true } });
  if (!owner) return [];
  const since = new Date(now.getTime() - 20 * 3600000);
  const out: Array<{ id: string; result: SendResult }> = [];
  for (const r of reps) {
    if (!isDue(r.schedule, day)) continue;
    if (Number(r.sendTime.split(":")[0]) > hour) continue;
    const done = await prisma.reportSend.findFirst({ where: { reportId: r.id, at: { gte: since }, by: { endsWith: "(scheduled)" } } });
    if (done) continue;
    const result = await sendReport(r.id, { name: `${owner.name} (scheduled)`, email: owner.email });
    out.push({ id: r.id, result });
    console.log(`[reports] ${ymd} ${r.name}: ${result.message}`);
  }
  return out;
}
