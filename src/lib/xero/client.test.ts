import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  getAccessToken: vi.fn(async () => ({ accessToken: "tok", tenantId: "tenant-1", tenantName: "Test Org" })),
}));

import { xeroDateTime, xeroDateToISO, xeroGet, xeroPages, XeroApiError } from "./client";

describe("Xero date parsing", () => {
  it("parses .NET /Date()/ values to calendar dates", () => {
    expect(xeroDateToISO("/Date(1518652800000+0000)/")).toBe("2018-02-15");
    expect(xeroDateToISO("/Date(1776902400000)/")).toBe("2026-04-23");
  });
  it("parses ISO DateString values", () => {
    expect(xeroDateToISO("2026-10-20T00:00:00")).toBe("2026-10-20");
  });
  it("returns null for missing values", () => {
    expect(xeroDateToISO(undefined)).toBeNull();
    expect(xeroDateToISO("")).toBeNull();
    expect(xeroDateToISO("garbage")).toBeNull();
  });
  it("parses timestamps", () => {
    expect(xeroDateTime("/Date(1518685950940+0000)/")?.toISOString()).toBe("2018-02-15T09:12:30.940Z");
    expect(xeroDateTime("2026-10-16T06:00:00Z")?.toISOString()).toBe("2026-10-16T06:00:00.000Z");
    expect(xeroDateTime(null)).toBeNull();
  });
});

describe("xeroGet / xeroPages", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  it("sends auth, tenant and If-Modified-Since headers", async () => {
    fetchMock.mockResolvedValueOnce(json({ Contacts: [] }));
    await xeroGet("Contacts", { modifiedSince: new Date("2026-10-15T20:00:00Z"), params: { page: 1 } });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.xero.com/api.xro/2.0/Contacts?page=1");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer tok");
    expect(h["Xero-tenant-id"]).toBe("tenant-1");
    expect(h["If-Modified-Since"]).toBe("2026-10-15T20:00:00.000Z");
  });

  it("retries once on 429 using Retry-After", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(json({ Invoices: [{ InvoiceID: "a" }] }));
    const body = await xeroGet<{ Invoices: unknown[] }>("Invoices");
    expect(body.Invoices).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a typed error with the response body on failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Forbidden: scope", { status: 403 }));
    await expect(xeroGet("Invoices")).rejects.toMatchObject({ status: 403, body: "Forbidden: scope" } satisfies Partial<XeroApiError>);
  });

  it("pages using Xero's pagination block", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ Invoices: [1, 2], pagination: { page: 1, pageSize: 2, pageCount: 2, itemCount: 3 } }))
      .mockResolvedValueOnce(json({ Invoices: [3], pagination: { page: 2, pageSize: 2, pageCount: 2, itemCount: 3 } }));
    const pages: number[][] = [];
    for await (const p of xeroPages<number>("Invoices", "Invoices", { pageSize: 2 })) pages.push(p);
    expect(pages).toEqual([[1, 2], [3]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pages until an empty page when no pagination block is returned", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ Contacts: [1, 2] }))
      .mockResolvedValueOnce(json({ Contacts: [3, 4] }))
      .mockResolvedValueOnce(json({ Contacts: [] }));
    const pages: number[][] = [];
    for await (const p of xeroPages<number>("Contacts", "Contacts", { pageSize: 2 })) pages.push(p);
    expect(pages).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
