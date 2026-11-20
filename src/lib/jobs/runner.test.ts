import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";
import { jobsRunner } from "./runner";

describe("job runner (batch 7)", () => {
  it("Vercel → cron, laptop → pg-boss, JOBS_RUNNER wins", () => {
    expect(jobsRunner({})).toBe("pg-boss");
    expect(jobsRunner({ VERCEL: "1" })).toBe("cron");
    expect(jobsRunner({ VERCEL: "1", JOBS_RUNNER: "pg-boss" })).toBe("pg-boss");
    expect(jobsRunner({ JOBS_RUNNER: "cron" })).toBe("cron");
  });
  it("cron tick needs the exact secret; no or short secret refuses everything", () => {
    const s = "a".repeat(32);
    expect(isCronAuthorized(`Bearer ${s}`, s)).toBe(true);
    expect(isCronAuthorized(`Bearer ${s}x`, s)).toBe(false);
    expect(isCronAuthorized(null, s)).toBe(false);
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer short", "short")).toBe(false);
  });
});
