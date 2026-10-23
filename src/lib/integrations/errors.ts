/**
 * Plain-words connection problems (Batch 2 item 15). Each integration's raw error (HTTP status + message) becomes
 * a code when it is recorded, and a reason + what to do when it is shown. Never "error"/"failed" on its own.
 */

export type IntegrationKey = "xero" | "front" | "ai";

export interface RawFailure {
  message: string;
  status?: number | null;
}

export interface Problem {
  code: string;
  /** What went wrong, e.g. "Xero login expired" */
  reason: string;
  /** What to do, e.g. "The owner needs to reconnect Xero in Settings → Connections & AI." */
  action: string;
}

export interface DescribeContext {
  /** When it happened */
  at: Date;
  /** When the app will try again (Xero) */
  nextRetryAt?: Date | null;
  timeZone: string;
  ownerName: string;
  /** Today in the company time zone (YYYY-MM-DD) — times on other days get their date */
  now?: Date;
}

const NETWORK = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|UND_ERR|fetch failed|timed? ?out|timeout|aborted|socket hang up|network|overloaded/i;

/** HTTP status from an error object or a message like "... failed (503)". */
export function statusOf(err: unknown): number | null {
  if (err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number") return (err as { status: number }).status;
  const m = /\((\d{3})\)/.exec(err instanceof Error ? err.message : String(err ?? ""));
  return m ? Number(m[1]) : null;
}

export function toRawFailure(err: unknown): RawFailure {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const body = err && typeof err === "object" && "body" in err && typeof (err as { body: unknown }).body === "string" ? ` ${(err as { body: string }).body}` : "";
  return { message: `${message}${body}`.slice(0, 600), status: statusOf(err) };
}

export function classifyCode(key: IntegrationKey, f: RawFailure): string {
  const msg = f.message ?? "";
  const st = f.status ?? null;
  if (key === "xero") {
    if (/not connected/i.test(msg)) return "not_connected";
    if (/invalid_grant|refresh[_ ]token|token request failed \((400|401)\)|unauthori[sz]ed_client/i.test(msg) || st === 401) return "login_expired";
    if (st === 403) return "forbidden";
    if (st === 429) return "rate_limited";
    if ((st !== null && st >= 500) || NETWORK.test(msg)) return "unavailable";
    return "other";
  }
  if (key === "front") {
    if (/FRONT_API_TOKEN is not set/i.test(msg)) return "not_configured";
    if (st === 401) return "token_rejected";
    if (st === 403 || /Front token needs/i.test(msg)) return "missing_permission";
    if (st === 429) return "rate_limited";
    if ((st !== null && st >= 500) || NETWORK.test(msg)) return "unavailable";
    return "other";
  }
  if (/ANTHROPIC_API_KEY is not set/i.test(msg)) return "not_configured";
  if (st === 401 || /key was rejected|invalid x-api-key/i.test(msg)) return "key_rejected";
  if (/credit balance/i.test(msg)) return "credit_used_up";
  if (/failed replies in a row/i.test(msg)) return "replies_unreadable";
  if (st === 403) return "key_forbidden";
  if (st === 404 || /model .* not found/i.test(msg)) return "model_not_found";
  if (st === 429) return "rate_limited";
  if ((st !== null && st >= 500) || NETWORK.test(msg)) return "unavailable";
  return "other";
}

function sameDay(a: Date, b: Date, timeZone: string): boolean {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(a) === f.format(b);
}

/** "06:00" today, else "21/10/2026 06:00" (company time zone). */
export function whenText(d: Date, timeZone: string, now = new Date()): string {
  const time = d.toLocaleTimeString("en-AU", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (sameDay(d, now, timeZone)) return time;
  const date = d.toLocaleDateString("en-AU", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" });
  return `${date} ${time}`;
}

/** First line of a raw message, without JSON bodies or stack traces, ending with a full stop. */
export function plainDetail(message: string): string {
  let s = (message ?? "").split("\n")[0];
  // A bug inside the app, not something the person can act on: say so plainly (the raw text stays in the log/detail).
  if (/^(TypeError|ReferenceError|SyntaxError|RangeError)\b|Cannot read propert|is not a function|undefined|null/i.test(s)) {
    return "An unexpected problem inside the app (details are in the server log).";
  }
  const brace = s.search(/[{[]/);
  if (brace > 0) s = s.slice(0, brace);
  s = s.replace(/\s+/g, " ").replace(/[:\s-]+$/, "").trim();
  if (!s) return "No details were given.";
  if (s.length > 160) s = `${s.slice(0, 157).trimEnd()}…`;
  s = s[0].toUpperCase() + s.slice(1);
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

/** The permission named in a Front 403 ("Front token needs comments write" → "comments write"). */
export function frontPermissionFrom(message: string): string | null {
  const m = /Front token needs ([^.\n(]+?)(?:\s*\(|\.|$|\n)/i.exec(message);
  return m ? m[1].trim() : null;
}

export function describeProblem(key: IntegrationKey, code: string, f: RawFailure, ctx: DescribeContext): Problem {
  const at = whenText(ctx.at, ctx.timeZone, ctx.now);
  const owner = ctx.ownerName;
  const retry = ctx.nextRetryAt ? whenText(ctx.nextRetryAt, ctx.timeZone, ctx.now) : null;
  const p = (reason: string, action: string): Problem => ({ code, reason, action });
  if (key === "xero") {
    switch (code) {
      case "not_connected":
        return p("Xero isn't connected", `Ask ${owner} to connect Xero in Settings → Connections & AI.`);
      case "login_expired":
        return p("Xero login expired", `${owner} (owner) needs to reconnect Xero in Settings → Connections & AI. Synced data is kept.`);
      case "forbidden":
        return p("Xero refused access to the organisation", `${owner} (owner) needs to reconnect Xero and tick the organisation again.`);
      case "rate_limited":
        return p(`Xero asked the app to slow down at ${at}`, retry ? `Retrying at ${retry}.` : "It tries again at the next sync.");
      case "unavailable":
        return p(`Xero didn't respond at ${at}`, retry ? `Retrying at ${retry}.` : "It tries again at the next sync — or press Sync now.");
      default:
        return p(`Xero sync stopped at ${at}: ${plainDetail(f.message)}`, `Press Sync now to try again. If it happens again, tell ${owner}.`);
    }
  }
  if (key === "front") {
    switch (code) {
      case "not_configured":
        return p("Front isn't connected", `Ask ${owner} to connect Front.`);
      case "token_rejected":
        return p("Front token removed or changed", `${owner} (owner) needs to create a new Front API token, put it in .env as FRONT_API_TOKEN and restart the app.`);
      case "missing_permission": {
        const perm = frontPermissionFrom(f.message) ?? "a permission";
        return p(`Front token is missing the permission “${perm}”`, `${owner} (owner) needs to add it to the token in Front → Settings → Developers → API tokens.`);
      }
      case "rate_limited":
        return p(`Front asked the app to slow down at ${at}`, "It tries again at the next scan.");
      case "unavailable":
        return p(`Front didn't respond at ${at}`, "It tries again at the next scan (every 30 minutes in business hours).");
      default:
        return p(`Front stopped at ${at}: ${plainDetail(f.message)}`, `Press Refresh from Front to try again. If it happens again, tell ${owner}.`);
    }
  }
  switch (code) {
    case "not_configured":
      return p("Claude AI isn't connected", `Ask ${owner} to add the Claude API key.`);
    case "key_rejected":
      return p("Claude key not accepted", `${owner} (owner) needs to check ANTHROPIC_API_KEY in .env (console.anthropic.com → API keys) and restart the app.`);
    case "credit_used_up":
      return p("Claude credit used up", `${owner} (owner) needs to add credit at console.anthropic.com → Billing. AI jobs are skipped until then; everything else keeps working.`);
    case "key_forbidden":
      return p("Claude key isn't allowed to do this", `${owner} (owner) needs to check the key's permissions at console.anthropic.com.`);
    case "model_not_found":
      return p("Claude model not found", "An admin should pick another model in AI models and budget.");
    case "replies_unreadable":
      return p(`Claude's answers couldn't be read at ${at} — that AI job is paused for an hour`, `No more calls (or cost) for that job until then; everything else keeps working. If it happens again, tell ${owner}.`);
    case "rate_limited":
      return p(`Claude asked the app to slow down at ${at}`, "AI jobs try again at the next scan.");
    case "unavailable":
      return p(`Claude didn't respond at ${at}`, "AI jobs try again at the next scan.");
    default:
      return p(`Claude AI stopped at ${at}: ${plainDetail(f.message)}`, `If it happens again, tell ${owner}.`);
  }
}

/** "Monthly AI budget reached (US$30.00) — AI paused until 01/11" */
export function budgetProblem(budgetUsd: number, month: string): Problem {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return {
    code: "budget",
    reason: `Monthly AI budget reached (US$${budgetUsd.toFixed(2)}) — AI paused until 01/${String(next.m).padStart(2, "0")}/${next.y}`,
    action: "An admin can raise the budget in AI models and budget. Everything else keeps working.",
  };
}

/** Transient failures worth retrying soon (timeouts, 5xx, rate limits). */
export function isTransient(code: string): boolean {
  return code === "unavailable" || code === "rate_limited";
}
