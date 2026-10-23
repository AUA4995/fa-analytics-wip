import { describe, expect, it } from "vitest";
import { DEFAULT_ACCESS_DOMAIN, emailInDomain, normaliseDomain } from "./domain";

describe("request-access domain", () => {
  it("defaults to the FA domain", () => {
    expect(DEFAULT_ACCESS_DOMAIN).toBe("fulfilmentaustralia.com.au");
  });
  it.each([
    ["@FulfilmentAustralia.com.au ", "fulfilmentaustralia.com.au"],
    ["packagingco.com.au", "packagingco.com.au"],
    ["my-company.co", "my-company.co"],
  ])("normalises %s", (input, out) => {
    expect(normaliseDomain(input)).toBe(out);
  });
  it.each(["", "localhost", "not a domain", "-bad.com", "bad-.com", "x@y.com", "a..b.com"])("rejects %j", (input) => {
    expect(normaliseDomain(input)).toBeNull();
  });
  it("accepts only the exact domain", () => {
    const d = "fulfilmentaustralia.com.au";
    expect(emailInDomain("David@FulfilmentAustralia.com.au", d)).toBe(true);
    expect(emailInDomain("david@mail.fulfilmentaustralia.com.au", d)).toBe(false);
    expect(emailInDomain("david@fulfilmentaustralia.com.au.evil.com", d)).toBe(false);
    expect(emailInDomain("david@evilfulfilmentaustralia.com.au", d)).toBe(false);
    expect(emailInDomain("a@b@fulfilmentaustralia.com.au", d)).toBe(false);
    expect(emailInDomain("@fulfilmentaustralia.com.au", d)).toBe(false);
  });
});
