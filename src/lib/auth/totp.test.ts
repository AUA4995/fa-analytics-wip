import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  groupKey,
  hotp,
  newBackupCodes,
  newTotpSecret,
  normaliseBackupCode,
  normaliseCode,
  otpauthUri,
  stepAt,
  totp,
  verifyTotp,
} from "./totp";

const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");

describe("HOTP (RFC 4226 appendix D)", () => {
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  it.each(expected.map((code, counter) => [counter, code]))("counter %i → %s", (counter, code) => {
    expect(hotp(RFC_SECRET, counter as number)).toBe(code);
  });
});

describe("TOTP (RFC 6238 appendix B, SHA-1)", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("T=%i → %s (8 digits)", (t, code) => {
    expect(totp(RFC_SECRET, t * 1000, 8)).toBe(code);
  });
  it("6-digit codes are the last 6 digits", () => {
    expect(totp(RFC_SECRET, 59_000)).toBe("287082");
    expect(totp(RFC_SECRET, 1111111109_000)).toBe("081804");
  });
});

describe("base32", () => {
  it("round-trips and matches the RFC 4648 vectors", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
    expect(base32Decode("mzxw 6ytb-oi======").toString()).toBe("foobar");
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s)).toHaveLength(20);
  });
  it("rejects characters outside the alphabet", () => {
    expect(() => base32Decode("ABC1")).toThrow();
  });
});

describe("verifyTotp", () => {
  const secret = base32Encode(RFC_SECRET);
  const now = 1_800_000_000_000;
  const step = stepAt(now);
  it("accepts the current, previous and next step only", () => {
    expect(verifyTotp(secret, totp(RFC_SECRET, now), now)).toBe(step);
    expect(verifyTotp(secret, totp(RFC_SECRET, now - 30_000), now)).toBe(step - 1);
    expect(verifyTotp(secret, totp(RFC_SECRET, now + 30_000), now)).toBe(step + 1);
    expect(verifyTotp(secret, totp(RFC_SECRET, now - 60_000), now)).toBeNull();
    expect(verifyTotp(secret, totp(RFC_SECRET, now + 60_000), now)).toBeNull();
  });
  it("refuses a code from a step already used (no replay)", () => {
    const code = totp(RFC_SECRET, now);
    expect(verifyTotp(secret, code, now, step - 1)).toBe(step);
    expect(verifyTotp(secret, code, now, step)).toBeNull();
  });
  it("ignores spaces and refuses non-codes", () => {
    const code = totp(RFC_SECRET, now);
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(step);
    expect(verifyTotp(secret, "12345", now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", now)).toBeNull();
  });
});

describe("codes and URIs", () => {
  it("normaliseCode", () => {
    expect(normaliseCode(" 123 456 ")).toBe("123456");
    expect(normaliseCode("123-456")).toBe("123456");
    expect(normaliseCode("1234567")).toBeNull();
  });
  it("10 different backup codes like xxxxx-xxxxx, without look-alike characters", () => {
    const codes = newBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) {
      expect(c).toMatch(/^[2-9a-hjkmnp-z]{5}-[2-9a-hjkmnp-z]{5}$/);
      expect(normaliseBackupCode(c.toUpperCase())).toBe(c.replace("-", ""));
    }
    expect(normaliseBackupCode("short")).toBeNull();
  });
  it("otpauth URI for authenticator apps", () => {
    const uri = otpauthUri({ secret: "JBSWY3DPEHPK3PXP", account: "asal@fulfilmentaustralia.com.au", issuer: "FA Analytics" });
    expect(uri).toBe(
      "otpauth://totp/FA%20Analytics:asal%40fulfilmentaustralia.com.au?secret=JBSWY3DPEHPK3PXP&issuer=FA%20Analytics&algorithm=SHA1&digits=6&period=30",
    );
    expect(groupKey("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
  });
});
