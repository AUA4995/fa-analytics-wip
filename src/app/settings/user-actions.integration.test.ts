/** Owner rules (Batch 2 item 1) + email links instead of temporary passwords (item 2), against the local DB. Front is mocked. */
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
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "10.9.1.1" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const front = vi.hoisted(() => ({ configured: true, sent: [] as Array<{ to: string[]; subject: string; text?: string; html: string }> }));
vi.mock("@/lib/front/client", async (orig) => ({
  ...(await orig<typeof import("@/lib/front/client")>()),
  isFrontConfigured: () => front.configured,
  sendEmail: vi.fn(async (input: { to: string[]; subject: string; text?: string; html: string }) => {
    front.sent.push(input);
    return { messageId: "msg_test" };
  }),
}));

const hasDb = isTestDatabase();
const stamp = Date.now();
const mail = (n: string) => `${n}-${stamp}@fulfilmentaustralia.com.au`;

describe.skipIf(!hasDb)("users: owner rules and email links (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let act: typeof import("./user-actions");
  let h: typeof import("@/lib/auth/test-helpers");
  let tokens: typeof import("@/lib/auth/tokens");
  const ids = { owner: "", admin: "", admin2: "", user: "" };
  const restore: Array<() => Promise<void>> = [];

  const as = async (id: string) => {
    jar.clear();
    await h.signInForTest(id);
  };
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const empty = { ok: false, message: "" };

  beforeAll(async () => {
    process.env.APP_URL = "https://hub.test";
    ({ prisma } = await import("@/lib/db"));
    act = await import("./user-actions");
    h = await import("@/lib/auth/test-helpers");
    tokens = await import("@/lib/auth/tokens");
    restore.push(await h.parkExistingOwner());
    restore.push(await h.withSetting("frontSendChannelId", "cha_test"));
    const mk = (name: string, role: "OWNER" | "ADMIN" | "USER") =>
      prisma.user.create({ data: { name, email: mail(name.toLowerCase()), role, passwordHash: "x", passwordSetAt: new Date() } });
    ids.owner = (await mk("Olive Owner", "OWNER")).id;
    ids.admin = (await mk("Adam Admin", "ADMIN")).id;
    ids.admin2 = (await mk("Abby Admin", "ADMIN")).id;
    ids.user = (await mk("Uma User", "USER")).id;
  });
  beforeEach(() => {
    front.configured = true;
    front.sent.length = 0;
  });
  afterAll(async () => {
    await prisma.accessRequest.deleteMany({ where: { email: { contains: String(stamp) } } });
    await prisma.user.deleteMany({ where: { email: { contains: String(stamp) } } });
    for (const r of restore.reverse()) await r();
    await prisma.authRateLimit.deleteMany({ where: { key: { contains: "10.9.1.1" } } });
    await prisma.$disconnect();
  });

  it("only the owner makes or removes admins; nobody changes their own role", async () => {
    await as(ids.admin);
    expect(await act.setUserRole(ids.user, "ADMIN")).toEqual({ ok: false, message: "Only the owner can make or remove admins." });
    await as(ids.owner);
    expect(await act.setUserRole(ids.owner, "USER")).toEqual({ ok: false, message: "You can't change your own role." });
    expect(await act.setUserRole(ids.user, "ADMIN")).toMatchObject({ ok: true, message: "Uma User is now an admin." });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.user } })).role).toBe("ADMIN");
    expect(await act.setUserRole(ids.user, "USER")).toMatchObject({ ok: true });
  });

  it("nobody changes the owner's role, resets the owner's password or 2FA, or deactivates the owner", async () => {
    await as(ids.admin);
    expect((await act.setUserActive(ids.owner, false)).message).toBe("No one can deactivate the owner.");
    expect((await act.resetUserPassword(ids.owner)).message).toMatch(/^No one can reset the owner's password/);
    expect((await act.resendInvite(ids.owner)).message).toBe("No one can invite the owner.");
    expect((await act.resetUserTwoFactor(ids.owner)).message).toBe("Only the owner can do that.");
    await as(ids.owner);
    expect((await act.resetUserTwoFactor(ids.owner)).message).toMatch(/You can't reset your own two-step sign-in here/);
    const o = await prisma.user.findUniqueOrThrow({ where: { id: ids.owner } });
    expect(o).toMatchObject({ role: "OWNER", active: true });
  });

  it("the database refuses a second owner", async () => {
    await expect(prisma.user.update({ where: { id: ids.admin }, data: { role: "OWNER" } })).rejects.toThrow();
  });

  it("admins add, deactivate and reset users only", async () => {
    await as(ids.admin);
    expect(await act.addUser(empty, form({ name: "Ned", email: mail("ned"), role: "ADMIN" }))).toMatchObject({ ok: false, message: "Only the owner can add admins." });
    expect((await act.setUserActive(ids.admin2, false)).message).toBe("Only the owner can deactivate an admin.");
    expect((await act.resetUserPassword(ids.admin2)).message).toBe("Only the owner can reset the password of an admin.");

    await prisma.session.create({ data: { tokenHash: `t-${stamp}`, userId: ids.user, expiresAt: new Date(Date.now() + 86_400_000), twoFactorAt: new Date() } });
    expect(await act.setUserActive(ids.user, false)).toMatchObject({ ok: true, message: "Uma User deactivated and signed out." });
    expect(await prisma.session.count({ where: { userId: ids.user } })).toBe(0);
    expect(await act.setUserActive(ids.user, true)).toMatchObject({ ok: true });
    await as(ids.admin);
    expect(await act.setUserActive(ids.admin, false)).toEqual({ ok: false, message: "You can't deactivate yourself." });
  });

  it("adding a user emails a 7-day invite link — no temporary password, no password at all yet", async () => {
    await as(ids.admin);
    const r = await act.addUser(empty, form({ name: "Nina New", email: mail("nina"), role: "USER" }));
    expect(r).toMatchObject({ ok: true, message: `Nina New added — invitation emailed to ${mail("nina")}.` });
    expect(r.link).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/password:/i);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: mail("nina") } });
    expect(u).toMatchObject({ role: "USER", passwordHash: "", passwordSetAt: null, active: true });
    expect(front.sent).toHaveLength(1);
    expect(front.sent[0].to).toEqual([mail("nina")]);
    expect(front.sent[0].subject).toMatch(/^Set your password for the .* Analytics$/);
    const token = /set-password\?token=([\w-]+)/.exec(front.sent[0].text ?? "")![1];
    const check = await tokens.checkAuthToken(token, ["INVITE"]);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.token.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(front.sent[0].html).toContain("Set your password");

    expect((await act.resetUserPassword(u.id)).message).toBe("Nina New hasn't set a password yet — use Send invite again.");
    const again = await act.resendInvite(u.id);
    expect(again).toMatchObject({ ok: true, message: `New invitation emailed to ${mail("nina")}.` });
    expect((await tokens.checkAuthToken(token, ["INVITE"])).ok).toBe(false); // old link stops working
    expect(await act.addUser(empty, form({ name: "Nina", email: mail("nina"), role: "USER" }))).toMatchObject({ ok: false, message: "A user with that email already exists." });
  });

  it("without Front the invite link is shown once on screen, with a warning", async () => {
    front.configured = false;
    await as(ids.owner);
    const r = await act.addUser(empty, form({ name: "Otto Offline", email: mail("otto"), role: "ADMIN" }));
    expect(r.ok).toBe(true);
    expect(r.message).toBe(`Otto Offline added. The email to ${mail("otto")} wasn't sent: Front isn't connected.`);
    expect(r.link).toMatch(/^https:\/\/hub\.test\/set-password\?token=[\w-]{40,}$/);
    expect(r.linkNote).toMatch(/shown only once and works for 7 days/);
    expect(front.sent).toHaveLength(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: mail("otto") } })).role).toBe("ADMIN");
  });

  it("reset password emails a 2-hour link (owner may reset admins)", async () => {
    await as(ids.owner);
    const r = await act.resetUserPassword(ids.admin);
    expect(r).toMatchObject({ ok: true, message: `Reset link emailed to ${mail("adam admin")}.` });
    expect(r.link).toBeUndefined();
    const token = /reset-password\?token=([\w-]+)/.exec(front.sent[0].text ?? "")![1];
    const check = await tokens.checkAuthToken(token, ["RESET"]);
    expect(check.ok).toBe(true);
    if (check.ok) expect(Math.round((check.token.expiresAt.getTime() - Date.now()) / 60_000)).toBe(120);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } })).passwordHash).toBe("x"); // unchanged until they use the link
  });

  it("only the owner resets someone's 2FA — they set it up again and are signed out", async () => {
    await h.enrolForTest(ids.user);
    await as(ids.admin);
    expect((await act.resetUserTwoFactor(ids.user)).message).toBe("Only the owner can do that.");
    await as(ids.owner);
    await prisma.session.create({ data: { tokenHash: `t2-${stamp}`, userId: ids.user, expiresAt: new Date(Date.now() + 86_400_000), twoFactorAt: new Date() } });
    expect(await act.resetUserTwoFactor(ids.user)).toMatchObject({ ok: true });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ids.user } });
    expect(u).toMatchObject({ totpSecret: null, totpEnabledAt: null, backupCodes: [] });
    expect(await prisma.session.count({ where: { userId: ids.user } })).toBe(0);
  });

  it("transfer ownership: to an active admin only, confirmed with the owner's own code", async () => {
    const ownerSecret = await h.enrolForTest(ids.owner);
    await h.enrolForTest(ids.admin2);
    await as(ids.owner);
    expect((await act.transferOwnership(empty, form({ userId: ids.user, code: h.codeForTest(ownerSecret) }))).message).toMatch(/only go to an active admin/);
    expect((await act.transferOwnership(empty, form({ userId: ids.admin2, code: "000000" }))).message).toMatch(/That code didn't work/);
    await as(ids.admin);
    expect((await act.transferOwnership(empty, form({ userId: ids.admin2, code: h.codeForTest(ownerSecret) }))).message).toBe("Only the owner can do that.");
    await as(ids.owner);
    const r = await act.transferOwnership(empty, form({ userId: ids.admin2, code: h.codeForTest(ownerSecret) }));
    expect(r).toEqual({ ok: true, message: "Abby Admin is now the owner. You're an admin." });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.owner } })).role).toBe("ADMIN");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.admin2 } })).role).toBe("OWNER");
    // and back, for the rest of the file
    await prisma.user.update({ where: { id: ids.admin2 }, data: { role: "ADMIN" } });
    await prisma.user.update({ where: { id: ids.owner }, data: { role: "OWNER" } });
  });

  it("access requests in Settings: only the owner approves or declines, once", async () => {
    const req = await prisma.accessRequest.create({ data: { name: "Rita Request", email: mail("rita"), reason: "Covering accounts" } });
    await as(ids.admin);
    expect((await act.decideAccessRequest(req.id, "approve", "ADMIN")).message).toBe("Only the owner can approve or decline access requests.");
    await as(ids.owner);
    const r = await act.decideAccessRequest(req.id, "approve", "ADMIN");
    expect(r).toMatchObject({ ok: true, message: "Approved — Rita Request is an admin and has been emailed an invitation." });
    const u = await prisma.user.findUniqueOrThrow({ where: { email: mail("rita") } });
    expect(u).toMatchObject({ role: "ADMIN", passwordHash: "" });
    expect(await prisma.accessRequest.findUniqueOrThrow({ where: { id: req.id } })).toMatchObject({ status: "APPROVED", role: "ADMIN", userId: u.id, decidedByName: "Olive Owner" });
    expect(front.sent.at(-1)!.to).toEqual([mail("rita")]);
    expect((await act.decideAccessRequest(req.id, "decline")).message).toBe("This request has already been dealt with.");
  });

  it("the request-access domain is a Company setting (admins may change it; it must be a domain)", async () => {
    const back = await h.withSetting("accessRequestDomain", "fulfilmentaustralia.com.au");
    try {
      await as(ids.admin);
      expect(await act.saveAccessDomain(empty, form({ domain: "not a domain" }))).toMatchObject({ ok: false, message: "Enter a domain like fulfilmentaustralia.com.au" });
      expect(await act.saveAccessDomain(empty, form({ domain: "@PackagingCo.com.au" }))).toMatchObject({ ok: true, message: "Saved — only @packagingco.com.au emails can request access." });
      await as(ids.user);
      expect((await act.saveAccessDomain(empty, form({ domain: "x.com" }))).message).toBe("Only an admin can do that.");
    } finally {
      await back();
    }
  });
});
