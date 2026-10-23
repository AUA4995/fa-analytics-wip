import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
  });
  it("salts every hash", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });
  it("rejects malformed stored values", async () => {
    expect(await verifyPassword("x", "plaintext")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });
  it("enforces a minimum length", () => {
    expect(passwordProblem("short")).toMatch(/at least 10/);
    expect(passwordProblem("long-enough-pw")).toBeNull();
  });
  it("an empty stored hash (invited, no password yet) never verifies", async () => {
    expect(await verifyPassword("", "")).toBe(false);
    expect(await verifyPassword("anything-at-all", "")).toBe(false);
  });
});
