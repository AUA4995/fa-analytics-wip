/**
 * Front Core API client — the ONLY file that knows Front's endpoints and JSON shapes.
 * Base: https://api2.frontapp.com · Token: FRONT_API_TOKEN (Bearer).
 *
 * Token permissions the app needs (Front → Settings → Developers → API tokens):
 *   shared resources · messages:send · conversations read + write · messages read · comments write
 *   tags read + write · drafts write · events read · ticket statuses read
 *
 * Endpoints (checked against dev.frontapp.com on 21/10/2026 unless marked TODO):
 *   GET   /inboxes                                    list inboxes (is_private → personal, never read)
 *   GET   /inboxes/{id}/conversations?q[...]          conversations of an inbox (q.status_categories with ticketing)
 *   GET   /conversations/{id}                         one conversation (status, status_id, status_category, ticket_ids, …)
 *   GET   /conversations/{id}/messages                messages (newest first)
 *   GET   /conversations/{id}/comments                internal comments
 *   GET   /conversations/{id}/events                  activity (newest first) — type, source._meta.type, target, emitted_at
 *   GET   /conversations/search/{query}               full-text search (sorted by last activity)
 *   GET   /tags · /tags/{id}/children                 tags with description; children per parent tag
 *   GET   /company/statuses                           ticket statuses (id, name, category open|waiting|resolved, description)
 *   POST  /conversations/{id}/comments  {body}        internal comment (201)
 *   POST  /conversations/{id}/tags      {tag_ids}     add tags (204)
 *   PATCH /conversations/{id}  {status_id} | {status} set ticket status / archive / open (204; only one of the two)
 *   PUT   /conversations/{id}/assignee {assignee_id}  assign
 *   POST  /channels/{id}/drafts                       draft (body required, mode private|shared)
 *   POST  /channels/{id}/messages                     new outbound message
 *   POST  /conversations/{id}/messages                reply in a conversation
 */

export const FRONT_API_BASE = "https://api2.frontapp.com";

export interface FrontChannel {
  id: string;
  name: string;
  address: string;
  type: string;
  is_valid?: boolean;
}

export class FrontApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
  }
}

/** 403 from Front: the token is missing a permission. `message` says which, in plain words. */
export class FrontPermissionError extends FrontApiError {
  constructor(
    public readonly permission: string,
    status: number,
    body: string,
  ) {
    super(`Front token needs ${permission}`, status, body);
  }
}

export function isFrontConfigured(): boolean {
  return !!process.env.FRONT_API_TOKEN;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.FRONT_API_TOKEN;
  if (!token) throw new Error("FRONT_API_TOKEN is not set — see .env.example");
  return { Authorization: `Bearer ${token}`, Accept: "application/json", ...extra };
}

/** Which token permission a call needs — used to turn a 403 into a clear message. */
export function permissionFor(method: string, path: string): string {
  const m = method.toUpperCase();
  const p = path.split("?")[0];
  if (/\/comments$/.test(p)) return m === "GET" ? "comments read" : "comments write";
  if (/\/drafts$/.test(p)) return "drafts write";
  if (/\/messages$/.test(p)) return m === "GET" ? "messages read" : "messages:send";
  if (/\/events$/.test(p)) return "events read";
  if (p.startsWith("/tags") || /\/tags$/.test(p)) return m === "GET" ? "tags read" : "tags write";
  if (p.startsWith("/company/statuses")) return "ticket statuses read";
  if (p.startsWith("/inboxes") && !p.includes("/conversations")) return "shared resources (inboxes read)";
  if (p.startsWith("/channels")) return "shared resources (channels read)";
  if (p.startsWith("/teammates")) return "shared resources (teammates read)";
  if (p.includes("/attachments") || p.includes("/download")) return "messages read (attachments)";
  if (p.includes("/conversations")) return m === "GET" ? "conversations read" : "conversations write";
  return "access to this resource";
}

/**
 * Batch 2 (items 11, 15): after every write call and every 401/403, tell Settings → Connections (fire-and-forget,
 * never blocks or breaks the call). Write permissions turn ✓/✗ from real use; 401 = token removed or changed.
 */
function notifyCall(method: string, rel: string, status: number): void {
  const m = method.toUpperCase();
  if (m === "GET" && status !== 401 && status !== 403) return;
  const permission = permissionFor(m, rel);
  void import("@/lib/integrations/status")
    .then((s) => s.onFrontCall({ method: m, path: rel.split("?")[0], status, permission }))
    .catch(() => {});
}

async function frontFetch<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const url = path.startsWith("http") ? path : `${FRONT_API_BASE}${path}`;
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (res.status === 429 && attempt < 3) {
    const wait = Math.min(Number(res.headers.get("retry-after") ?? "5") || 5, 60);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return frontFetch<T>(path, init, attempt + 1);
  }
  notifyCall(init.method ?? "GET", url.replace(FRONT_API_BASE, ""), res.status);
  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    const rel = url.replace(FRONT_API_BASE, "");
    if (res.status === 403) throw new FrontPermissionError(permissionFor(init.method ?? "GET", rel), res.status, body);
    throw new FrontApiError(`Front ${init.method ?? "GET"} ${rel.split("?")[0]} failed (${res.status})`, res.status, body);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

interface Page<T> {
  _results?: T[];
  _pagination?: { next?: string | null };
}

/** Follow `_pagination.next` until done, `maxItems` reached, or `stop(item)` returns true (item not included). */
async function paginate<T>(path: string, opts: { maxItems?: number; stop?: (item: T) => boolean } = {}): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  const max = opts.maxItems ?? 1000;
  while (next) {
    const page: Page<T> = await frontFetch<Page<T>>(next, { headers: headers() });
    for (const item of page._results ?? []) {
      if (opts.stop?.(item)) return out;
      out.push(item);
      if (out.length >= max) return out;
    }
    next = page._pagination?.next ?? null;
  }
  return out;
}

const enc = encodeURIComponent;
const secs = (n: number | null | undefined): Date | null => (typeof n === "number" && n > 0 ? new Date(n * 1000) : null);

export function frontConversationUrl(conversationId: string): string {
  return `https://app.frontapp.com/open/${conversationId}`;
}

/** Permission check (Settings → Front permissions box): one cheap GET that never throws for an HTTP error. */
export async function probeFront(path: string): Promise<{ status: number; firstId: string | null }> {
  const res = await fetch(`${FRONT_API_BASE}${path}`, { headers: headers(), cache: "no-store" });
  let firstId: string | null = null;
  if (res.ok) {
    try {
      const j = (await res.json()) as { _results?: Array<{ id?: string }> };
      firstId = j._results?.[0]?.id ?? null;
    } catch {
      /* body not needed */
    }
  } else {
    await res.text().catch(() => "");
  }
  return { status: res.status, firstId };
}

// ---------- Channels + sending ----------

export async function listChannels(): Promise<FrontChannel[]> {
  const body = await frontFetch<{ _results: FrontChannel[] }>("/channels", { headers: headers() });
  return (body._results ?? []).map((c) => ({ id: c.id, name: c.name, address: c.address, type: c.type, is_valid: c.is_valid }));
}

export interface SendEmailInput {
  channelId: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  senderName?: string;
}

/** Sends an outbound email from the given Front channel. Returns the Front message id when provided. */
export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string | null }> {
  if (!input.to.length) throw new Error("No recipients");
  const body = await frontFetch<{ id?: string; message_uid?: string }>(`/channels/${enc(input.channelId)}/messages`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      to: input.to,
      subject: input.subject,
      body: input.html,
      text: input.text,
      sender_name: input.senderName,
      options: { archive: true },
    }),
  });
  return { messageId: body.id ?? body.message_uid ?? null };
}

/** Notice sending (hold / un-hold notices): same as sendEmail but leaves the conversation open unless archive is set. */
export async function sendMessage(input: SendEmailInput & { archive?: boolean; authorId?: string }): Promise<{ messageId: string | null }> {
  if (!input.to.length) throw new Error("No recipients");
  const body = await frontFetch<{ id?: string; message_uid?: string }>(`/channels/${enc(input.channelId)}/messages`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      to: input.to,
      subject: input.subject,
      body: input.html,
      text: input.text,
      sender_name: input.senderName,
      author_id: input.authorId,
      options: { archive: input.archive ?? false },
    }),
  });
  return { messageId: body.id ?? body.message_uid ?? null };
}

export interface CreateDraftInput {
  channelId: string;
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  authorId?: string;
  /** shared = visible to every teammate with access (default, so the reviewer can see it) */
  mode?: "private" | "shared";
}

/** Draft for review (hold notices "Draft for review"). Returns the draft (message) id and its conversation when given. */
export async function createDraft(input: CreateDraftInput): Promise<{ draftId: string | null; conversationId: string | null }> {
  if (!input.body.trim()) throw new Error("Draft body is empty");
  const r = await frontFetch<{ id?: string; _links?: { related?: { conversation?: string } } }>(`/channels/${enc(input.channelId)}/drafts`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      author_id: input.authorId,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      body: input.body,
      mode: input.mode ?? "shared",
    }),
  });
  const convLink = r._links?.related?.conversation ?? null;
  return { draftId: r.id ?? null, conversationId: convLink ? (convLink.split("/").pop() ?? null) : null };
}

// ---------- Inboxes, tags, statuses, teammates ----------

export interface FrontInbox {
  id: string;
  name: string;
  isPrivate: boolean;
}

export async function listInboxes(): Promise<FrontInbox[]> {
  const raw = await paginate<{ id: string; name: string; is_private?: boolean }>("/inboxes");
  return raw.map((i) => ({ id: i.id, name: i.name, isPrivate: !!i.is_private }));
}

export interface FrontTag {
  id: string;
  name: string;
  description: string | null;
  highlight: string | null;
  /** true when Front reports child tags for this tag */
  hasChildren: boolean;
}

interface RawTag {
  id: string;
  name: string;
  description?: string | null;
  highlight?: string | null;
  _links?: { related?: { children?: string | null; parent_tag?: string | null } };
}

const mapTag = (t: RawTag): FrontTag => ({
  id: t.id,
  name: t.name,
  description: t.description ?? null,
  highlight: t.highlight ?? null,
  hasChildren: !!t._links?.related?.children,
});

export async function listAllTags(): Promise<FrontTag[]> {
  return (await paginate<RawTag>("/tags?limit=100")).map(mapTag);
}

export async function listTagChildren(tagId: string): Promise<FrontTag[]> {
  return (await paginate<RawTag>(`/tags/${enc(tagId)}/children?limit=100`)).map(mapTag);
}

export interface FrontStatus {
  id: string;
  name: string;
  category: "open" | "waiting" | "resolved";
  description: string | null;
}

export async function listStatuses(): Promise<FrontStatus[]> {
  const raw = await paginate<{ id: string; name: string; category: string; description?: string | null }>("/company/statuses");
  return raw
    .filter((s) => s.category === "open" || s.category === "waiting" || s.category === "resolved")
    .map((s) => ({ id: s.id, name: s.name, category: s.category as FrontStatus["category"], description: s.description ?? null }));
}

export interface FrontTeammate {
  id: string;
  email: string | null;
  name: string;
}

export async function listTeammates(): Promise<FrontTeammate[]> {
  const raw = await paginate<RawTeammate>("/teammates");
  return raw.map(mapTeammate);
}

interface RawTeammate {
  id: string;
  email?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

const mapTeammate = (t: RawTeammate): FrontTeammate => ({
  id: t.id,
  email: t.email ?? null,
  name: [t.first_name, t.last_name].filter(Boolean).join(" ") || t.username || t.email || t.id,
});

// ---------- Reading conversations (needs conversations read + messages read + events read) ----------

export interface FrontConversation {
  id: string;
  subject: string | null;
  status: string | null;
  ticketIds: string[];
}

export interface FrontMessage {
  id: string;
  isInbound: boolean;
  createdAt: Date;
  blurb: string;
  from: string | null;
}

interface RawConversation {
  id: string;
  subject?: string | null;
  status?: string | null;
  status_id?: string | null;
  status_category?: string | null;
  ticket_ids?: string[];
  assignee?: RawTeammate | null;
  recipient?: { name?: string | null; handle?: string | null; role?: string } | null;
  tags?: RawTag[];
  created_at?: number;
  updated_at?: number;
  waiting_since?: number;
  is_private?: boolean;
  _links?: { related?: { inboxes?: string } };
}

interface RawRecipient {
  handle?: string;
  name?: string | null;
  role?: string;
}

interface RawAttachment {
  id?: string;
  filename?: string;
  url?: string;
  content_type?: string;
  size?: number;
}

interface RawMessage {
  id: string;
  type?: string;
  is_inbound?: boolean;
  is_draft?: boolean;
  created_at?: number;
  blurb?: string;
  body?: string;
  text?: string | null;
  subject?: string | null;
  author?: RawTeammate | null;
  recipients?: RawRecipient[];
  attachments?: RawAttachment[];
}

/** Full-text conversation search — newest activity first. */
export async function searchConversations(query: string, limit = 10): Promise<FrontConversation[]> {
  const body = await frontFetch<{ _results?: RawConversation[] }>(`/conversations/search/${enc(query)}?limit=${limit}`, { headers: headers() });
  return (body._results ?? []).map((c) => ({
    id: c.id,
    subject: c.subject ?? null,
    status: c.status ?? null,
    ticketIds: c.ticket_ids ?? [],
  }));
}

function messageFrom(m: RawMessage): string | null {
  const fromRecipient = m.recipients?.find((r) => r.role === "from");
  const author = m.author ? mapTeammate(m.author).name : null;
  return m.is_inbound ? fromRecipient?.name || fromRecipient?.handle || null : author || fromRecipient?.handle || null;
}

/** The newest message in a conversation. */
export async function latestMessage(conversationId: string): Promise<FrontMessage | null> {
  const body = await frontFetch<{ _results?: RawMessage[] }>(
    `/conversations/${enc(conversationId)}/messages?limit=1&sort_by=created_at&sort_order=desc`,
    { headers: headers() },
  );
  const m = body._results?.[0];
  if (!m) return null;
  return {
    id: m.id,
    isInbound: !!m.is_inbound,
    createdAt: new Date((m.created_at ?? 0) * 1000),
    blurb: (m.blurb ?? "").replace(/\s+/g, " ").trim(),
    from: messageFrom(m),
  };
}

/** A conversation as the app stores it. */
export interface FrontConversationDetail {
  id: string;
  subject: string | null;
  frontStatus: string | null;
  statusId: string | null;
  statusCategory: "open" | "waiting" | "resolved" | null;
  ticketIds: string[];
  assignee: FrontTeammate | null;
  tags: Array<{ id: string; name: string }>;
  recipient: { name: string | null; handle: string | null } | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  waitingSince: Date | null;
  isPrivate: boolean;
}

export function mapConversation(c: RawConversation): FrontConversationDetail {
  const cat = c.status_category;
  return {
    id: c.id,
    subject: c.subject ?? null,
    frontStatus: c.status ?? null,
    statusId: c.status_id ?? null,
    statusCategory: cat === "open" || cat === "waiting" || cat === "resolved" ? cat : c.status === "archived" ? "resolved" : c.status ? "open" : null,
    ticketIds: c.ticket_ids ?? [],
    assignee: c.assignee ? mapTeammate(c.assignee) : null,
    tags: (c.tags ?? []).map((t) => ({ id: t.id, name: t.name })),
    recipient: c.recipient ? { name: c.recipient.name ?? null, handle: c.recipient.handle ?? null } : null,
    createdAt: secs(c.created_at),
    updatedAt: secs(c.updated_at),
    waitingSince: secs(c.waiting_since),
    isPrivate: !!c.is_private,
  };
}

export async function getConversation(conversationId: string): Promise<FrontConversationDetail> {
  return mapConversation(await frontFetch<RawConversation>(`/conversations/${enc(conversationId)}`, { headers: headers() }));
}

/**
 * Conversations of one shared inbox in the given ticket status categories (newest activity first, as Front returns them).
 * `updatedAfter`: stop paging once conversations are older (Front sorts inbox lists by last activity).
 * TODO(verify): bracket syntax `q[status_categories][]=` — Front docs describe `q` as an object with `status_categories`.
 */
export async function listInboxConversations(
  inboxId: string,
  opts: { statusCategories: Array<"open" | "waiting" | "resolved">; updatedAfter?: Date; maxItems?: number },
): Promise<FrontConversationDetail[]> {
  const q = opts.statusCategories.map((s) => `q[status_categories][]=${enc(s)}`).join("&");
  const after = opts.updatedAfter?.getTime();
  const time = (c: RawConversation) => (c.updated_at ?? c.created_at ?? 0) * 1000;
  // Front sorts by last activity, which can differ slightly from updated_at — stop only after 10 older ones in a row.
  let olderInARow = 0;
  const raw = await paginate<RawConversation>(`/inboxes/${enc(inboxId)}/conversations?limit=100&${q}`, {
    maxItems: opts.maxItems ?? 2000,
    stop: after
      ? (c) => {
          const t = time(c);
          olderInARow = t > 0 && t < after ? olderInARow + 1 : 0;
          return olderInARow >= 10;
        }
      : undefined,
  });
  return raw.filter((c) => !after || time(c) === 0 || time(c) >= after).map(mapConversation);
}

export interface FrontAttachment {
  id: string | null;
  filename: string;
  url: string;
  contentType: string;
  size: number;
}

export interface FrontMessageDetail extends FrontMessage {
  isDraft: boolean;
  subject: string | null;
  text: string;
  fromHandle: string | null;
  attachments: FrontAttachment[];
}

/** Light HTML → text (Front's `text` is preferred when present). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function mapMessage(m: RawMessage): FrontMessageDetail {
  const fromRecipient = m.recipients?.find((r) => r.role === "from");
  return {
    id: m.id,
    isInbound: !!m.is_inbound,
    isDraft: !!m.is_draft,
    createdAt: new Date((m.created_at ?? 0) * 1000),
    blurb: (m.blurb ?? "").replace(/\s+/g, " ").trim(),
    from: messageFrom(m),
    fromHandle: fromRecipient?.handle ?? m.author?.email ?? null,
    subject: m.subject ?? null,
    text: (m.text ?? (m.body ? htmlToText(m.body) : "") ?? "").trim(),
    attachments: (m.attachments ?? [])
      .filter((a) => a.url)
      .map((a) => ({ id: a.id ?? null, filename: a.filename ?? "attachment", url: a.url!, contentType: a.content_type ?? "application/octet-stream", size: a.size ?? 0 })),
  };
}

/** Messages, oldest first (drafts excluded). */
export async function listMessages(conversationId: string, maxItems = 200): Promise<FrontMessageDetail[]> {
  const raw = await paginate<RawMessage>(`/conversations/${enc(conversationId)}/messages?limit=100`, { maxItems });
  return raw.map(mapMessage).filter((m) => !m.isDraft).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export interface FrontComment {
  id: string;
  author: string | null;
  body: string;
  postedAt: Date;
}

export async function listComments(conversationId: string): Promise<FrontComment[]> {
  const raw = await paginate<{ id: string; author?: RawTeammate | null; body?: string; posted_at?: number }>(
    `/conversations/${enc(conversationId)}/comments?limit=100`,
  );
  return raw
    .map((c) => ({ id: c.id, author: c.author ? mapTeammate(c.author).name : null, body: c.body ?? "", postedAt: new Date((c.posted_at ?? 0) * 1000) }))
    .sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());
}

/** Raw Front event, kept loose: Front documents `type`, `emitted_at`, `source{_meta.type, data}`, `target{_meta.type, data}`. */
export interface RawEvent {
  id: string;
  type: string;
  emitted_at?: number;
  source?: { _meta?: { type?: string }; data?: unknown } | null;
  target?: { _meta?: { type?: string }; data?: unknown } | null;
}

/** Activity, oldest first. */
export async function listEvents(conversationId: string, maxItems = 300): Promise<RawEvent[]> {
  const raw = await paginate<RawEvent>(`/conversations/${enc(conversationId)}/events?limit=100`, { maxItems });
  return raw.sort((a, b) => (a.emitted_at ?? 0) - (b.emitted_at ?? 0));
}

/**
 * Front API URLs only (the token must never be sent elsewhere). Attachment links can use the company's own API host
 * (https://<company>.api.frontapp.com/…) as well as api2.frontapp.com.
 */
export function isFrontApiUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "api2.frontapp.com" || /^[a-z0-9-]+\.api\.frontapp\.com$/i.test(u.hostname) || u.hostname === "api.frontapp.com");
  } catch {
    return false;
  }
}

/** Download an attachment (PDF bills). Front attachment URLs need the same Bearer token. */
export async function downloadAttachment(url: string, maxBytes = 15_000_000): Promise<{ bytes: Buffer; contentType: string }> {
  if (!isFrontApiUrl(url)) throw new Error("Refusing to download an attachment from outside the Front API");
  const res = await fetch(url, { headers: headers({ Accept: "*/*" }), cache: "no-store" });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    if (res.status === 403) throw new FrontPermissionError(permissionFor("GET", "/download"), 403, body);
    throw new FrontApiError(`Front attachment download failed (${res.status})`, res.status, body);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`Attachment too large (${buf.length} bytes)`);
  return { bytes: buf, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}

/**
 * How many conversations match a search (Front returns `_total` with the first page). Read-only.
 * Analytics uses it for tickets per client per month: `from:@domain after:<unix> before:<unix>`.
 */
/** Tickets for scoring (batch 3): tags, created and — when archived/resolved — closed time (Front's last update). */
export interface ScoredConversation {
  id: string;
  tags: string[];
  createdAt: Date;
  closedAt: Date | null;
}

export async function listConversationsForScore(query: string, maxItems = 2000): Promise<ScoredConversation[]> {
  const rows = await paginate<RawConversation>(`/conversations/search/${enc(query)}?limit=100`, { maxItems });
  return rows
    .filter((c) => typeof c.created_at === "number")
    .map((c) => {
      const closed = c.status === "archived" || c.status === "deleted" || c.status_category === "resolved";
      return { id: c.id, tags: (c.tags ?? []).map((t) => t.name ?? "").filter(Boolean), createdAt: secs(c.created_at)!, closedAt: closed ? secs(c.updated_at) : null };
    });
}

export async function countConversations(query: string): Promise<number> {
  const body = await frontFetch<{ _total?: number; _results?: unknown[] }>(`/conversations/search/${enc(query)}?limit=1`, { headers: headers() });
  return typeof body._total === "number" ? body._total : (body._results?.length ?? 0);
}

export interface Attachment {
  name: string;
  type: string;
  bytes: Buffer;
}

/**
 * Report email with a PDF attached (multipart/form-data): sent, or saved as a shared draft for review.
 * The only Front writes this app makes are report emails and their drafts (brief §3 rule 4).
 */
export async function sendWithAttachment(input: SendEmailInput & { attachment: Attachment; draft?: boolean }): Promise<{ id: string | null }> {
  if (!input.to.length) throw new Error("No recipients");
  const fd = new FormData();
  for (const t of input.to) fd.append("to[]", t);
  fd.append("subject", input.subject);
  fd.append("body", input.html);
  if (input.text) fd.append("text", input.text);
  if (input.senderName && !input.draft) fd.append("sender_name", input.senderName);
  if (input.draft) fd.append("mode", "shared");
  else fd.append("options[archive]", "true");
  fd.append("attachments[]", new Blob([new Uint8Array(input.attachment.bytes)], { type: input.attachment.type }), input.attachment.name);
  const path = `/channels/${enc(input.channelId)}/${input.draft ? "drafts" : "messages"}`;
  const body = await frontFetch<{ id?: string; message_uid?: string }>(path, { method: "POST", headers: headers(), body: fd });
  return { id: body.id ?? body.message_uid ?? null };
}
