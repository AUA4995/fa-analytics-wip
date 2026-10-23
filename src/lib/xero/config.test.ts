import { describe, expect, it } from "vitest";
import { DEFAULT_XERO_SCOPES, XERO_SCOPES, assertReadOnlyScopes, canReadAttachments } from "./config";
import { decrypt, encrypt } from "@/lib/crypto";

describe("Xero scopes are read-only", () => {
  it("the configured scope list contains no write scopes", () => {
    expect(() => assertReadOnlyScopes(XERO_SCOPES)).not.toThrow();
    expect(XERO_SCOPES.filter((s) => s.startsWith("accounting.")).every((s) => s.endsWith(".read"))).toBe(true);
  });
  it("uses granular scopes only — no broad scopes that new Xero apps reject", () => {
    for (const banned of ["accounting.transactions", "accounting.transactions.read", "accounting.reports.read"]) {
      expect(DEFAULT_XERO_SCOPES as readonly string[]).not.toContain(banned);
    }
    expect(DEFAULT_XERO_SCOPES).toContain("accounting.invoices.read");
    expect(DEFAULT_XERO_SCOPES).toContain("offline_access");
    expect(DEFAULT_XERO_SCOPES).toContain("accounting.attachments.read");
  });
  it("knows when the stored connection can read attachments (else: reconnect Xero)", () => {
    expect(canReadAttachments("openid accounting.invoices.read accounting.attachments.read offline_access")).toBe(true);
    expect(canReadAttachments("openid accounting.invoices.read")).toBe(false);
    expect(canReadAttachments(null)).toBe(false);
  });
  it("rejects write scopes", () => {
    expect(() => assertReadOnlyScopes(["accounting.transactions"])).toThrow(/write scopes are not allowed/);
    expect(() => assertReadOnlyScopes(["accounting.contacts.read", "accounting.settings"])).toThrow();
    expect(() => assertReadOnlyScopes(["accounting.invoices"])).toThrow();
    expect(() => assertReadOnlyScopes(["payroll.timesheets"])).toThrow();
  });
});

describe("token encryption", () => {
  it("round-trips and never stores plaintext", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const stored = encrypt("refresh-token-secret");
    expect(stored).not.toContain("refresh-token-secret");
    expect(stored.split(".")).toHaveLength(3);
    expect(decrypt(stored)).toBe("refresh-token-secret");
  });
  it("rejects a tampered value", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const stored = encrypt("abc");
    const [iv, enc, tag] = stored.split(".");
    expect(() => decrypt(`${iv}.${enc}.${tag.slice(0, -2)}AA`)).toThrow();
  });
  it("requires a 32-byte key", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encrypt("x")).toThrow(/32 bytes/);
  });
});
