import { getAccessToken } from "./auth";
import { XERO_API_BASE } from "./config";

/**
 * Minimal Xero Accounting API client — GET only (the app is read-only by design).
 * Handles auth, tenant header, JSON, 429 back-off and paging.
 */

export class XeroApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
  }
}

export interface GetOptions {
  /** Query string parameters */
  params?: Record<string, string | number | undefined>;
  /** Only records modified since this time (Xero If-Modified-Since) */
  modifiedSince?: Date;
}

const MAX_RETRIES = 4;

export async function xeroGet<T>(path: string, opts: GetOptions = {}): Promise<T> {
  const { accessToken, tenantId } = await getAccessToken();
  const url = new URL(`${XERO_API_BASE}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Xero-tenant-id": tenantId,
    Accept: "application/json",
  };
  if (opts.modifiedSince) headers["If-Modified-Since"] = opts.modifiedSince.toISOString();

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
      await sleep(Math.min(Math.max(retryAfter, 1), 60) * 1000);
      continue;
    }
    if (res.status === 304) return { __notModified: true } as unknown as T;
    if (!res.ok) {
      const body = await res.text();
      throw new XeroApiError(`Xero GET ${url.pathname} failed (${res.status})`, res.status, body.slice(0, 500));
    }
    return (await res.json()) as T;
  }
}

interface XeroPagination {
  page: number;
  pageSize: number;
  pageCount: number;
  itemCount: number;
}

/**
 * Iterate a paged Xero collection (Invoices, Contacts, CreditNotes, …).
 * Uses Xero's `pagination` block when present, otherwise stops at the first empty page.
 */
export async function* xeroPages<T>(
  path: string,
  itemsKey: string,
  opts: GetOptions & { pageSize?: number } = {},
): AsyncGenerator<T[], void, void> {
  const pageSize = opts.pageSize ?? 100;
  for (let page = 1; ; page++) {
    const body = await xeroGet<Record<string, unknown> & { pagination?: XeroPagination }>(path, {
      ...opts,
      params: { ...opts.params, page, pageSize },
    });
    const items = (body[itemsKey] as T[] | undefined) ?? [];
    if (items.length === 0) return;
    yield items;
    const pg = body.pagination;
    if (pg && page >= pg.pageCount) return;
    if (!pg && items.length < pageSize) return;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- Xero date helpers ----------

const DOTNET_DATE = /\/Date\((-?\d+)(?:[+-]\d{4})?\)\//;

/** Xero "/Date(1518652800000+0000)/" or ISO "2018-02-15T00:00:00" → "YYYY-MM-DD" (or null). */
export function xeroDateToISO(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = DOTNET_DATE.exec(value);
  if (m) return new Date(Number(m[1])).toISOString().slice(0, 10);
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return iso ? iso[1] : null;
}

/** Xero timestamp → Date (or null). */
export function xeroDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = DOTNET_DATE.exec(value);
  if (m) return new Date(Number(m[1]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------- Attachments (Costing phase 2: bill PDFs, processing CSVs) ----------

export interface XeroAttachment {
  AttachmentID: string;
  FileName: string;
  Url?: string;
  MimeType?: string;
  ContentLength?: number;
}

/** Files attached to an invoice / bill (needs the accounting.attachments.read scope). */
export async function listInvoiceAttachments(invoiceXeroId: string): Promise<XeroAttachment[]> {
  const body = await xeroGet<{ Attachments?: XeroAttachment[] }>(`Invoices/${encodeURIComponent(invoiceXeroId)}/Attachments`);
  return body.Attachments ?? [];
}

/** Download one attachment's bytes (capped at `maxBytes`). */
export async function downloadInvoiceAttachment(invoiceXeroId: string, a: XeroAttachment, maxBytes = 15_000_000): Promise<{ bytes: Buffer; contentType: string }> {
  if ((a.ContentLength ?? 0) > maxBytes) throw new XeroApiError(`Attachment ${a.FileName} is too big (${a.ContentLength} bytes)`, 413, "");
  const { accessToken, tenantId } = await getAccessToken();
  const url = `${XERO_API_BASE}/Invoices/${encodeURIComponent(invoiceXeroId)}/Attachments/${encodeURIComponent(a.AttachmentID)}`;
  const contentType = a.MimeType || "application/octet-stream";
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, "Xero-tenant-id": tenantId, Accept: contentType }, cache: "no-store" });
    if (res.status === 429 && attempt < MAX_RETRIES) {
      await sleep(Math.min(Math.max(Number(res.headers.get("Retry-After") ?? "5"), 1), 60) * 1000);
      continue;
    }
    if (!res.ok) throw new XeroApiError(`Xero attachment ${a.FileName} failed (${res.status})`, res.status, (await res.text()).slice(0, 300));
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new XeroApiError(`Attachment ${a.FileName} is too big`, 413, "");
    return { bytes: buf, contentType: res.headers.get("content-type")?.split(";")[0] || contentType };
  }
}
