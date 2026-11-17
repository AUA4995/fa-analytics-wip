/** Thomax copy against the test database, with a fake Thomax: connect → explore → confirm → history → nightly → lookup. */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isTestDatabase } from "@/lib/test-db";

const hasDb = isTestDatabase();

type Row = Record<string, unknown>;

describe.skipIf(!hasDb)("Thomax copy (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let s: typeof import("./sync");
  let l: typeof import("./lookup");
  // Fake Thomax: PCK rows by JobCreateTime, TNT master list.
  let pck: Row[] = [];
  let tnt: Row[] = [];
  const calls: string[] = [];
  const fetchImpl = async (u: string) => {
    const p = new URL(u).searchParams;
    calls.push(`${p.get("Table")} ${p.get("Where") ?? ""} skip=${p.get("Skip") ?? 0}`);
    const table = p.get("Table");
    let rows = table === "PCK" ? pck : table === "TNT" ? tnt : [];
    const where = p.get("Where");
    if (where) {
      const m = /ge '([\d-]+)' AND \w+ lt '([\d-]+)'/.exec(where);
      const before = /^\w+ lt '([\d-]+)'$/.exec(where);
      if (m) rows = rows.filter((r) => String(r.JobCreateTime) >= m[1] && String(r.JobCreateTime) < m[2]);
      else if (before) rows = rows.filter((r) => r.JobCreateTime && String(r.JobCreateTime) < before[1]);
      else if (/ is null$/.test(where)) rows = rows.filter((r) => r.JobCreateTime === null || r.JobCreateTime === undefined);
    }
    const skip = Number(p.get("Skip") ?? 0);
    const limit = Number(p.get("Limit"));
    return new Response(JSON.stringify({ Status: "OK", Data: rows.slice(skip, skip + limit) }), { status: 200 });
  };
  const opts = { fetchImpl, sleep: async () => {} };

  beforeAll(async () => {
    process.env.TOKEN_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    s = await import("./sync");
    l = await import("./lookup");
    await prisma.thomaxTable.deleteMany({});
    await prisma.thomaxConnection.deleteMany({});
    await prisma.sourceRun.deleteMany({ where: { source: "THOMAX" } });
  });
  afterAll(async () => {
    await prisma.thomaxTable.deleteMany({});
    await prisma.thomaxConnection.deleteMany({});
    await prisma.sourceRun.deleteMany({ where: { source: "THOMAX" } });
    await prisma.$disconnect();
  });

  it("stores the password encrypted and refuses to copy before the owner confirms keys", async () => {
    await s.saveConnection({ cluster: "e", username: "analytics", password: "s3cret!", historyFrom: "2026-08-01" }, "Test");
    const c = await prisma.thomaxConnection.findUniqueOrThrow({ where: { id: "thomax" } });
    expect(c.passwordEnc).not.toContain("s3cret");
    expect((await s.getCreds())?.password).toBe("s3cret!");
    expect(await prisma.thomaxTable.count()).toBeGreaterThan(30);
    // Not confirmed → nothing to copy
    const r = await s.historyStep(10, new Date("2026-11-16T12:00:00Z"), opts);
    expect(r.windows).toBe(0);
  });

  it("explore suggests settings; saving rejects unknown fields and a missing key", async () => {
    pck = [
      { PCKID: 1, OrderNo: "SO-1", ConsignmentNo: "CN1", JobCreateTime: "2026-08-05T09:00:00", PackedTime: "2026-08-05T13:00:00", Status: "Packed" },
      { PCKID: 2, OrderNo: "SO-2", ConsignmentNo: "CN2", JobCreateTime: "2026-09-10T09:00:00", PackedTime: null, Status: "Open" },
      { PCKID: 3, OrderNo: "SO-3", ConsignmentNo: "CN3", JobCreateTime: "2026-11-15T09:00:00", PackedTime: null, Status: "Open" },
    ];
    tnt = [{ TenantID: 11, Name: "Client A" }];
    await s.exploreTable("PCK", opts);
    const t = await prisma.thomaxTable.findUniqueOrThrow({ where: { name: "PCK" } });
    expect(t.dateField).toBe("JobCreateTime");
    expect(t.keyFields).toEqual(["PCKID"]);
    expect(t.lookupFields).toEqual(["OrderNo", "ConsignmentNo"]);
    await expect(s.saveTableSettings("PCK", { enabled: true, kind: "TRANSACTIONAL", dateField: "Nope", keyFields: ["PCKID"], lookupFields: [] }, "Test")).rejects.toThrow(/isn't one of/);
    await expect(s.saveTableSettings("PCK", { enabled: true, kind: "TRANSACTIONAL", dateField: "JobCreateTime", keyFields: [], lookupFields: [] }, "Test")).rejects.toThrow(/identify one row/);
    await s.saveTableSettings("PCK", { enabled: true, kind: "TRANSACTIONAL", dateField: "JobCreateTime", keyFields: ["PCKID"], lookupFields: ["OrderNo", "ConsignmentNo"] }, "Test");
    await s.exploreTable("TNT", opts);
    await s.saveTableSettings("TNT", { enabled: true, kind: "MASTER", dateField: null, keyFields: ["TenantID"], lookupFields: [] }, "Test");
    // Re-explore keeps confirmed settings
    await s.exploreTable("PCK", opts);
    expect((await prisma.thomaxTable.findUniqueOrThrow({ where: { name: "PCK" } })).lookupFields).toEqual(["OrderNo", "ConsignmentNo"]);
  });

  it("history: month by month from historyFrom, resumable; a re-read doesn't duplicate", async () => {
    const now = new Date("2026-11-16T12:00:00Z");
    const a = await s.historyStep(2, now, opts);
    expect(a.windows).toBe(1); // only PCK is transactional + confirmed; one window per table per step
    expect((await prisma.thomaxTable.findUniqueOrThrow({ where: { name: "PCK" } })).historyDoneTo?.toISOString().slice(0, 10)).toBe("2026-09-01");
    for (let i = 0; i < 5; i++) await s.historyStep(2, now, opts);
    const t = await prisma.thomaxTable.findUniqueOrThrow({ where: { name: "PCK" } });
    expect(t.historyDoneTo?.toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(t.rowCount).toBe(3);
    expect(await s.historyRemaining(now)).toBe(0);
    // Same data again: no new rows
    await s.copyWindow((await s.getCreds())!, { name: "PCK", keyFields: ["PCKID"], lookupFields: ["OrderNo", "ConsignmentNo"], dateField: "JobCreateTime" }, new Date("2026-08-01"), new Date("2026-12-01"), opts);
    expect(await prisma.thomaxRow.count({ where: { table: "PCK" } })).toBe(3);
  });

  it("nightly: masters in full, recent days re-read and status changes picked up", async () => {
    pck[2] = { ...pck[2], Status: "Packed", PackedTime: "2026-11-16T10:00:00" };
    tnt.push({ TenantID: 12, Name: "Client B" });
    const r = await s.nightly(new Date("2026-11-16T12:00:00Z"), opts);
    expect(r.errors).toEqual([]);
    const row = await prisma.thomaxRow.findFirstOrThrow({ where: { table: "PCK", key: "3" } });
    expect((row.data as Row).Status).toBe("Packed");
    expect(await prisma.thomaxRow.count({ where: { table: "TNT" } })).toBe(2);
    expect(await prisma.thomaxRow.count({ where: { table: "PCK" } })).toBe(3);
  });

  it("lookup: exact match on searchable fields, timeline from every date, linked numbers", async () => {
    const res = await l.lookup(" so-1 ");
    expect(res?.rows.map((r) => r.data.PCKID)).toEqual([1]);
    expect(res?.timeline.map((e) => e.field)).toEqual(["JobCreateTime", "PackedTime"]);
    expect(res?.related).toEqual([{ table: "PCK", field: "ConsignmentNo", value: "CN1" }]);
    expect((await l.lookup("cn3"))?.rows).toHaveLength(1);
    expect((await l.lookup("SO"))?.rows).toHaveLength(0);
    expect(await l.lookup("x")).toBeNull();
  });

  it("changing the key needs a tick, then clears the table so it's copied again with the new key", async () => {
    await expect(s.saveTableSettings("PCK", { enabled: true, kind: "TRANSACTIONAL", dateField: "JobCreateTime", keyFields: ["OrderNo"], lookupFields: ["OrderNo"] }, "Test")).rejects.toThrow(/tick "I understand"/);
    expect(await prisma.thomaxRow.count({ where: { table: "PCK" } })).toBe(3);
    await s.saveTableSettings("PCK", { enabled: true, kind: "TRANSACTIONAL", dateField: "JobCreateTime", keyFields: ["OrderNo"], lookupFields: ["OrderNo"], confirmKeyChange: true }, "Test");
    const t = await prisma.thomaxTable.findUniqueOrThrow({ where: { name: "PCK" } });
    expect(t.rowCount).toBe(0);
    expect(t.historyDoneTo).toBeNull();
    expect(await prisma.thomaxRow.count({ where: { table: "PCK" } })).toBe(0);
  });

  it("rows without a key value are skipped and counted, never merged; masters need a key too", async () => {
    await expect(s.saveTableSettings("TNT", { enabled: true, kind: "MASTER", dateField: null, keyFields: [], lookupFields: [] }, "Test")).rejects.toThrow(/identify one row/);
    const r = await s.storeRows({ name: "PCK", keyFields: ["OrderNo"], lookupFields: [], dateField: "JobCreateTime" }, [{ OrderNo: "SO-9" }, { OrderNo: null }, { OrderNo: "" }, { Other: 1 }]);
    expect(r).toMatchObject({ inserted: 1, noKey: 3 });
  });

  it("paging is ordered by the key and a refused login stops everything and pauses copying", async () => {
    calls.length = 0;
    await s.nightly(new Date("2026-11-16T12:00:00Z"), opts);
    expect(calls.some((c) => c.startsWith("PCK"))).toBe(true);
    const url401 = async () => new Response("no", { status: 401 });
    const r = await s.nightly(new Date("2026-11-16T12:00:00Z"), { fetchImpl: url401, sleep: async () => {} });
    expect(r.stopped).toMatch(/refused the login/);
    expect(r.errors).toHaveLength(1); // stopped at the first table
    const c = await prisma.thomaxConnection.findUniqueOrThrow({ where: { id: "thomax" } });
    expect(c).toMatchObject({ enabled: false, lastTestOk: false });
    expect(await s.getCreds()).toBeNull();
    expect((await s.historyStep(2, new Date(), opts)).stopped).toMatch(/refused the login earlier/);
    // saving a working login again un-pauses
    await s.saveConnection({ cluster: "e", username: "analytics", password: "s3cret!" }, "Test");
    expect(await s.getCreds()).not.toBeNull();
  });

  it("unstable paging (keys repeated across pages) → the window is read again day by day, nothing missed", async () => {
    // 3 orders × 3 lines in one month; key PCKID + LineNo; every call returns tied rows in a new random order
    pck = [];
    for (let o = 1; o <= 3; o++) for (let ln = 1; ln <= 3; ln++) pck.push({ PCKID: 100 + o, LineNo: ln, OrderNo: `L-${o}`, JobCreateTime: `2026-10-0${o}T09:00:00` });
    const shuffled = async (u: string) => {
      const p = new URL(u).searchParams;
      const m = /ge '([\d-]+)' AND \w+ lt '([\d-]+)'/.exec(p.get("Where") ?? "");
      let rows = pck.filter((r) => !m || (String(r.JobCreateTime) >= m[1] && String(r.JobCreateTime) < m[2]));
      rows = [...rows].sort((a, b) => Number(a.PCKID) - Number(b.PCKID) || Math.random() - 0.5);
      const skip = Number(p.get("Skip") ?? 0);
      return new Response(JSON.stringify({ Status: "OK", Data: rows.slice(skip, skip + Number(p.get("Limit"))) }), { status: 200 });
    };
    await prisma.thomaxRow.deleteMany({ where: { table: "PCK" } });
    const t = { name: "PCK", keyFields: ["PCKID", "LineNo"], lookupFields: [], dateField: "JobCreateTime" };
    let total = 0;
    for (let i = 0; i < 5; i++) {
      await prisma.thomaxRow.deleteMany({ where: { table: "PCK" } });
      await s.copyWindow((await s.getCreds())!, t, new Date("2026-10-01"), new Date("2026-11-01"), { fetchImpl: shuffled, sleep: async () => {}, pageSize: 4 });
      total = await prisma.thomaxRow.count({ where: { table: "PCK" } });
      expect(total).toBe(9);
    }
  });

  it("a busy day: ordered by every key field, or read hour by hour, so nothing is missed", async () => {
    // 1 day, 6 orders × 3 lines, tied by PCKID; pages of 4. Thomax refuses a multi-field OrderBy → hourly windows
    pck = [];
    for (let o = 1; o <= 6; o++) for (let ln = 1; ln <= 3; ln++) pck.push({ PCKID: 200 + o, LineNo: ln, JobCreateTime: `2026-10-05T${String(8 + o).padStart(2, "0")}:00:00` });
    const f = async (u: string) => {
      const p = new URL(u).searchParams;
      if ((p.get("OrderBy") ?? "").includes(",")) return new Response("bad OrderBy", { status: 400 });
      const m = /ge '([\d -:]+)' AND \w+ lt '([\d -:]+)'/.exec(p.get("Where") ?? "")!;
      const norm = (x: string) => x.replace(" ", "T");
      let rows = pck.filter((r) => String(r.JobCreateTime) >= norm(m[1]) && String(r.JobCreateTime) < norm(m[2]));
      rows = [...rows].sort((a, b) => Number(a.PCKID) - Number(b.PCKID) || Math.random() - 0.5);
      const skip = Number(p.get("Skip") ?? 0);
      return new Response(JSON.stringify({ Status: "OK", Data: rows.slice(skip, skip + Number(p.get("Limit"))) }), { status: 200 });
    };
    const t = { name: "PCK", keyFields: ["PCKID", "LineNo"], lookupFields: [], dateField: "JobCreateTime" };
    for (let i = 0; i < 3; i++) {
      await prisma.thomaxRow.deleteMany({ where: { table: "PCK" } });
      await s.copyWindow((await s.getCreds())!, t, new Date("2026-10-05"), new Date("2026-10-06"), { fetchImpl: f, sleep: async () => {}, pageSize: 4 });
      expect(await prisma.thomaxRow.count({ where: { table: "PCK" } })).toBe(18);
    }
  });

  it("the nightly stops when Thomax can't be reached instead of trying every table", async () => {
    let calls = 0;
    const down = async () => {
      calls++;
      throw new TypeError("fetch failed");
    };
    const r = await s.nightly(new Date("2026-11-16T12:00:00Z"), { fetchImpl: down, sleep: async () => {}, maxRetries: 1 });
    expect(r.stopped).toMatch(/can't be reached/);
    expect(calls).toBeLessThanOrEqual(2);
  });

  it("a 403 on one table marks that table only; copying isn't paused", async () => {
    const f403 = async (u: string) => (new URL(u).searchParams.get("Table") === "PCK" ? new Response("no", { status: 403 }) : fetchImpl(u));
    const r = await s.nightly(new Date("2026-11-16T12:00:00Z"), { fetchImpl: f403, sleep: async () => {} });
    expect(r.stopped).toBeNull();
    expect(r.errors.some((e) => /isn't allowed to read PCK/.test(e))).toBe(true);
    expect((await prisma.thomaxConnection.findUniqueOrThrow({ where: { id: "thomax" } })).enabled).toBe(true);
  });

  it("a run that stopped without finishing doesn't block the next one", async () => {
    await prisma.sourceRun.create({ data: { source: "THOMAX", label: "history", startedAt: new Date(Date.now() - 30 * 60_000) } });
    const r = await s.nightly(new Date("2026-11-16T12:00:00Z"), opts);
    expect(r.busy).toBeFalsy();
    expect(await prisma.sourceRun.count({ where: { source: "THOMAX", status: "RUNNING" } })).toBe(0);
    await prisma.sourceRun.create({ data: { source: "THOMAX", label: "history" } }); // fresh → busy
    expect((await s.nightly(new Date(), opts)).busy).toBe(true);
    await prisma.sourceRun.deleteMany({ where: { source: "THOMAX", status: "RUNNING" } });
  });

  it("the stored password is never re-used for a different cluster or user", async () => {
    await expect(s.saveConnection({ cluster: "f", username: "analytics" }, "Test")).rejects.toThrow(/needs the password again/);
    await expect(s.saveConnection({ cluster: "e", username: "someone-else" }, "Test")).rejects.toThrow(/needs the password again/);
  });
});
