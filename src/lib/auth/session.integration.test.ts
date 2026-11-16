/** Sessions against the local DB with a fake cookie jar. Skipped without DATABASE_URL. */
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isTestDatabase } from "@/lib/test-db";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const hasDb = isTestDatabase();

describe.skipIf(!hasDb)("sessions (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let auth: typeof import("./session");
  let hashPassword: typeof import("./password").hashPassword;
  let signInForTest: typeof import("./test-helpers").signInForTest;
  const email = `auth-${Date.now()}@example.com`;
  let userId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    auth = await import("./session");
    ({ hashPassword } = await import("./password"));
    ({ signInForTest } = await import("./test-helpers"));
    const u = await prisma.user.create({ data: { email, name: "Test User", passwordHash: await hashPassword("test-password-123") } });
    userId = u.id;
  });
  beforeEach(() => jar.clear());
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("creates a session, stores only the token hash, and resolves the user", async () => {
    await signInForTest(userId);
    const token = jar.get(auth.SESSION_COOKIE)!;
    expect(token).toBeTruthy();
    const row = await prisma.session.findFirstOrThrow({ where: { userId } });
    expect(row.tokenHash).toBe(auth.hashToken(token));
    expect(row.tokenHash).not.toBe(token);
    expect(await auth.getCurrentUser()).toMatchObject({ id: userId, email, role: "USER" });
  });

  it("returns null for no cookie, an unknown token, an expired session or a deactivated user", async () => {
    expect(await auth.getCurrentUser()).toBeNull();
    jar.set(auth.SESSION_COOKIE, "made-up-token");
    expect(await auth.getCurrentUser()).toBeNull();

    jar.clear();
    await signInForTest(userId);
    await prisma.session.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await auth.getCurrentUser()).toBeNull();

    jar.clear();
    await signInForTest(userId);
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    expect(await auth.getCurrentUser()).toBeNull();
    await prisma.user.update({ where: { id: userId }, data: { active: true } });
  });

  it("requireUser redirects, assertUser throws, assertAdmin rejects a USER", async () => {
    await expect(auth.requireUser()).rejects.toThrow("REDIRECT:/login");
    await expect(auth.assertUser()).rejects.toThrow(/Not signed in/);
    await signInForTest(userId);
    await expect(auth.assertAdmin()).rejects.toThrow(/Only an admin/);
    await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
    await expect(auth.assertAdmin()).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("a pending (password-only) session never signs anyone in; completing 2FA swaps it for a new full one", async () => {
    await auth.createSession(userId, { stage: "pending" });
    const pendingToken = jar.get(auth.SESSION_COOKIE)!;
    expect(await auth.getCurrentUser()).toBeNull();
    await expect(auth.assertUser()).rejects.toThrow(/Not signed in/);
    const pending = await auth.getPendingLogin();
    expect(pending).toMatchObject({ user: { id: userId, totpEnabled: false } });
    const row = await prisma.session.findUniqueOrThrow({ where: { tokenHash: auth.hashToken(pendingToken) } });
    expect(row.twoFactorAt).toBeNull();
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000 + 1000);

    await auth.completeTwoFactor(pending!, "code");
    const fullToken = jar.get(auth.SESSION_COOKIE)!;
    expect(fullToken).not.toBe(pendingToken);
    expect(await prisma.session.findUnique({ where: { tokenHash: auth.hashToken(pendingToken) } })).toBeNull();
    expect(await auth.getCurrentUser()).toMatchObject({ id: userId });
    expect(await auth.getPendingLogin()).toBeNull();
    const full = await prisma.session.findUniqueOrThrow({ where: { tokenHash: auth.hashToken(fullToken) } });
    expect(full.twoFactorMethod).toBe("code");
  });

  it("a session from before 2FA (no twoFactorAt) is treated as signed out", async () => {
    await signInForTest(userId);
    await prisma.session.updateMany({ where: { userId }, data: { twoFactorAt: null } });
    expect(await auth.getCurrentUser()).toBeNull();
  });

  it("OWNER passes admin checks; assertOwner rejects an ADMIN", async () => {
    await signInForTest(userId);
    await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
    await expect(auth.assertOwner()).rejects.toThrow(/Only an owner/);
    const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
    if (!owner) {
      await prisma.user.update({ where: { id: userId }, data: { role: "OWNER" } });
      await expect(auth.assertAdmin()).resolves.toMatchObject({ role: "OWNER" });
      await expect(auth.assertOwner()).resolves.toMatchObject({ id: userId });
    }
    await prisma.user.update({ where: { id: userId }, data: { role: "USER" } });
  });

  it("destroySession removes the row and the cookie", async () => {
    await signInForTest(userId);
    const token = jar.get(auth.SESSION_COOKIE)!;
    await auth.destroySession();
    expect(jar.has(auth.SESSION_COOKIE)).toBe(false);
    expect(await prisma.session.findUnique({ where: { tokenHash: auth.hashToken(token) } })).toBeNull();
  });

  it("8-hour cap; an hour idle locks to 'code only' within the same 8 hours; activity keeps it open", async () => {
    await signInForTest(userId);
    const t0 = jar.get(auth.SESSION_COOKIE)!;
    const row = await prisma.session.findUniqueOrThrow({ where: { tokenHash: auth.hashToken(t0) } });
    expect(Math.round((row.expiresAt.getTime() - Date.now()) / 60_000)).toBe(auth.SESSION_HOURS * 60);
    expect(row.capAt?.getTime()).toBe(row.expiresAt.getTime());
    // 50 minutes idle → still signed in, visit recorded
    await prisma.session.update({ where: { id: row.id }, data: { lastSeenAt: new Date(Date.now() - 50 * 60_000) } });
    expect(await auth.getCurrentUser()).toMatchObject({ id: userId });
    expect((await prisma.session.findUniqueOrThrow({ where: { id: row.id } })).lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 5000);
    // 61 minutes idle → locked: not signed in, pending "code only", same cap
    await prisma.session.update({ where: { id: row.id }, data: { lastSeenAt: new Date(Date.now() - 61 * 60_000) } });
    expect(await auth.getCurrentUser()).toBeNull();
    const pending = await auth.getPendingLogin();
    expect(pending).toMatchObject({ idleLocked: true });
    expect(pending!.capAt!.getTime()).toBe(row.capAt!.getTime());
    await auth.completeTwoFactor(pending!, "code");
    const t1 = jar.get(auth.SESSION_COOKIE)!;
    const again = await prisma.session.findUniqueOrThrow({ where: { tokenHash: auth.hashToken(t1) } });
    expect(again.expiresAt.getTime()).toBe(row.capAt!.getTime());
    expect(await auth.getCurrentUser()).toMatchObject({ id: userId });
  });

  it("idle rules", () => {
    const now = new Date("2026-10-25T10:00:00Z");
    const ago = (m: number) => new Date(now.getTime() - m * 60_000);
    expect(auth.idleState(ago(0.5), now)).toBe("fresh");
    expect(auth.idleState(ago(5), now)).toBe("touch");
    expect(auth.idleState(ago(61), now)).toBe("locked");
  });
});
