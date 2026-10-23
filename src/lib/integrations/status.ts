import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { budgetProblem, classifyCode, describeProblem, plainDetail, toRawFailure, whenText, type IntegrationKey, type Problem, type RawFailure } from "./errors";

/**
 * Connection status per integration (Batch 2 item 15), stored in IntegrationStatus so it survives restarts.
 * Recorded where Xero syncs, Front scans/writes and Claude calls succeed or fail.
 */

export type { IntegrationKey } from "./errors";

const lastWrite = new Map<string, number>();
/** Successes are frequent (every AI call / Front write): write at most once a minute per key. */
const SUCCESS_THROTTLE_MS = 60_000;

export async function recordSuccess(key: IntegrationKey, at = new Date(), opts: { throttle?: boolean } = {}): Promise<void> {
  if (opts.throttle) {
    const last = lastWrite.get(`ok:${key}`) ?? 0;
    if (at.getTime() - last < SUCCESS_THROTTLE_MS) return;
    lastWrite.set(`ok:${key}`, at.getTime());
  }
  await prisma.integrationStatus.upsert({
    where: { key },
    create: { key, lastSuccessAt: at },
    update: { lastSuccessAt: at, nextRetryAt: null },
  });
}

export async function recordFailure(key: IntegrationKey, err: unknown, opts: { at?: Date; nextRetryAt?: Date | null } = {}): Promise<string> {
  const f: RawFailure = err && typeof err === "object" && "message" in err && !(err instanceof Error) ? (err as RawFailure) : toRawFailure(err);
  const code = classifyCode(key, f);
  const at = opts.at ?? new Date();
  lastWrite.delete(`ok:${key}`);
  const data = { lastErrorAt: at, errorCode: code, errorStatus: f.status ?? null, errorMessage: f.message.slice(0, 600), nextRetryAt: opts.nextRetryAt ?? null };
  await prisma.integrationStatus.upsert({ where: { key }, create: { key, ...data }, update: data });
  return code;
}

export const recordFrontFailure = (err: unknown) => recordFailure("front", err);

export async function setNextRetry(key: IntegrationKey, at: Date | null): Promise<void> {
  await prisma.integrationStatus.upsert({ where: { key }, create: { key, nextRetryAt: at }, update: { nextRetryAt: at } });
}

/** Disconnect: forget errors and successes (status falls back to "Not connected"). */
export async function clearStatus(key: IntegrationKey): Promise<void> {
  await prisma.integrationStatus.deleteMany({ where: { key } });
}

// ---------- Front permissions (item 11) ----------

export interface PermissionCheck {
  /** true = works · false = Front said no (403) · null = couldn't check (e.g. Front didn't answer) */
  ok: boolean | null;
  at: string;
  kind: "read" | "write";
  detail?: string;
}

export async function getFrontChecks(): Promise<{ checks: Record<string, PermissionCheck>; checkedAt: Date | null }> {
  const row = await prisma.integrationStatus.findUnique({ where: { key: "front" }, select: { checks: true, checkedAt: true } }).catch(() => null);
  const checks = row?.checks && typeof row.checks === "object" && !Array.isArray(row.checks) ? (row.checks as unknown as Record<string, PermissionCheck>) : {};
  return { checks, checkedAt: row?.checkedAt ?? null };
}

/** Merge permission results into the stored map. `checkedAt` marks a full read check. */
export async function saveFrontChecks(update: Record<string, PermissionCheck>, opts: { fullReadCheck?: boolean } = {}): Promise<void> {
  const { checks } = await getFrontChecks();
  const value = { ...checks, ...update } as unknown as Prisma.InputJsonValue;
  const extra = opts.fullReadCheck ? { checkedAt: new Date() } : {};
  await prisma.integrationStatus.upsert({ where: { key: "front" }, create: { key: "front", checks: value, ...extra }, update: { checks: value, ...extra } });
}

/**
 * Called (fire-and-forget) by the Front client after every write call and every 401/403:
 * write permissions turn ✓ / ✗ from real use; a 401 means the token was removed or changed.
 */
export async function onFrontCall(e: { method: string; path: string; status: number; permission: string }): Promise<void> {
  const isWrite = e.method.toUpperCase() !== "GET";
  // Same names as the permissions box rows (src/lib/integrations/front-permissions.ts)
  e = { ...e, permission: e.permission.startsWith("shared resources") ? "shared resources" : e.permission.replace(/ \(attachments\)$/, "") };
  if (e.status === 401) {
    await recordFailure("front", { message: `Front ${e.method} ${e.path} failed (401)`, status: 401 });
    return;
  }
  if (e.status === 403) {
    await recordFailure("front", { message: `Front token needs ${e.permission}`, status: 403 });
    await saveFrontChecks({ [e.permission]: { ok: false, at: new Date().toISOString(), kind: isWrite ? "write" : "read", detail: "Front said no (403)" } });
    return;
  }
  if (isWrite && e.status >= 200 && e.status < 300) {
    const k = `perm:${e.permission}`;
    const last = lastWrite.get(k) ?? 0;
    if (Date.now() - last < 10 * 60_000) return;
    lastWrite.set(k, Date.now());
    await saveFrontChecks({ [e.permission]: { ok: true, at: new Date().toISOString(), kind: "write" } });
  }
}

// ---------- What Settings shows ----------

export type ConnectionState = "connected" | "disconnected" | "error";

export interface ConnectionStatus {
  key: IntegrationKey;
  name: string;
  state: ConnectionState;
  /** One plain line, e.g. "Connected · last sync 06:00" / "Not connected — ask Asal to connect" / the problem */
  headline: string;
  problem?: Problem;
  /** First line of the raw message (no JSON), shown small under the problem for whoever fixes it */
  detail?: string;
  lastSuccessAt: Date | null;
}

export interface StatusInputs {
  timeZone: string;
  ownerName: string;
  now?: Date;
  xero: { configured: boolean; connected: boolean; lastSyncAt: Date | null };
  front: { configured: boolean; lastScanAt: Date | null };
  ai: { configured: boolean; budgetPaused: boolean; budgetUsd: number; month: string; lastCallAt: Date | null };
  rows: Partial<Record<IntegrationKey, { lastSuccessAt: Date | null; lastErrorAt: Date | null; errorCode: string | null; errorStatus: number | null; errorMessage: string | null; nextRetryAt: Date | null }>>;
}

const NAMES: Record<IntegrationKey, string> = { xero: "Xero", front: "Front", ai: "Claude AI" };

/** Pure: turns stored rows + live facts into the three statuses. Unit-tested. */
export function buildStatuses(inp: StatusInputs): ConnectionStatus[] {
  const now = inp.now ?? new Date();
  const when = (d: Date | null) => (d ? whenText(d, inp.timeZone, now) : null);
  const out: ConnectionStatus[] = [];
  const one = (key: IntegrationKey, configured: boolean, lastOk: Date | null, okWord: string, extraError?: Problem | null) => {
    const row = inp.rows[key];
    const lastSuccessAt = [lastOk, row?.lastSuccessAt ?? null].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    if (!configured) {
      out.push({ key, name: NAMES[key], state: "disconnected", headline: `Not connected — ask ${inp.ownerName} to connect`, lastSuccessAt });
      return;
    }
    if (extraError) {
      out.push({ key, name: NAMES[key], state: "error", headline: `${extraError.reason}. ${extraError.action}`, problem: extraError, lastSuccessAt });
      return;
    }
    const errorIsLatest = row?.lastErrorAt && row.errorCode && (!lastSuccessAt || row.lastErrorAt > lastSuccessAt);
    if (errorIsLatest && row?.lastErrorAt && row.errorCode) {
      const problem = describeProblem(key, row.errorCode, { message: row.errorMessage ?? "", status: row.errorStatus }, { at: row.lastErrorAt, nextRetryAt: row.nextRetryAt, timeZone: inp.timeZone, ownerName: inp.ownerName, now });
      out.push({ key, name: NAMES[key], state: "error", headline: `${problem.reason}. ${problem.action}`, problem, detail: row.errorMessage ? plainDetail(row.errorMessage) : undefined, lastSuccessAt });
      return;
    }
    out.push({ key, name: NAMES[key], state: "connected", headline: lastSuccessAt ? `Connected · last ${okWord} ${when(lastSuccessAt)}` : `Connected · no ${okWord} yet`, lastSuccessAt });
  };
  one("xero", inp.xero.configured && inp.xero.connected, inp.xero.lastSyncAt, "sync");
  one("front", inp.front.configured, inp.front.lastScanAt, "scan");
  one("ai", inp.ai.configured, inp.ai.lastCallAt, "AI call", inp.ai.budgetPaused ? budgetProblem(inp.ai.budgetUsd, inp.ai.month) : null);
  return out;
}

/** Loads everything and returns the connection statuses (Settings → Company, Data sources). */
export async function getConnectionStatuses(): Promise<ConnectionStatus[]> {
  const [{ getCompany }, { ownerName }, { getConnection }, { isXeroConfigured }, { isFrontConfigured }] = await Promise.all([
    import("@/lib/company"),
    import("@/lib/auth/session"),
    import("@/lib/xero/auth"),
    import("@/lib/xero/config"),
    import("@/lib/front/client"),
  ]);
  const [company, owner, conn, rows, lastAi] = await Promise.all([
    getCompany(),
    ownerName(),
    getConnection().catch(() => null),
    prisma.integrationStatus.findMany().catch(() => []),
    prisma.aiCallLog.findFirst({ where: { ok: true }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null),
  ]);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  return buildStatuses({
    timeZone: company.timezone,
    ownerName: owner,
    xero: { configured: isXeroConfigured() && !!process.env.TOKEN_ENCRYPTION_KEY, connected: !!conn, lastSyncAt: conn?.lastSyncAt ?? null },
    front: { configured: isFrontConfigured(), lastScanAt: byKey.front?.lastSuccessAt ?? null },
    ai: { configured: !!process.env.ANTHROPIC_API_KEY, budgetPaused: false, budgetUsd: 0, month: "2026-01", lastCallAt: lastAi?.createdAt ?? null },
    rows: byKey,
  });
}
