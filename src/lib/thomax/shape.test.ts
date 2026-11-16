import { describe, expect, it } from "vitest";
import {
  assertCluster,
  assertName,
  buildQueryUrl,
  dateEvents,
  fieldsOf,
  lookupValues,
  monthWindows,
  parseThomaxDate,
  rowHash,
  rowKey,
  suggestDateField,
  suggestKeyFields,
  suggestLookupFields,
  windowWhere,
} from "./shape";
import { dataOf, queryAll, queryPage, authHeader } from "./client";
import { thomaxWindowOpen } from "./window";

describe("Thomax query building", () => {
  it("builds the Query API URL with Table, Where (AND), OrderBy, Limit, Skip", () => {
    const u = new URL(buildQueryUrl("e", { table: "PCK", where: windowWhere("JobCreateTime", new Date("2026-06-01T00:00:00Z"), new Date("2026-07-01T00:00:00Z")), orderBy: "JobCreateTime", limit: 100, skip: 200 }));
    expect(u.origin).toBe("https://e.dotwms.com");
    expect(u.pathname).toBe("/api/2.0/QueryAPI/");
    expect(u.searchParams.get("Table")).toBe("PCK");
    expect(u.searchParams.get("Where")).toBe("JobCreateTime ge '2026-06-01' AND JobCreateTime lt '2026-07-01'");
    expect(u.searchParams.get("OrderBy")).toBe("JobCreateTime");
    expect(u.searchParams.get("Limit")).toBe("100");
    expect(u.searchParams.get("Skip")).toBe("200");
  });
  it("caps Limit at 25,000 and refuses odd names / clusters (no injection into the URL or Where)", () => {
    expect(new URL(buildQueryUrl("e", { table: "TNT", limit: 99_999 })).searchParams.get("Limit")).toBe("25000");
    expect(() => assertName("PCK; DROP")).toThrow();
    expect(() => assertName("Job Create")).toThrow();
    expect(() => windowWhere("x' or 1 eq 1", new Date(), new Date())).toThrow();
    expect(() => assertCluster("evil.com/x")).toThrow();
    expect(() => assertCluster("e.attacker")).toThrow();
    expect(assertCluster(" E ")).toBe("e");
  });
  it("splits history into month windows", () => {
    const w = monthWindows(new Date("2021-01-15T00:00:00Z"), new Date("2021-03-10T00:00:00Z"));
    expect(w.map((x) => [x.from.toISOString().slice(0, 10), x.to.toISOString().slice(0, 10)])).toEqual([
      ["2021-01-15", "2021-02-01"],
      ["2021-02-01", "2021-03-01"],
      ["2021-03-01", "2021-03-10"],
    ]);
    expect(monthWindows(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toEqual([]);
  });
});

describe("Thomax values", () => {
  it("parses the date formats Thomax may return", () => {
    expect(parseThomaxDate("2026-06-01T10:20:30")?.toISOString()).toBe("2026-06-01T10:20:30.000Z");
    expect(parseThomaxDate("2026-06-01 10:20")?.toISOString()).toBe("2026-06-01T10:20:00.000Z");
    expect(parseThomaxDate("2026-06-01")?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(parseThomaxDate("2026-06-01T10:00:00+10:00")?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(parseThomaxDate("/Date(1717200000000)/")?.toISOString()).toBe(new Date(1717200000000).toISOString());
    expect(parseThomaxDate("ABC123")).toBeNull();
    expect(parseThomaxDate(12345)).toBeNull();
  });
  it("hashes rows regardless of key order; keys from fields or a whole-row hash", () => {
    expect(rowHash({ a: 1, b: { c: 2, d: 3 } })).toBe(rowHash({ b: { d: 3, c: 2 }, a: 1 }));
    expect(rowHash({ a: 1 })).not.toBe(rowHash({ a: 2 }));
    expect(rowKey({ JobID: 7, LineNo: 2 }, ["JobID", "LineNo"])).toBe("7|2");
    expect(rowKey({ JobID: null }, ["JobID"])).toBe("");
    expect(rowKey({ a: 1 }, [])).toMatch(/^h:[0-9a-f]{64}$/);
  });
  it("lookup values are trimmed, upper-cased, 2–100 chars, no objects", () => {
    expect(lookupValues({ OrderNo: " so-123 ", Ref: "x", Con: { a: 1 }, Track: null }, ["OrderNo", "Ref", "Con", "Track"])).toEqual([{ field: "OrderNo", value: "SO-123" }]);
  });
  it("timeline events from every date in a row, oldest first", () => {
    const ev = dateEvents({ Packed: "2026-06-02T10:00:00", Created: "2026-06-01T09:00:00", OrderNo: "2026", Qty: 3 });
    expect(ev.map((e) => e.field)).toEqual(["Created", "Packed"]);
  });
});

describe("Explore suggestions", () => {
  const pck = [
    { PCKID: 1, OrderNo: "SO1", ConsignmentNo: "C1", JobCreateTime: "2026-06-01T09:00:00", LastUpdateTime: "2026-06-02T09:00:00", TenantID: 11 },
    { PCKID: 2, OrderNo: "SO2", ConsignmentNo: "C2", JobCreateTime: "2026-06-01T10:00:00", LastUpdateTime: "2026-06-02T10:00:00", TenantID: 11 },
  ];
  it("suggests the create-time field, the table's own ID and order/consignment fields", () => {
    const f = fieldsOf(pck);
    expect(suggestDateField(f, pck)).toBe("JobCreateTime");
    expect(suggestKeyFields("PCK", f, pck)).toEqual(["PCKID"]);
    expect(suggestLookupFields(f)).toEqual(["OrderNo", "ConsignmentNo"]);
  });
  it("line tables: parent ID + line number", () => {
    const rows = [
      { PCKID: 1, LineNo: 1, ItemCode: "A" },
      { PCKID: 1, LineNo: 2, ItemCode: "B" },
    ];
    expect(suggestKeyFields("PCK1", fieldsOf(rows), rows)).toEqual(["PCKID", "LineNo"]);
  });
  it("no unique field → no suggestion (the owner chooses)", () => {
    const rows = [{ Code: "A" }, { Code: "A" }];
    expect(suggestKeyFields("XYZ", fieldsOf(rows), rows)).toEqual([]);
  });
});

describe("Thomax client", () => {
  const creds = { cluster: "e", username: "u", password: "p:w" };
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  it("sends Basic auth and reads { Status, Data }", async () => {
    let seen: RequestInit | undefined;
    const rows = await queryPage(creds, { table: "TNT", limit: 1 }, { fetchImpl: async (_u, i) => ((seen = i), ok({ Status: "OK", Data: [{ TenantID: 1 }] })) });
    expect(rows).toEqual([{ TenantID: 1 }]);
    expect((seen?.headers as Record<string, string>).Authorization).toBe(authHeader(creds));
    expect(authHeader(creds)).toBe(`Basic ${Buffer.from("u:p:w").toString("base64")}`);
  });
  it("backs off on 429 (doubling) and then succeeds", async () => {
    const waits: number[] = [];
    let n = 0;
    const rows = await queryPage(creds, { table: "TNT" }, { sleep: async (ms) => void waits.push(ms), fetchImpl: async () => (++n < 3 ? new Response("Rate limit exceeded", { status: 429 }) : ok({ Data: [] })) });
    expect(rows).toEqual([]);
    expect(waits).toEqual([5000, 10000]);
  });
  it("401 → a plain message about the login; a Status without Data → error", async () => {
    await expect(queryPage(creds, { table: "TNT" }, { fetchImpl: async () => new Response("no", { status: 401 }) })).rejects.toThrow(/refused the login/);
    expect(() => dataOf({ Status: "Invalid table" }, "XX")).toThrow(/Invalid table/);
  });
  it("pages with Limit + Skip until a short page", async () => {
    const skips: string[] = [];
    const pages: number[] = [];
    const total = await queryAll(
      creds,
      { table: "PCK" },
      async (r) => void pages.push(r.length),
      {
        pageSize: 2,
        fetchImpl: async (u) => {
          const s = new URL(u).searchParams.get("Skip") ?? "0";
          skips.push(s);
          return ok({ Data: s === "0" ? [{ a: 1 }, { a: 2 }] : s === "2" ? [{ a: 3 }, { a: 4 }] : [{ a: 5 }] });
        },
      },
    );
    expect(total).toBe(5);
    expect(skips).toEqual(["0", "2", "4"]);
    expect(pages).toEqual([2, 2, 1]);
  });
});

describe("history load window", () => {
  it("runs 20:00–05:59 Sydney only", () => {
    expect(thomaxWindowOpen(new Date("2026-11-16T10:00:00Z"))).toBe(true); // 21:00 AEDT
    expect(thomaxWindowOpen(new Date("2026-11-16T18:59:00Z"))).toBe(true); // 05:59
    expect(thomaxWindowOpen(new Date("2026-11-16T02:00:00Z"))).toBe(false); // 13:00
  });
});
