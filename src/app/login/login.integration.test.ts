/** Sign-in with 2FA (Batch 2 item 32) against the local DB: password → code, set-up, backup codes, 8-hour device cookie, limits. */
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isTestDatabase } from "@/lib/test-db";

const jar = new Map<string, string>();
const ip = vi.hoisted(() => ({ value: "10.9.3.1" }));
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

const hasDb = isTestDatabase();
const stamp = Date.now();
const mail = (n: string) => `${n}-${stamp}@example.com`;
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe.skipIf(!hasDb)("sign-in with two-step codes (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let login: typeof import("./actions");
  let two: typeof import("./two-factor-actions");
  let session: typeof import("@/lib/auth/session");
  let tf: typeof import("@/lib/auth/two-factor");
  let h: typeof import("@/lib/auth/test-helpers");
  let totp: typeof import("@/lib/auth/totp");
  let secrets: typeof import("@/lib/auth/secrets");
  const ids = { pat: "", sam: "" };
  const PW = "correct-horse-battery";

  const signInWithPassword = (email: string, next = "/payables") => login.login({}, form({ email, password: PW, next }));
  const expectRedirect = async (p: Promise<unknown>, to: string) => {
    await expect(p).rejects.toThrow(`REDIRECT:${to}`);
  };
  /** The secret the set-up page shows (decrypted from the user row, as the QR code carries it). */
  const enrolmentSecret = async (id: string) => secrets.openSecret((await prisma.user.findUniqueOrThrow({ where: { id } })).totpSecret!);
  const codeAt = (secret: string, steps = 0) => totp.totp(totp.base32Decode(secret), Date.now() + steps * 30_000);

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    login = await import("./actions");
    two = await import("./two-factor-actions");
    session = await import("@/lib/auth/session");
    tf = await import("@/lib/auth/two-factor");
    h = await import("@/lib/auth/test-helpers");
    totp = await import("@/lib/auth/totp");
    secrets = await import("@/lib/auth/secrets");
    const { hashPassword } = await import("@/lib/auth/password");
    const passwordHash = await hashPassword(PW);
    ids.pat = (await prisma.user.create({ data: { name: "Pat Person", email: mail("pat"), passwordHash, passwordSetAt: new Date() } })).id;
    ids.sam = (await prisma.user.create({ data: { name: "Sam Second", email: mail("sam"), passwordHash, passwordSetAt: new Date() } })).id;
  });
  beforeEach(() => {
    ip.value = `10.9.3.${Math.floor(Math.random() * 200) + 2}`;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: String(stamp) } } });
    await prisma.authRateLimit.deleteMany({ where: { OR: [{ key: { contains: "10.9.3." } }, { key: { contains: String(stamp) } }, { key: { in: [`code:user:${ids.pat}`, `code:user:${ids.sam}`] } }] } });
    await prisma.$disconnect();
  });

  it("first sign-in after the release: password → set up 2FA → 10 backup codes → signed in", async () => {
    jar.clear();
    await expectRedirect(signInWithPassword(mail("pat")), "/login/setup-2fa?next=%2Fpayables");
    expect(await session.getCurrentUser()).toBeNull(); // password alone signs nobody in
    const pending = await session.getPendingLogin();
    expect(pending?.user.totpEnabled).toBe(false);

    const secret = await tf.getOrCreateEnrolmentSecret(ids.pat);
    expect(await tf.getOrCreateEnrolmentSecret(ids.pat)).toBe(secret); // same QR code after a reload
    const stored = (await prisma.user.findUniqueOrThrow({ where: { id: ids.pat } })).totpSecret!;
    expect(stored).not.toContain(secret); // encrypted at rest

    expect((await two.confirmTwoFactorSetup({}, form({ code: "000000", next: "/payables" }))).error).toMatch(/didn't match/);
    const r = await two.confirmTwoFactorSetup({}, form({ code: codeAt(secret), next: "/payables", remember: "on" }));
    expect(r.codes).toHaveLength(10);
    expect(r.next).toBe("/payables");
    // Still on the half-done session while the codes are on screen; "Continue" finishes the sign-in
    expect(await session.getCurrentUser()).toBeNull();
    expect(await session.getPendingLogin()).toMatchObject({ enrolledNow: true });
    await expectRedirect(two.finishTwoFactorSetup(form({ next: "/payables" })), "/payables");
    expect(await session.getCurrentUser()).toMatchObject({ id: ids.pat });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ids.pat } });
    expect(u.totpEnabledAt).not.toBeNull();
    expect(u.backupCodes).toHaveLength(10);
    expect(u.backupCodes.join()).not.toContain(r.codes![0].replace("-", "")); // hashed
    expect(jar.has(tf.TRUST_COOKIE)).toBe(true);
    expect(jar.has(tf.DEVICE_COOKIE)).toBe(true);
  });

  it("“Don't ask again on this device for 8 hours”: the next password sign-in skips the code", async () => {
    await session.destroySession();
    await expectRedirect(signInWithPassword(mail("pat")), "/payables");
    expect(await session.getCurrentUser()).toMatchObject({ id: ids.pat });
    const row = await prisma.session.findFirstOrThrow({ where: { userId: ids.pat }, orderBy: { createdAt: "desc" } });
    expect(row.twoFactorMethod).toBe("device");
  });

  it("the device cookie is bound to the user, the device id, 8 hours and the current 2FA set-up", async () => {
    const enabledAt = (await prisma.user.findUniqueOrThrow({ where: { id: ids.pat } })).totpEnabledAt!;
    expect(await tf.isThisDeviceTrusted(ids.pat, enabledAt)).toBe(true);
    expect(await tf.isThisDeviceTrusted(ids.pat, enabledAt, Date.now() + 8 * 3_600_000 + 1000)).toBe(false); // after 8 hours
    expect(await tf.isThisDeviceTrusted(ids.sam, enabledAt)).toBe(false); // another user
    expect(await tf.isThisDeviceTrusted(ids.pat, new Date(enabledAt.getTime() + 1))).toBe(false); // 2FA set up again
    const device = jar.get(tf.DEVICE_COOKIE)!;
    jar.set(tf.DEVICE_COOKIE, "someone-elses-device-id-1234");
    expect(await tf.isThisDeviceTrusted(ids.pat, enabledAt)).toBe(false); // cookie copied to another browser
    jar.set(tf.DEVICE_COOKIE, device);
    const trust = jar.get(tf.TRUST_COOKIE)!;
    jar.set(tf.TRUST_COOKIE, trust.slice(0, -3) + "abc");
    expect(await tf.isThisDeviceTrusted(ids.pat, enabledAt)).toBe(false); // tampered
    jar.set(tf.TRUST_COOKIE, trust);

    // Another person on the same browser still needs their own code
    await session.destroySession();
    const samSecret = await h.enrolForTest(ids.sam);
    await expectRedirect(signInWithPassword(mail("sam"), "/"), "/login/verify");
    expect(await session.getCurrentUser()).toBeNull();
    await expectRedirect(two.verifyLoginCode({}, form({ code: codeAt(samSecret), next: "/" })), "/");
    expect(await session.getCurrentUser()).toMatchObject({ id: ids.sam });
  });

  it("login step 2: wrong code refused; each code works once; a backup code works once", async () => {
    jar.clear();
    const secret = await h.enrolForTest(ids.pat);
    // A fresh set of backup codes needs a current code from the app
    const codes = (await tf.regenerateBackupCodes(ids.pat, codeAt(secret)))!;
    expect(codes).toHaveLength(10);
    await expectRedirect(signInWithPassword(mail("pat")), "/login/verify?next=%2Fpayables");
    expect((await two.verifyLoginCode({}, form({ code: "123456", next: "/payables" }))).error).toMatch(/^That code didn't work/);
    // the code used for the backup codes just now can't be used again
    expect((await two.verifyLoginCode({}, form({ code: codeAt(secret), next: "/payables" }))).error).toMatch(/^That code didn't work/);
    await expectRedirect(two.verifyLoginCode({}, form({ code: codes[0].toUpperCase(), next: "/payables" })), "/payables");
    expect(await session.getCurrentUser()).toMatchObject({ id: ids.pat });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.pat } })).backupCodes).toHaveLength(9);

    await session.destroySession();
    await expectRedirect(signInWithPassword(mail("pat")), "/login/verify?next=%2Fpayables");
    expect((await two.verifyLoginCode({}, form({ code: codes[0], next: "/payables" }))).error).toMatch(/^That code didn't work/); // used
    await expectRedirect(two.verifyLoginCode({}, form({ code: codeAt(secret, 1), next: "/payables" })), "/payables"); // next step's code is fine
  });

  it("the 2FA step needs the half-done sign-in; without it you go back to the password", async () => {
    jar.clear();
    await expectRedirect(two.verifyLoginCode({}, form({ code: "123456" })), "/login");
    await expectRedirect(two.confirmTwoFactorSetup({}, form({ code: "123456" })), "/login");
    await expectRedirect(two.finishTwoFactorSetup(form({ next: "/" })), "/login");
  });

  it("“Continue” can't be used to skip the code: it only works right after a set-up on the same session", async () => {
    jar.clear();
    await h.enrolForTest(ids.pat);
    await expectRedirect(signInWithPassword(mail("pat")), "/login/verify?next=%2Fpayables");
    await expectRedirect(two.finishTwoFactorSetup(form({ next: "/payables" })), "/login?next=%2Fpayables");
    expect(await session.getCurrentUser()).toBeNull();
  });

  it("a reset 2FA must be set up again and forgets the trusted device", async () => {
    jar.clear();
    const secret = await h.enrolForTest(ids.pat);
    await expectRedirect(signInWithPassword(mail("pat")), "/login/verify?next=%2Fpayables");
    await expectRedirect(two.verifyLoginCode({}, form({ code: codeAt(secret), next: "/payables", remember: "on" })), "/payables");
    await tf.resetTwoFactor(ids.pat);
    expect(await session.getCurrentUser()).toBeNull(); // signed out everywhere
    await expectRedirect(signInWithPassword(mail("pat")), "/login/setup-2fa?next=%2Fpayables");
  });

  it("wrong passwords and wrong codes are rate-limited", async () => {
    jar.clear();
    let last: Awaited<ReturnType<typeof login.login>> = {};
    for (let i = 0; i < 9; i++) last = await login.login({}, form({ email: mail("sam"), password: "wrong-password!", next: "/" }));
    expect(last.error).toMatch(/^Too many attempts — try again in \d+ minutes?\.$/);
    // even the right password waits now
    expect((await signInWithPassword(mail("sam"))).error).toMatch(/^Too many attempts/);
    await prisma.authRateLimit.deleteMany({ where: { key: `loginEmail:${mail("sam")}` } });

    await h.enrolForTest(ids.sam);
    await expectRedirect(signInWithPassword(mail("sam"), "/"), "/login/verify");
    let r: Awaited<ReturnType<typeof two.verifyLoginCode>> = {};
    for (let i = 0; i < 7; i++) r = await two.verifyLoginCode({}, form({ code: "000000", next: "/" }));
    expect(r.error).toMatch(/^Too many attempts/);
  }, 20_000);

  it("unknown emails and invited users without a password get the same answer as a wrong password", async () => {
    jar.clear();
    const invited = await prisma.user.create({ data: { name: "Ivo Invited", email: mail("ivo"), passwordHash: "" } });
    expect((await login.login({}, form({ email: mail("ivo"), password: "", next: "/" }))).error).toBe("Enter your email and password.");
    expect((await login.login({}, form({ email: mail("ivo"), password: "anything-at-all", next: "/" }))).error).toBe("Email or password is incorrect.");
    expect((await login.login({}, form({ email: mail("ghost"), password: "anything-at-all", next: "/" }))).error).toBe("Email or password is incorrect.");
    await prisma.user.delete({ where: { id: invited.id } });
  });
});
