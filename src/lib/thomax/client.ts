import { buildQueryUrl, PAGE_LIMIT, PAGE_SIZE, type QueryParts, type ThomaxRecord } from "./shape";

/**
 * Thomax (.wms) Query API client — read only, one GET per call.
 *   https://<cluster>.dotwms.com/api/2.0/QueryAPI/?Table=…&Where=…&OrderBy=…&Limit=…&Skip=…
 *   Basic auth with a .wms user login. Response: { Status, Data: [ {…} ] }.
 *   Rate limit: a time queue with up to 120 s wait; 429 → back off, doubling the wait.
 */

export interface ThomaxCreds {
  cluster: string;
  username: string;
  password: string;
}

export class ThomaxError extends Error {
  constructor(
    message: string,
    public status: number | null = null,
  ) {
    super(message);
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** Per-request timeout; Thomax may queue a request up to 120 s */
  timeoutMs?: number;
  maxRetries?: number;
  /** Stops waiting and paging when the job is cancelled or times out */
  signal?: AbortSignal;
  /** Called before every try (heartbeat while Thomax is slow or unreachable) */
  onAttempt?: () => Promise<void> | void;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function authHeader(creds: ThomaxCreds): string {
  return `Basic ${Buffer.from(`${creds.username}:${creds.password}`, "utf8").toString("base64")}`;
}

/** One page. Retries 429 / 503 / timeouts with doubling waits (5 s, 10 s, 20 s …). */
export async function queryPage(creds: ThomaxCreds, q: QueryParts, opts: ClientOptions = {}): Promise<ThomaxRecord[]> {
  const fetchImpl = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const sleep = opts.sleep ?? realSleep;
  const maxRetries = opts.maxRetries ?? 5;
  const url = buildQueryUrl(creds.cluster, q);
  let wait = 5_000;
  for (let attempt = 0; ; attempt++) {
    if (opts.signal?.aborted) throw new ThomaxError("Stopped (the job was cancelled or ran out of time).");
    let res: Response;
    await opts.onAttempt?.();
    try {
      const timeout = AbortSignal.timeout(opts.timeoutMs ?? 150_000);
      res = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: authHeader(creds), Accept: "application/json" },
        signal: opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout,
        cache: "no-store",
        // Never follow a redirect with the login attached
        redirect: "error",
      });
    } catch (err) {
      // A name that doesn't exist won't start working on a retry
      const dns = /ENOTFOUND|EAI_AGAIN|getaddrinfo/.test(String((err as { cause?: unknown })?.cause ?? err));
      if (attempt < maxRetries && !dns && !opts.signal?.aborted) {
        await sleep(wait);
        wait *= 2;
        continue;
      }
      throw new ThomaxError(`Thomax didn't answer (${err instanceof Error ? err.message : String(err)})`);
    }
    if ((res.status === 429 || res.status === 503 || res.status === 502 || res.status === 504) && attempt < maxRetries) {
      await sleep(wait);
      wait *= 2;
      continue;
    }
    const text = await res.text();
    if (res.status === 401) throw new ThomaxError(`Thomax refused the login (401) — check the user name and password`, 401);
    if (res.status === 403) throw new ThomaxError(`Thomax: this .wms user isn't allowed to read ${q.table} (403)`, 403);
    if (!res.ok) throw new ThomaxError(`Thomax ${q.table} failed (${res.status}): ${text.slice(0, 300)}`, res.status);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ThomaxError(`Thomax ${q.table}: the answer wasn't JSON: ${text.slice(0, 200)}`, res.status);
    }
    return dataOf(body, q.table);
  }
}

/**
 * { Status, Data: [...] } → rows. A Status that reads like an error is an error even when Data is an empty list
 * (otherwise a failed month would be marked as loaded with 0 rows).
 */
export function dataOf(body: unknown, table: string): ThomaxRecord[] {
  if (Array.isArray(body)) return body as ThomaxRecord[];
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const data = o.Data ?? o.data;
    const status = o.Status ?? o.status;
    if (typeof status === "string" && /error|invalid|fail|denied|exceed|not\s*found|unknown|exception|time[ds]?\s*out|timeout/i.test(status)) throw new ThomaxError(`Thomax ${table}: ${status.slice(0, 300)}`);
    if (Array.isArray(data)) {
      // An empty page with a Status that isn't plainly "OK" could be a failure we don't recognise: don't count it as loaded
      if (!data.length && typeof status === "string" && status.trim() && !/^(ok|success(ful)?|succeeded|completed?|done|200|true|no\s*(data|rows|records)(\s*found)?|0\s*(rows|records)(\s*found)?)$/i.test(status.trim())) throw new ThomaxError(`Thomax ${table}: no rows, status "${status.slice(0, 200)}"`);
      return data.filter((r): r is ThomaxRecord => !!r && typeof r === "object" && !Array.isArray(r));
    }
    const why = status ?? o.Message ?? o.message;
    throw new ThomaxError(`Thomax ${table}: ${typeof why === "string" ? why.slice(0, 300) : JSON.stringify(why ?? body).slice(0, 200)}`);
  }
  throw new ThomaxError(`Thomax ${table}: unexpected answer`);
}

/** Safety stop: no window or table is read for more pages than this (10,000 × 400 = 4 million rows). */
export const MAX_PAGES = 400;

/**
 * All pages of a query (Limit + Skip) — calls onPage for each so big windows aren't held in memory.
 * Order by a unique field (the table's key) so Skip can't skip or repeat rows. Stops at MAX_PAGES, or if Thomax
 * sends the same page twice (it ignored Skip), instead of looping forever.
 */
export async function queryAll(creds: ThomaxCreds, q: Omit<QueryParts, "limit" | "skip">, onPage: (rows: ThomaxRecord[]) => Promise<void>, opts: ClientOptions & { pageSize?: number } = {}): Promise<number> {
  const size = Math.min(opts.pageSize ?? PAGE_SIZE, PAGE_LIMIT);
  let skip = 0;
  let total = 0;
  let lastFirst: string | null = null;
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) throw new ThomaxError(`Thomax ${q.table}: more than ${MAX_PAGES} pages — stopped. Use smaller windows.`);
    if (opts.signal?.aborted) throw new ThomaxError("Stopped (the job was cancelled or ran out of time).");
    const rows = await queryPage(creds, { ...q, limit: size, skip }, opts);
    const first = rows.length ? JSON.stringify(rows[0]) : null;
    if (first && first === lastFirst) throw new ThomaxError(`Thomax ${q.table}: the same page came back twice (Skip ignored?) — stopped.`);
    lastFirst = first;
    if (rows.length) await onPage(rows);
    total += rows.length;
    if (rows.length < size) return total;
    skip += rows.length;
  }
}
