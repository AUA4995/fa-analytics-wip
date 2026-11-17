/** Revenue protection cases: only admins add / edit / delete; amounts optional; closing needs both amounts; logged. */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isTestDatabase } from "@/lib/test-db";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "10.9.4.1" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const stamp = Date.now();

describe.skipIf(!isTestDatabase())("revenue protection cases (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let act: typeof import("./actions");
  let h: typeof import("@/lib/auth/test-helpers");
  const ids = { admin: "", user: "" };
  const made: string[] = [];
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const base = { date: "2026-11-12", kind: "COST_AVOIDED", title: "Test case", whatHappened: "Something was stopped", amountBefore: "$1,000", amountAfter: "" };

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    act = await import("./actions");
    h = await import("@/lib/auth/test-helpers");
    ids.admin = (await prisma.user.create({ data: { name: "Rev Admin", email: `rev-admin-${stamp}@fulfilmentaustralia.com.au`, role: "ADMIN", passwordHash: "x", passwordSetAt: new Date() } })).id;
    ids.user = (await prisma.user.create({ data: { name: "Rev User", email: `rev-user-${stamp}@fulfilmentaustralia.com.au`, role: "USER", passwordHash: "x", passwordSetAt: new Date() } })).id;
  });
  afterAll(async () => {
    await prisma.revenueCase.deleteMany({ where: { id: { in: made } } });
    await prisma.changeLog.deleteMany({ where: { entity: "revenuecase", entityId: { in: made } } });
    await prisma.user.deleteMany({ where: { email: { contains: String(stamp) } } });
    await prisma.$disconnect();
  });
  const as = async (id: string) => {
    jar.clear();
    await h.signInForTest(id);
  };

  it("a user can't add a case", async () => {
    await as(ids.user);
    expect((await act.saveCase(null, form(base))).message).toBe("Only an admin can do that.");
  });

  it("an admin adds a case with one amount still unknown; '$1,000' is read as 1000; it's logged", async () => {
    await as(ids.admin);
    const r = await act.saveCase(null, form(base));
    expect(r).toMatchObject({ ok: true, message: "Case added." });
    made.push(r.id!);
    const c = await prisma.revenueCase.findUniqueOrThrow({ where: { id: r.id } });
    expect(Number(c.amountBefore)).toBe(1000);
    expect(c.amountAfter).toBeNull();
    expect(c.createdBy).toBe("Rev Admin");
    expect(await prisma.changeLog.count({ where: { entity: "revenuecase", entityId: r.id } })).toBe(1);
  });

  it("validation: kind, amounts, and closing only with both amounts", async () => {
    await as(ids.admin);
    expect((await act.saveCase(null, form({ ...base, kind: "OTHER" }))).ok).toBe(false);
    expect((await act.saveCase(null, form({ ...base, amountAfter: "abc" }))).message).toMatch(/Amounts are dollars/);
    expect((await act.saveCase(null, form({ ...base, amountBefore: "-5000" }))).message).toMatch(/no minus sign/);
    expect((await act.saveCase(null, form({ ...base, amountBefore: "0x10" }))).ok).toBe(false);
    expect((await act.saveCase(null, form({ ...base, amountBefore: "1e5" }))).ok).toBe(false);
    expect((await act.saveCase(null, form({ ...base, kind: "RECOVERED", amountBefore: "100", amountAfter: "500" }))).message).toMatch(/can't be more than what was missed/);
    expect((await act.saveCase(null, form({ ...base, date: "2026-02-31" }))).message).toMatch(/doesn't exist/);
    expect((await act.saveCase(null, form({ ...base, title: "x".repeat(161) }))).message).toMatch(/title is too long/);
    expect((await act.saveCase(null, form({ ...base, kind: "LOSS", amountBefore: "1500", amountAfter: "1440" }))).message).toMatch(/For a loss/);
    expect((await act.saveCase(null, form({ ...base, kind: "COST_AVOIDED", amountBefore: "100", amountAfter: "500" }))).message).toMatch(/For cost avoided/);
    expect((await act.saveCase(null, form({ ...base, date: "2099-01-01" }))).message).toMatch(/between 2020 and today/);
    expect((await act.saveCase(null, form({ ...base, status: "CLOSED" }))).message).toMatch(/closed once both amounts are known/);
    const r = await act.saveCase(null, form({ ...base, id: made[0], amountAfter: "400", status: "CLOSED" }));
    expect(r.ok).toBe(true);
    expect(await prisma.revenueCase.findUniqueOrThrow({ where: { id: made[0] } })).toMatchObject({ status: "CLOSED" });
  });

  it("a user can't delete; an admin can", async () => {
    await as(ids.user);
    expect((await act.deleteCase(made[0])).ok).toBe(false);
    await as(ids.admin);
    expect(await act.deleteCase(made[0])).toMatchObject({ ok: true });
    expect(await prisma.revenueCase.count({ where: { id: made[0] } })).toBe(0);
  });

  it("the two recorded cases are there from the migration, still open with figures to confirm", async () => {
    const seeded = await prisma.revenueCase.findMany({ where: { id: { in: ["rpc_mwu_nz_pallet", "rpc_ryde_kitting"] } }, orderBy: { date: "asc" } });
    expect(seeded.map((c) => [c.kind, Number(c.amountBefore), Number(c.amountAfter), c.status])).toEqual([
      ["COST_AVOIDED", 4000, 1400, "OPEN"],
      ["LOSS", 1050, 1440, "OPEN"],
    ]);
  });
});
