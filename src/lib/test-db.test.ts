import { describe, expect, it } from "vitest";
import { isTestDatabase } from "./test-db";

describe("integration tests only touch a *_test database", () => {
  it("accepts …_test, refuses the real database and nonsense", () => {
    expect(isTestDatabase("postgresql://fa:x@localhost:5432/fa_analytics_test?schema=public")).toBe(true);
    expect(isTestDatabase("postgresql://fa:x@localhost:5432/fa_analytics?schema=public")).toBe(false);
    expect(isTestDatabase("postgresql://fa:x@localhost:5432/fa_analytics_test_copy")).toBe(false);
    expect(isTestDatabase("not a url")).toBe(false);
    expect(isTestDatabase(undefined)).toBe(false);
  });
});
