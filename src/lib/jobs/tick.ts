import { prisma } from "@/lib/db";
import { SAFETY_MARGIN_MS, TICK_MAX_SECONDS } from "./runner";
import { doFrontTickets, doReportTick, doXeroSync, type FrontJob, type XeroJob } from "./work";

/**
 * One Vercel cron tick (/api/cron/tick every 5 minutes; batch 7). The same schedules as pg-boss on the laptop
 * (src/lib/jobs/scheduler.ts), worked out from the Sydney clock:
 *
 *   1. buttons first — "Sync now" / "Recount" / "Keep loading now" queued by people (Setting "cron:queue:<job>")
 *   2. Xero sync once a day from 05:30, Front tickets once a day from 05:45, report emails once an hour from :05
 *   3. Thomax: the nightly copy from 02:15 (carries on over several ticks until every table was tried tonight), then the
 *      history load 20:00–06:00 (or any time after "Keep loading now"), as many steps as the time allows
 *
 * A daily / hourly slot is claimed by creating its Setting row ("cron:slot:…", unique key), so two ticks that overlap
 * never run the same slot. Thomax has its own lock (one copy at a time). Every piece starts only if enough time is
 * left; what doesn't fit waits for the next tick.
 */

export interface TickReport {
  at: string;
  ran: Array<{ job: string; ok: boolean; summary: string }>;
  waiting: string[];
}

export const QUEUE_KEYS = { xero: "cron:queue:xero-sync", front: "cron:queue:front-tickets", thomaxNightly: "cron:queue:thomax-nightly", thomaxHistory: "cron:queue:thomax-history" } as const;
const HISTORY_ANYTIME = "cron:thomax-history-anytime";

/** Sydney wall clock parts. */
export function sydney(now: Date): { ymd: string; hour: number; minute: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

/** Claim a slot: true once, false for every later caller (unique Setting key; no error logged for the losers). */
export async function claimSlot(slot: string): Promise<boolean> {
  const value = JSON.stringify({ at: new Date().toISOString() });
  const n = await prisma.$executeRaw`INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES (${`cron:slot:${slot}`}, ${value}::jsonb, now()) ON CONFLICT ("key") DO NOTHING`;
  return n === 1;
}

/** A daily job that failed is tried again on later ticks, at most 3 times a day (then waits for tomorrow). */
async function releaseAfterFailure(slot: string): Promise<void> {
  const key = `cron:fail:${slot}`;
  const row = await prisma.setting.findUnique({ where: { key } });
  const tries = ((row?.value as { tries?: number } | null)?.tries ?? 0) + 1;
  await prisma.setting.upsert({ where: { key }, create: { key, value: { tries } }, update: { value: { tries } } });
  if (tries < 3) await prisma.setting.deleteMany({ where: { key: `cron:slot:${slot}` } });
}

/** Take a queued button request (deleted as it is taken, so only one tick gets it). */
async function take<T>(key: string): Promise<T | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return null;
  const del = await prisma.setting.deleteMany({ where: { key, updatedAt: row.updatedAt } });
  return del.count === 1 ? ((row.value ?? {}) as T) : null;
}

/**
 * Queue work for the next tick (cron mode's enqueue). A second press before the tick is merged, never lost: Xero
 * "Full re-read" wins over a normal sync, Front keeps the longest recount, history keeps "any time".
 */
export async function queueForTick(key: string, data: object): Promise<void> {
  const prev = ((await prisma.setting.findUnique({ where: { key } }))?.value ?? null) as Record<string, unknown> | null;
  const next: Record<string, unknown> = { ...(prev ?? {}), ...(data as Record<string, unknown>) };
  if (prev) {
    if (prev.kind === "FULL") next.kind = "FULL";
    if (typeof prev.months === "number" && typeof next.months === "number") next.months = Math.max(prev.months, next.months);
    if (prev.anyTime) next.anyTime = true;
  }
  await prisma.setting.upsert({ where: { key }, create: { key, value: next as never }, update: { value: next as never } });
}

export async function runTick(opts: { now?: Date; startedAt?: number; maxMs?: number } = {}): Promise<TickReport> {
  const started = opts.startedAt ?? Date.now();
  const deadline = started + (opts.maxMs ?? TICK_MAX_SECONDS * 1000) - SAFETY_MARGIN_MS;
  const left = () => deadline - Date.now();
  const now = opts.now ?? new Date();
  const s = sydney(now);
  const report: TickReport = { at: now.toISOString(), ran: [], waiting: [] };
  const run = async (job: string, fn: () => Promise<string>) => {
    try {
      report.ran.push({ job, ok: true, summary: await fn() });
    } catch (err) {
      report.ran.push({ job, ok: false, summary: err instanceof Error ? err.message : String(err) });
    }
  };

  // 1. buttons
  const qx = left() > 120_000 ? await take<XeroJob>(QUEUE_KEYS.xero) : null;
  if (qx) await run("xero-sync (button)", () => doXeroSync(qx));
  const qf = left() > 120_000 ? await take<FrontJob>(QUEUE_KEYS.front) : null;
  if (qf) await run("front-tickets (button)", () => doFrontTickets(qf));
  const qh = await take<{ anyTime?: boolean }>(QUEUE_KEYS.thomaxHistory);
  if (qh?.anyTime) await queueForTick(HISTORY_ANYTIME, { since: new Date().toISOString() });
  const qn = await take<object>(QUEUE_KEYS.thomaxNightly);

  // 2. daily / hourly schedules
  const mins = s.hour * 60 + s.minute;
  const daily = async (slot: string, job: string, fn: () => Promise<string>) => {
    if (!(await claimSlot(slot))) return;
    await run(job, fn);
    if (!report.ran.at(-1)?.ok) await releaseAfterFailure(slot);
  };
  if (mins >= 5 * 60 + 30) {
    if (left() > 120_000) await daily(`xero-sync:${s.ymd}`, "xero-sync", () => doXeroSync({ kind: "INCREMENTAL" }));
    else report.waiting.push("xero-sync");
  }
  if (mins >= 5 * 60 + 45 && left() > 90_000) await daily(`front-tickets:${s.ymd}`, "front-tickets", () => doFrontTickets({ months: 2 }));
  if (s.minute >= 5 && left() > 60_000 && (await claimSlot(`reports:${s.ymd}:${String(s.hour).padStart(2, "0")}`))) await run("reports", () => doReportTick(now));

  // 3. Thomax
  const { getCreds, historyRemaining, historyStep, nightly } = await import("@/lib/thomax/sync");
  if (await getCreds()) {
    const nightKey = `cron:thomax-nightly-tried:${s.ymd}`;
    const nightlyWindow = (mins >= 2 * 60 + 15 && mins < 6 * 60) || !!qn;
    if (nightlyWindow && left() > 90_000) {
      const tried = ((await prisma.setting.findUnique({ where: { key: nightKey } }))?.value as { tables?: string[]; done?: boolean } | null) ?? {};
      if (!tried.done || qn) {
        const r = await nightly(new Date(), { signal: AbortSignal.timeout(Math.max(10_000, left())), skip: qn ? [] : tried.tables ?? [] });
        const tables = [...new Set([...(qn ? [] : tried.tables ?? []), ...(r.tried ?? [])])];
        if (!r.busy) await prisma.setting.upsert({ where: { key: nightKey }, create: { key: nightKey, value: { tables, done: r.remaining === 0 && !r.stopped } }, update: { value: { tables, done: r.remaining === 0 && !r.stopped } } });
        report.ran.push({ job: "thomax-nightly", ok: !r.errors.length, summary: r.busy ? "another copy is running" : `${r.windows} tables, ${r.rows} rows${r.remaining ? `, ${r.remaining} left for the next tick` : ""}${r.stopped ? ` — ${r.stopped}` : ""}${r.errors.length ? ` — ${r.errors.length} problem${r.errors.length === 1 ? "" : "s"}, first: ${r.errors[0]}` : ""}` });
      }
    }
    // "Keep loading now" carries on outside 20:00–06:00 for 3 hours only, so Thomax isn't loaded all business day
    const anyRow = await prisma.setting.findUnique({ where: { key: HISTORY_ANYTIME } });
    const anySince = Date.parse(String((anyRow?.value as { since?: string } | null)?.since ?? ""));
    const anyTime = !!anyRow && Number.isFinite(anySince) && Date.now() - anySince < 3 * 3_600_000;
    if (anyRow && !anyTime) await prisma.setting.deleteMany({ where: { key: HISTORY_ANYTIME } });
    const { thomaxWindowOpen } = await import("@/lib/thomax/window");
    const nightlyPending = mins >= 2 * 60 + 15 && mins < 6 * 60 && !((await prisma.setting.findUnique({ where: { key: nightKey } }))?.value as { done?: boolean } | null)?.done;
    if ((anyTime || thomaxWindowOpen(now)) && !nightlyPending) {
      let steps = 0;
      while (left() > 90_000) {
        const r = await historyStep(6, new Date(), { signal: AbortSignal.timeout(Math.max(10_000, left())) });
        steps++;
        if (r.busy || r.stopped || r.windows === 0) {
          if (r.stopped && !r.busy) report.ran.push({ job: "thomax-history", ok: !r.errors.length, summary: r.stopped });
          break;
        }
        if (r.remaining === 0) break;
      }
      const remaining = await historyRemaining(new Date());
      if (remaining === 0 && anyTime) await prisma.setting.deleteMany({ where: { key: HISTORY_ANYTIME } });
      if (steps) report.ran.push({ job: "thomax-history", ok: true, summary: `${steps} step${steps === 1 ? "" : "s"}, ${remaining} month windows left` });
    }
  }

  // housekeeping once a day: slot markers older than 3 days
  if (s.hour === 4 && s.minute < 5) await prisma.setting.deleteMany({ where: { key: { startsWith: "cron:" }, NOT: { key: { startsWith: "cron:queue:" } }, updatedAt: { lt: new Date(now.getTime() - 3 * 86_400_000) } } }).catch(() => {});
  return report;
}
