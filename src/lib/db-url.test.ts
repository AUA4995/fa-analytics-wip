import { afterEach, describe, expect, it } from "vitest";
import { dbSchema, jobsSchema, pgConnectionString } from "./db-url";

const shared = "postgresql://fa_clm_owner:pw@localhost:5432/fa_clm?schema=accounts_hub";
const own = "postgresql://hub:hub@localhost:5432/fa_accounts_hub?schema=public";

describe("db-url helpers", () => {
  afterEach(() => delete process.env.PGBOSS_SCHEMA);
  it("reads the Prisma schema param", () => {
    expect(dbSchema(shared)).toBe("accounts_hub");
    expect(dbSchema(own)).toBe("public");
    expect(dbSchema("postgresql://x@localhost/db")).toBe("public");
    expect(dbSchema("not a url")).toBe("public");
  });
  it("strips schema for pg but keeps everything else", () => {
    expect(pgConnectionString(shared)).toBe("postgresql://fa_clm_owner:pw@localhost:5432/fa_clm");
    expect(pgConnectionString("postgresql://u:p@h:5432/d?schema=x&sslmode=require")).toBe("postgresql://u:p@h:5432/d?sslmode=require");
  });
  it("gives pg-boss its own schema, never the shared default 'pgboss'", () => {
    expect(jobsSchema(shared)).toBe("accounts_hub_jobs");
    expect(jobsSchema(own)).toBe("accounts_hub_jobs");
    process.env.PGBOSS_SCHEMA = "custom_jobs";
    expect(jobsSchema(shared)).toBe("custom_jobs");
  });
});
