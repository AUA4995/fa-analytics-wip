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
  withoutSecrets, isSecretField,
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
  it("part-day windows use date and time; whole days just the date; OrderBy can list several key fields", () => {
    expect(windowWhere("Created", new Date("2026-06-01T00:00:00Z"), new Date("2026-06-02T00:00:00Z"))).toEqual(["Created ge '2026-06-01'", "Created lt '2026-06-02'"]);
    expect(windowWhere("Created", new Date("2026-06-01T05:00:00Z"), new Date("2026-06-01T06:00:00Z"))).toEqual(["Created ge '2026-06-01 05:00:00'", "Created lt '2026-06-01 06:00:00'"]);
    expect(new URL(buildQueryUrl("e", { table: "PCK1", orderBy: "PCKID,LineNo" })).searchParams.get("OrderBy")).toBe("PCKID,LineNo");
    expect(() => buildQueryUrl("e", { table: "PCK1", orderBy: "PCKID;drop" })).toThrow();
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
    // zoned and /Date()/ values are converted to Sydney wall-clock (the scale zone-less values are on)
    expect(parseThomaxDate("2026-06-01T10:00:00+10:00")?.toISOString()).toBe("2026-06-01T10:00:00.000Z"); // AEST
    expect(parseThomaxDate("2026-11-10T04:00:00Z")?.toISOString()).toBe("2026-11-10T15:00:00.000Z"); // AEDT +11
    expect(parseThomaxDate("2026-11-10T15:00:00+11")?.toISOString()).toBe("2026-11-10T15:00:00.000Z");
    expect(parseThomaxDate(`/Date(${Date.UTC(2026, 10, 10, 4)})/`)?.toISOString()).toBe("2026-11-10T15:00:00.000Z"); // 04:00Z
    expect(parseThomaxDate("ABC123")).toBeNull();
    expect(parseThomaxDate(12345)).toBeNull();
  });
  it("refuses impossible dates and placeholder years", () => {
    expect(parseThomaxDate("2026-02-31")).toBeNull();
    expect(parseThomaxDate("2026-13-01")).toBeNull();
    expect(parseThomaxDate("2026-06-01 25:00")).toBeNull();
    expect(parseThomaxDate("0001-01-01T00:00:00")).toBeNull();
    expect(parseThomaxDate("/Date(-62135596800000)/")).toBeNull();
  });
  it("hashes rows regardless of key order; keys never merge rows with a missing value", () => {
    expect(rowHash({ a: 1, b: { c: 2, d: 3 } })).toBe(rowHash({ b: { d: 3, c: 2 }, a: 1 }));
    expect(rowHash({ a: 1 })).not.toBe(rowHash({ a: 2 }));
    expect(rowKey({ JobID: 7 }, ["JobID"])).toBe("7");
    expect(rowKey({ JobID: 7, LineNo: 2 }, ["JobID", "LineNo"])).toBe('["7","2"]');
    // "x|y"+"z" vs "x"+"y|z" stay different
    expect(rowKey({ a: "x|y", b: "z" }, ["a", "b"])).not.toBe(rowKey({ a: "x", b: "y|z" }, ["a", "b"]));
    expect(rowKey({ JobID: null }, ["JobID"])).toBeNull();
    expect(rowKey({ JobID: "  " }, ["JobID"])).toBeNull();
    expect(rowKey({ a: 1 }, [])).toBeNull();
  });
  it("secret-looking fields are dropped (USR may hold password hashes)", () => {
    expect(withoutSecrets({ UserID: 1, Name: "Jo", PasswordHash: "x", PIN: "1234", ApiToken: "t", Pinned: true })).toEqual({ UserID: 1, Name: "Jo", Pinned: true });
    expect(fieldsOf([{ UserID: 1, Password: "x" }])).toEqual(["UserID"]);
    // Names that only contain those letters are kept (the copy is the archive after Thomax ends)
    for (const f of ["PwdHash", "PassHash", "WebPass", "Pass", "PASS", "Tokens", "TotpSeed", "MfaSeed", "SecurityAnswer", "SecretQuestion", "OtpCode", "webpass", "ftppass", "USERPASS", "pass_word", "PassKey", "PwHash", "UserPW", "RecoveryCodes", "BackupCodes", "TwoFactorKey", "SessionKey", "SessionId", "Cookie", "SecQuestion"])
      expect(isSecretField(f), f).toBe(true);
    for (const f of ["Compass", "QCPassed", "ContactPassport", "Bypassed", "Footprint", "Hotpack", "SeedQty", "AnswerBy", "Notes", "Passenger", "OTP", "OTPDate", "OtpPct", "compass", "BYPASS", "Powder", "Pwr"])
      expect(isSecretField(f), f).toBe(false);
    expect(withoutSecrets({ ContactPassport: "P1", QCPassed: true, Compass: 1, ShippingPin: 2, TokenExpiry: "t", UserPwd: "x", Salt: "s", Basalt: "b" })).toEqual({ ContactPassport: "P1", QCPassed: true, Compass: 1, ShippingPin: 2, TokenExpiry: "t", Basalt: "b" });
    // Credentials under other names
    expect(withoutSecrets({ ApiKey: 1, SecretKey: 2, AccessKey: 3, PrivateKey: 4, AuthKey: 5, LicenceKey: 6, Credentials: 7, UserPIN: 8, LoginPin: 9, SecretAnswer: 10, Passphrase: 11, ItemKey: 12, OrderKey: 13 })).toEqual({ ItemKey: 12, OrderKey: 13 });
    // …and anything the owner chose not to copy
    expect(withoutSecrets({ A: 1, B: 2 }, ["B"])).toEqual({ A: 1 });
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
  it("401 → a plain message about the login; an error Status is an error even with an empty Data list", async () => {
    await expect(queryPage(creds, { table: "TNT" }, { fetchImpl: async () => new Response("no", { status: 401 }) })).rejects.toThrow(/refused the login/);
    expect(() => dataOf({ Status: "Invalid table" }, "XX")).toThrow(/Invalid table/);
    expect(() => dataOf({ Status: "Error: Invalid field Created", Data: [] }, "PCK")).toThrow(/Invalid field/);
    expect(dataOf({ Status: "OK", Data: [] }, "PCK")).toEqual([]);
    expect(() => dataOf({ Status: "Query timed out", Data: [] }, "PCK")).toThrow(/timed out/);
    expect(() => dataOf({ Status: "Busy, try later", Data: [] }, "PCK")).toThrow(/no rows, status/);
    expect(dataOf({ Status: "Busy", Data: [{ A: 1 }] }, "PCK")).toEqual([{ A: 1 }]);
    await expect(queryPage(creds, { table: "USR" }, { fetchImpl: async () => new Response("no", { status: 403 }) })).rejects.toThrow(/isn't allowed to read USR/);
  });
  it("never follows redirects and doesn't retry a host that doesn't exist", async () => {
    let seen: RequestInit | undefined;
    await queryPage(creds, { table: "TNT" }, { fetchImpl: async (_u, i) => ((seen = i), ok({ Data: [] })) });
    expect(seen?.redirect).toBe("error");
    let calls = 0;
    const dns = Object.assign(new TypeError("fetch failed"), { cause: new Error("getaddrinfo ENOTFOUND x.dotwms.com") });
    await expect(queryPage(creds, { table: "TNT" }, { sleep: async () => {}, fetchImpl: async () => (calls++, Promise.reject(dns)) })).rejects.toThrow(/didn't answer/);
    expect(calls).toBe(1);
  });
  it("stops paging when Thomax sends the same page twice", async () => {
    await expect(queryAll(creds, { table: "PCK" }, async () => {}, { pageSize: 2, fetchImpl: async () => ok({ Data: [{ a: 1 }, { a: 2 }] }) })).rejects.toThrow(/same page came back twice/);
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
