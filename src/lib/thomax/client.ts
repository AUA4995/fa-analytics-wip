import { buildQueryUrl, PAGE_LIMIT, type QueryParts, type ThomaxRecord } from "./shape";

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
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: authHeader(creds), Accept: "application/json" },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 150_000),
        cache: "no-store",
      });
    } catch (err) {
      if (attempt < maxRetries) {
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
    if (res.status === 401 || res.status === 403) throw new ThomaxError(`Thomax refused the login (${res.status}) — check the user name and password`, res.status);
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

/** { Status, Data: [...] } → rows. A non-array Data with a Status message is an error from Thomax. */
export function dataOf(body: unknown, table: string): ThomaxRecord[] {
  if (Array.isArray(body)) return body as ThomaxRecord[];
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const data = o.Data ?? o.data;
    if (Array.isArray(data)) return data.filter((r): r is ThomaxRecord => !!r && typeof r === "object" && !Array.isArray(r));
    const status = o.Status ?? o.status ?? o.Message ?? o.message;
    throw new ThomaxError(`Thomax ${table}: ${typeof status === "string" ? status : JSON.stringify(status ?? body).slice(0, 200)}`);
  }
  throw new ThomaxError(`Thomax ${table}: unexpected answer`);
}

/** All pages of a query (Limit + Skip) — calls onPage for each so big windows aren't held in memory. */
export async function queryAll(creds: ThomaxCreds, q: Omit<QueryParts, "limit" | "skip">, onPage: (rows: ThomaxRecord[]) => Promise<void>, opts: ClientOptions & { pageSize?: number } = {}): Promise<number> {
  const size = Math.min(opts.pageSize ?? PAGE_LIMIT, PAGE_LIMIT);
  let skip = 0;
  let total = 0;
  for (;;) {
    const rows = await queryPage(creds, { ...q, limit: size, skip }, opts);
    if (rows.length) await onPage(rows);
    total += rows.length;
    if (rows.length < size) return total;
    skip += rows.length;
  }
}
