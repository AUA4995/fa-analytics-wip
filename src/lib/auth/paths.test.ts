import { describe, expect, it } from "vitest";
import { isPublicPath, safeNext } from "./paths";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/setup",
    "/api/health",
    "/api/company/logo",
    "/_next/static/x.js",
    "/brand/fa-logo-white.png",
    "/login/verify",
    "/login/setup-2fa",
    "/forgot-password",
    "/reset-password",
    "/set-password",
    "/request-access",
    "/access/approve",
    "/access/decline",
  ])("%s is public", (p) => {
    expect(isPublicPath(p)).toBe(true);
  });
  it.each(["/", "/payables", "/settings", "/api/xero/connect", "/api/xero/callback", "/digests/payables_daily/preview", "/loginx", "/brand", "/access", "/login/verifyx"])("%s needs sign-in", (p) => {
    expect(isPublicPath(p)).toBe(false);
  });
});

describe("safeNext (no open redirects)", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/payables?x=1")).toBe("/payables?x=1");
  });
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "", null, undefined, "/login", "/setup", "/login/verify", "/reset-password?token=x", "/access/approve?token=x"])("%s → /", (n) => {
    expect(safeNext(n as string)).toBe("/");
  });
});
