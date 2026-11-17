import { describe, expect, it, vi } from "vitest";
import { plainError } from "./plain-error";

describe("plainError", () => {
  it("keeps our plain messages, hides database internals", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(plainError(new Error("Enter the .wms user name."))).toBe("Enter the .wms user name.");
    const e = Object.assign(new Error("Invalid `prisma.thomaxTable.update()` invocation: column \"x\" does not exist"), { name: "PrismaClientKnownRequestError" });
    expect(plainError(e)).toMatch(/^Something went wrong on the server/);
    expect(plainError(new Error('duplicate key value violates unique constraint "User_email_key"'))).not.toMatch(/User_email/);
  });
});
