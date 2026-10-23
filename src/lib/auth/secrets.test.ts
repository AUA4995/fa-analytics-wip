import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthConfigError, backupCodeCandidates, hashBackupCode, isAuthKeyConfigured, openSecret, sealSecret, signValue, verifySignedValue } from "./secrets";

const TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
const saved = { a: process.env.AUTH_SECRET, t: process.env.TOKEN_ENCRYPTION_KEY };

describe("sign-in secrets", () => {
  beforeEach(() => {
    delete process.env.AUTH_SECRET;
    process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
  });
  afterEach(() => {
    process.env.AUTH_SECRET = saved.a;
    process.env.TOKEN_ENCRYPTION_KEY = saved.t;
    if (saved.a === undefined) delete process.env.AUTH_SECRET;
    if (saved.t === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  });

  it("encrypts TOTP secrets (random IV, tamper-proof) and falls back to TOKEN_ENCRYPTION_KEY", () => {
    const a = sealSecret("JBSWY3DPEHPK3PXP");
    const b = sealSecret("JBSWY3DPEHPK3PXP");
    expect(a).not.toBe(b);
    expect(a.startsWith("t:")).toBe(true);
    expect(a).not.toContain("JBSWY3DP");
    expect(openSecret(a)).toBe("JBSWY3DPEHPK3PXP");
    const [iv, ct, tag] = a.slice(2).split(".");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 1;
    expect(() => openSecret(`t:${iv}.${flipped.toString("base64")}.${tag}`)).toThrow();
  });

  it("prefers AUTH_SECRET once set, and old values keep opening with the key they were made with", () => {
    const old = sealSecret("old-secret");
    process.env.AUTH_SECRET = "a-long-random-auth-secret-for-tests-0123456789";
    const fresh = sealSecret("new-secret");
    expect(fresh.startsWith("a:")).toBe(true);
    expect(openSecret(fresh)).toBe("new-secret");
    expect(openSecret(old)).toBe("old-secret");
  });

  it("explains a missing or short key in plain words", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(isAuthKeyConfigured()).toBe(false);
    expect(() => sealSecret("x")).toThrow(AuthConfigError);
    expect(() => sealSecret("x")).toThrow(/add AUTH_SECRET to \.env/);
    process.env.AUTH_SECRET = "too-short";
    expect(() => sealSecret("x")).toThrow(/at least 32 characters/);
  });

  it("backup code hashes are keyed per user and checkable under every configured key", () => {
    const h = hashBackupCode("user-1", "abcde23456");
    expect(h).toMatch(/^t:[0-9a-f]{64}$/);
    expect(hashBackupCode("user-2", "abcde23456")).not.toBe(h);
    expect(backupCodeCandidates("user-1", "abcde23456")).toContain(h);
  });

  it("signed values reject any change", () => {
    const v = signValue("user-1|device|123|456");
    expect(verifySignedValue(v)).toBe("user-1|device|123|456");
    const [body, mac] = v.split(".");
    const forged = Buffer.from(Buffer.from(body, "base64url").toString().replace("user-1", "user-2")).toString("base64url");
    expect(verifySignedValue(`${forged}.${mac}`)).toBeNull();
    expect(verifySignedValue(`${body}.${mac.slice(0, -2)}xx`)).toBeNull();
    expect(verifySignedValue("garbage")).toBeNull();
    expect(verifySignedValue(undefined)).toBeNull();
  });
});
