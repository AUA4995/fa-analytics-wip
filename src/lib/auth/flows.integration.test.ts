/**
 * Email-link flows against the local DB (Batch 2 items 2, 30, 31, 33): invite → set password → 2FA set-up,
 * forgot / reset password, request access → owner's Approve / Decline link with 2FA code, owner recovery.
 * Front is mocked.
 */
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isTestDatabase } from "@/lib/test-db";

const jar = new Map<string, string>();
const ip = vi.hoisted(() => ({ value: "10.9.2.1" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": ip.value }),
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
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const linkToken = (text: string | undefined, path: string) => new RegExp(`${path.replace("/", "\\/")}\\?token=([\\w-]+)`).exec(text ?? "")?.[1] ?? "";

describe.skipIf(!hasDb)("email-link flows (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let h: typeof import("@/lib/auth/test-helpers");
  let pub: typeof import("@/app/login/public-actions");
  let access: typeof import("@/app/access/actions");
  let settings: typeof import("@/app/settings/user-actions");
  let session: typeof import("./session");
  let tokens: typeof import("./tokens");
  let flows: typeof import("./flows");
  let copy: typeof import("./copy");
  let ownerId = "";
  let ownerSecret = "";
  const restore: Array<() => Promise<void>> = [];

  const expectRedirect = async (p: Promise<unknown>, to: string) => {
    await expect(p).rejects.toThrow(`REDIRECT:${to}`);
  };

  beforeAll(async () => {
    process.env.APP_URL = "https://hub.test";
    ({ prisma } = await import("@/lib/db"));
    h = await import("./test-helpers");
    pub = await import("@/app/login/public-actions");
    access = await import("@/app/access/actions");
    settings = await import("@/app/settings/user-actions");
    session = await import("./session");
    tokens = await import("./tokens");
    flows = await import("./flows");
    copy = await import("./copy");
    restore.push(await h.parkExistingOwner());
    restore.push(await h.withSetting("frontSendChannelId", "cha_test"));
    restore.push(await h.withSetting("accessRequestDomain", "fulfilmentaustralia.com.au"));
    const { hashPassword } = await import("./password");
    ownerId = (await prisma.user.create({ data: { name: "Olga Owner", email: mail("olga"), role: "OWNER", passwordHash: await hashPassword("owner-password-1"), passwordSetAt: new Date() } })).id;
    ownerSecret = await h.enrolForTest(ownerId);
  });
  beforeEach(async () => {
    jar.clear();
    front.configured = true;
    front.sent.length = 0;
    ip.value = `10.9.2.${Math.floor(Math.random() * 200) + 2}`;
    await prisma.user.update({ where: { id: ownerId }, data: { totpLastStep: null } });
  });
  afterAll(async () => {
    await prisma.accessRequest.deleteMany({ where: { email: { contains: String(stamp) } } });
    await prisma.user.deleteMany({ where: { email: { contains: String(stamp) } } });
    for (const r of restore.reverse()) await r();
    await prisma.authRateLimit.deleteMany({ where: { OR: [{ key: { contains: "10.9.2." } }, { key: { contains: String(stamp) } }] } });
    await prisma.$disconnect();
  });

  it("invite → set password → straight to 2FA set-up; the link works once", async () => {
    await h.signInForTest(ownerId);
    await settings.addUser({ ok: false, message: "" }, form({ name: "Dana Doe", email: mail("dana"), role: "USER" }));
    const token = linkToken(front.sent[0].text, "/set-password");
    expect(token).toBeTruthy();
    jar.clear();

    expect(await pub.setNewPassword({}, form({ token, kind: "invite", password: "short", confirm: "short" }))).toEqual({ error: "Password must be at least 10 characters." });
    expect(await pub.setNewPassword({}, form({ token, kind: "invite", password: "dana-password-1", confirm: "dana-password-2" }))).toEqual({ error: "Passwords don't match." });
    // An invite link can't be used on the reset page and vice versa
    expect((await pub.setNewPassword({}, form({ token, kind: "reset", password: "dana-password-1", confirm: "dana-password-1" }))).error).toMatch(/isn't valid/);

    await expectRedirect(pub.setNewPassword({}, form({ token, kind: "invite", password: "dana-password-1", confirm: "dana-password-1" })), "/login/setup-2fa");
    const pending = await session.getPendingLogin();
    expect(pending?.user).toMatchObject({ email: mail("dana"), totpEnabled: false });
    expect(await session.getCurrentUser()).toBeNull();
    const u = await prisma.user.findUniqueOrThrow({ where: { email: mail("dana") } });
    expect(u.passwordSetAt).not.toBeNull();
    expect(u.passwordHash.startsWith("scrypt$")).toBe(true);

    expect(await pub.setNewPassword({}, form({ token, kind: "invite", password: "dana-password-9", confirm: "dana-password-9" }))).toEqual({
      error: "This invitation link has already been used. Ask for a new one if you still need it.",
    });
  });

  it("links expire", async () => {
    const u = await prisma.user.create({ data: { name: "Eve Expired", email: mail("eve"), passwordHash: "" } });
    const t = await tokens.createAuthToken({ purpose: "INVITE", userId: u.id });
    await prisma.authToken.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await tokens.checkAuthToken(t, ["INVITE"])).toEqual({ ok: false, reason: "expired" });
    expect(await pub.setNewPassword({}, form({ token: t, kind: "invite", password: "eve-password-1", confirm: "eve-password-1" }))).toEqual({ error: "This invitation link has expired. Ask for a new one." });
    expect(await tokens.checkAuthToken("not-a-real-token-but-long-enough", ["INVITE"])).toEqual({ ok: false, reason: "unknown" });
    // consume is atomic: only the first caller wins
    const t2 = await tokens.createAuthToken({ purpose: "RESET", userId: u.id });
    const c = await tokens.checkAuthToken(t2, ["RESET"]);
    expect(c.ok).toBe(true);
    if (c.ok) {
      const [a, b] = await Promise.all([tokens.consumeAuthToken(c.token.id), tokens.consumeAuthToken(c.token.id)]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
    }
    const stored = await prisma.authToken.findMany({ where: { userId: u.id } });
    expect(stored.every((s) => s.tokenHash !== t && s.tokenHash !== t2)).toBe(true); // only hashes are stored
  });

  it("forgot password: the same reply for any email; a link only to real active users; rate-limited", async () => {
    const { hashPassword } = await import("./password");
    const u = await prisma.user.create({ data: { name: "Fay Forgot", email: mail("fay"), passwordHash: await hashPassword("fay-old-password"), passwordSetAt: new Date() } });
    const known = await pub.forgotPassword({}, form({ email: mail("fay") }));
    const unknown = await pub.forgotPassword({}, form({ email: mail("nobody") }));
    expect(known).toEqual({ ok: true, message: copy.FORGOT_REPLY });
    expect(unknown).toEqual(known);
    expect(front.sent).toHaveLength(1);
    expect(front.sent[0].to).toEqual([mail("fay")]);
    expect(front.sent[0].subject).toMatch(/^Reset your .* password$/);

    // Over the per-email limit: same reply, nothing more sent
    await pub.forgotPassword({}, form({ email: mail("fay") }));
    await pub.forgotPassword({}, form({ email: mail("fay") }));
    const sentBefore = front.sent.length;
    expect(await pub.forgotPassword({}, form({ email: mail("fay") }))).toEqual(known);
    expect(front.sent.length).toBe(sentBefore);

    // Reset: new password, signed out everywhere, other reset links dead, back to sign in
    const token = linkToken(front.sent.at(-1)!.text, "/reset-password");
    const first = linkToken(front.sent[0].text, "/reset-password");
    await prisma.session.create({ data: { tokenHash: `f-${stamp}`, userId: u.id, expiresAt: new Date(Date.now() + 86_400_000), twoFactorAt: new Date() } });
    await expectRedirect(pub.setNewPassword({}, form({ token, kind: "reset", password: "fay-new-password", confirm: "fay-new-password" })), "/login?done=reset");
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
    expect((await tokens.checkAuthToken(first, ["RESET"])).ok).toBe(false);
    const { verifyPassword } = await import("./password");
    expect(await verifyPassword("fay-new-password", (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash)).toBe(true);
  });

  it("request access: company domain only, neutral reply, owner emailed Approve / Decline links", async () => {
    expect(await pub.requestAccess({}, form({ name: "Gus Gmail", email: `gus-${stamp}@gmail.com`, reason: "I need to see invoices" }))).toMatchObject({
      error: "Use your @fulfilmentaustralia.com.au email address.",
    });
    expect((await pub.requestAccess({}, form({ name: "G", email: mail("g"), reason: "x" }))).error).toBe("Enter your name");

    const r = await pub.requestAccess({}, form({ name: "Greta Green", email: mail("greta"), reason: "Covering accounts in November" }));
    expect(r).toEqual({ ok: true, message: copy.REQUEST_REPLY });
    const req = await prisma.accessRequest.findFirstOrThrow({ where: { email: mail("greta") } });
    expect(req).toMatchObject({ status: "PENDING", name: "Greta Green", reason: "Covering accounts in November" });
    expect(front.sent).toHaveLength(1);
    expect(front.sent[0].to).toEqual([mail("olga")]);
    expect(front.sent[0].subject).toBe(`Greta Green (${mail("greta")}) asked for access`);
    const approve = linkToken(front.sent[0].text, "/access/approve");
    expect(linkToken(front.sent[0].text, "/access/decline")).toBe(approve);

    // Same reply for an existing user and a duplicate request; no new rows
    expect(await pub.requestAccess({}, form({ name: "Olga", email: mail("olga"), reason: "Just checking it" }))).toEqual(r);
    expect(await pub.requestAccess({}, form({ name: "Greta Green", email: mail("greta"), reason: "Asking again please" }))).toEqual(r);
    expect(await prisma.accessRequest.count({ where: { email: { in: [mail("greta"), mail("olga")] } } })).toBe(1);

    // Approve from the email link: needs the owner's 2FA code, then creates the user and sends the invite
    expect(await access.decideAccessWithLink({}, form({ token: approve, decision: "approve", role: "ADMIN", code: "000000" }))).toEqual({
      error: "That code didn't work. Use the newest code in your authenticator app, or a backup code.",
    });
    expect(await prisma.user.findUnique({ where: { email: mail("greta") } })).toBeNull();
    front.sent.length = 0;
    const ok = await access.decideAccessWithLink({}, form({ token: approve, decision: "approve", role: "ADMIN", code: h.codeForTest(ownerSecret) }));
    expect(ok).toMatchObject({ ok: true, message: "Approved — Greta Green is an admin and has been emailed an invitation." });
    expect(ok.link).toBeUndefined();
    expect(await prisma.user.findUniqueOrThrow({ where: { email: mail("greta") } })).toMatchObject({ role: "ADMIN", passwordHash: "" });
    expect(front.sent[0].to).toEqual([mail("greta")]);
    // Single use
    await prisma.user.update({ where: { id: ownerId }, data: { totpLastStep: null } });
    expect((await access.decideAccessWithLink({}, form({ token: approve, decision: "decline", code: h.codeForTest(ownerSecret) }))).error).toMatch(/already been used/);
  });

  it("decline link; approving without Front shows the invite link once to the owner", async () => {
    await pub.requestAccess({}, form({ name: "Hal Help", email: mail("hal"), reason: "Temp for stocktake" }));
    await pub.requestAccess({}, form({ name: "Ivy Ink", email: mail("ivy"), reason: "New accounts assistant" }));
    const [hal, ivy] = [linkToken(front.sent[0].text, "/access/decline"), linkToken(front.sent[1].text, "/access/approve")];
    const d = await access.decideAccessWithLink({}, form({ token: hal, decision: "decline", code: h.codeForTest(ownerSecret) }));
    expect(d).toMatchObject({ ok: true, message: `Declined — Hal Help (${mail("hal")}) won't get access. Nothing was sent to them.` });
    expect(await prisma.user.findUnique({ where: { email: mail("hal") } })).toBeNull();

    front.configured = false;
    await prisma.user.update({ where: { id: ownerId }, data: { totpLastStep: null } });
    const a = await access.decideAccessWithLink({}, form({ token: ivy, decision: "approve", role: "USER", code: h.codeForTest(ownerSecret) }));
    expect(a.ok).toBe(true);
    expect(a.message).toBe("Approved — Ivy Ink is a user, but the invitation email wasn't sent (Front isn't connected).");
    expect(a.link).toMatch(/^https:\/\/hub\.test\/set-password\?token=/);
  });

  it("request access without Front: stored for Settings, nothing shown to the requester", async () => {
    front.configured = false;
    const r = await pub.requestAccess({}, form({ name: "Jo Quiet", email: mail("jo"), reason: "Need read access" }));
    expect(r).toEqual({ ok: true, message: copy.REQUEST_REPLY });
    expect(JSON.stringify(r)).not.toContain("token");
    expect(await prisma.accessRequest.count({ where: { email: mail("jo"), status: "PENDING" } })).toBe(1);
    expect(await prisma.authToken.count({ where: { accessRequest: { email: mail("jo") } } })).toBe(0);
  });

  it("request access is rate-limited per address", async () => {
    let last: Awaited<ReturnType<typeof pub.requestAccess>> = {};
    for (let i = 0; i < 6; i++) last = await pub.requestAccess({}, form({ name: "Kim Spam", email: mail(`kim${i}`), reason: "Let me in please" }));
    expect(last.error).toMatch(/^Too many attempts — try again in \d+ minutes?\.$/);
  });

  it("owner recovery: without Front nothing changes; with Front one email, no token printed, and it resets 2FA when used", async () => {
    front.configured = false;
    const before = await prisma.authToken.count({ where: { userId: ownerId } });
    expect(await flows.sendOwnerRecovery()).toEqual({ sent: false, message: "Front not connected — cannot send; nothing changed." });
    expect(await prisma.authToken.count({ where: { userId: ownerId } })).toBe(before);

    front.configured = true;
    const r = await flows.sendOwnerRecovery();
    expect(r).toEqual({ sent: true, to: `o***@fulfilmentaustralia.com.au` });
    expect(front.sent).toHaveLength(1);
    expect(front.sent[0].to).toEqual([mail("olga")]);
    const token = linkToken(front.sent[0].text, "/reset-password");
    const o = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    expect(o.passwordHash.startsWith("scrypt$")).toBe(true); // no password was set
    expect(o.totpEnabledAt).not.toBeNull(); // nothing changes until the link is used

    await expectRedirect(pub.setNewPassword({}, form({ token, kind: "reset", password: "owner-password-2", confirm: "owner-password-2" })), "/login/setup-2fa");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    expect(after).toMatchObject({ totpEnabledAt: null, totpSecret: null, role: "OWNER" });
    ownerSecret = await h.enrolForTest(ownerId);
  });
});
