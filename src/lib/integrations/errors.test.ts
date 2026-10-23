import { describe, expect, it } from "vitest";
import { budgetProblem, classifyCode, describeProblem, plainDetail, statusOf, toRawFailure, whenText, type IntegrationKey } from "./errors";
import { buildStatuses } from "./status";

const TZ = "Australia/Sydney";
// 22/10/2026 06:00 Sydney (AEDT, UTC+11)
const AT = new Date("2026-10-21T19:00:00Z");
const NOW = new Date("2026-10-21T19:10:00Z");
const ctx = { at: AT, timeZone: TZ, ownerName: "Asal", now: NOW };

describe("classifying connection failures", () => {
  it.each<[IntegrationKey, string, number | null, string]>([
    ["xero", 'Xero token request failed (400): {"error":"invalid_grant"}', 400, "login_expired"],
    ["xero", "Xero GET /api.xro/2.0/Invoices failed (401)", 401, "login_expired"],
    ["xero", "Xero GET /api.xro/2.0/Invoices failed (503)", 503, "unavailable"],
    ["xero", "fetch failed (ETIMEDOUT)", null, "unavailable"],
    ["xero", "Xero GET /Contacts failed (429)", 429, "rate_limited"],
    ["xero", "Xero is not connected — go to Settings", null, "not_connected"],
    ["front", "Front GET /inboxes failed (401)", 401, "token_rejected"],
    ["front", "Front token needs comments write", 403, "missing_permission"],
    ["front", "Front GET /inboxes failed (502)", 502, "unavailable"],
    ["ai", "Claude API key was rejected — check ANTHROPIC_API_KEY", 401, "key_rejected"],
    ["ai", "Claude API error (400): Your credit balance is too low to access the Anthropic API.", 400, "credit_used_up"],
    ["ai", "Claude API error (529): Overloaded", 529, "unavailable"],
    ["ai", 'Claude model "claude-x" not found', 404, "model_not_found"],
  ])("%s · %s → %s", (key, message, status, code) => {
    expect(classifyCode(key, { message, status })).toBe(code);
  });

  it("reads the HTTP status from errors and messages", () => {
    expect(statusOf(Object.assign(new Error("x"), { status: 403 }))).toBe(403);
    expect(statusOf(new Error("Xero token request failed (400): ..."))).toBe(400);
    expect(statusOf("nothing")).toBeNull();
    expect(toRawFailure(Object.assign(new Error("Front failed (403)"), { status: 403, body: "{}" }))).toEqual({ message: "Front failed (403) {}", status: 403 });
  });
});

describe("plain-words reasons", () => {
  it("Xero login expired → owner reconnects", () => {
    const p = describeProblem("xero", "login_expired", { message: "invalid_grant" }, ctx);
    expect(p.reason).toBe("Xero login expired");
    expect(p.action).toMatch(/Asal \(owner\) needs to reconnect Xero/);
  });
  it("Xero timeout says when, and when it retries", () => {
    const p = describeProblem("xero", "unavailable", { message: "timeout" }, { ...ctx, nextRetryAt: new Date(AT.getTime() + 30 * 60_000) });
    expect(p.reason).toBe("Xero didn't respond at 06:00");
    expect(p.action).toBe("Retrying at 06:30.");
  });
  it("older times get their date (DD/MM/YYYY)", () => {
    expect(whenText(AT, TZ, new Date("2026-10-23T01:00:00Z"))).toBe("22/10/2026 06:00");
  });
  it("Front: token removed/changed, and which permission is missing", () => {
    expect(describeProblem("front", "token_rejected", { message: "" }, ctx).reason).toBe("Front token removed or changed");
    const p = describeProblem("front", "missing_permission", { message: "Front token needs comments write" }, ctx);
    expect(p.reason).toBe("Front token is missing the permission “comments write”");
  });
  it("Claude: key not accepted, credit used up, budget reached", () => {
    expect(describeProblem("ai", "key_rejected", { message: "" }, ctx).reason).toBe("Claude key not accepted");
    expect(describeProblem("ai", "credit_used_up", { message: "" }, ctx).reason).toBe("Claude credit used up");
    expect(budgetProblem(30, "2026-10").reason).toBe("Monthly AI budget reached (US$30.00) — AI paused until 01/11/2026");
    expect(budgetProblem(50, "2026-12").reason).toMatch(/until 01\/01\/2027$/);
  });

  it("no gibberish: every message is a plain sentence, never a bare 'error'/'failed', no JSON or stack", () => {
    const raws = [
      'Xero token request failed (400): {"error":"invalid_grant","error_description":"x"}\n at stack (file.ts:1:2)',
      "TypeError: Cannot read properties of undefined (reading 'x')",
      "",
      "error",
    ];
    const codes: Record<IntegrationKey, string[]> = {
      xero: ["not_connected", "login_expired", "forbidden", "rate_limited", "unavailable", "other"],
      front: ["not_configured", "token_rejected", "missing_permission", "rate_limited", "unavailable", "other"],
      ai: ["not_configured", "key_rejected", "credit_used_up", "key_forbidden", "model_not_found", "rate_limited", "unavailable", "other"],
    };
    for (const key of Object.keys(codes) as IntegrationKey[])
      for (const code of codes[key])
        for (const message of raws) {
          const p = describeProblem(key, code, { message }, ctx);
          for (const text of [p.reason, p.action]) {
            expect(text, `${key}/${code}`).toMatch(/^[A-Z0-9]/);
            expect(text).not.toMatch(/[{}[\]]|undefined|null|\bat stack\b|\[object|^(error|failed)\.?$/i);
            expect(text.length).toBeLessThan(260);
          }
          expect(p.action).toMatch(/[.!]$/);
        }
  });

  it("plainDetail keeps the first line only, cuts JSON, ends with a full stop", () => {
    expect(plainDetail('validation failed: {"Elements":[1]}\nstack')).toBe("Validation failed.");
    expect(plainDetail("")).toBe("No details were given.");
    expect(plainDetail("x".repeat(400)).length).toBeLessThanOrEqual(161);
  });
});

describe("connection statuses", () => {
  const base = {
    timeZone: TZ,
    ownerName: "Asal",
    now: NOW,
    xero: { configured: true, connected: true, lastSyncAt: new Date("2026-10-21T18:00:00Z") },
    front: { configured: true, lastScanAt: new Date("2026-10-21T18:30:00Z") },
    ai: { configured: true, budgetPaused: false, budgetUsd: 30, month: "2026-10", lastCallAt: null },
    rows: {},
  };
  it("Connected with the last success time", () => {
    const [x, f, a] = buildStatuses(base);
    expect(x).toMatchObject({ state: "connected", headline: "Connected · last sync 05:00" });
    expect(f).toMatchObject({ state: "connected", headline: "Connected · last scan 05:30" });
    expect(a).toMatchObject({ state: "connected", headline: "Connected · no AI call yet" });
  });
  it("Disconnected → ask the owner", () => {
    const s = buildStatuses({ ...base, xero: { ...base.xero, connected: false }, ai: { ...base.ai, configured: false } });
    expect(s[0]).toMatchObject({ state: "disconnected", headline: "Not connected — ask Asal to connect" });
    expect(s[2].headline).toBe("Not connected — ask Asal to connect");
  });
  it("an error newer than the last success is shown with reason + what to do; an older one is not", () => {
    const err = { lastSuccessAt: null, lastErrorAt: AT, errorCode: "login_expired", errorStatus: 400, errorMessage: "invalid_grant", nextRetryAt: null };
    const s = buildStatuses({ ...base, rows: { xero: err } });
    expect(s[0].state).toBe("error");
    expect(s[0].headline).toBe("Xero login expired. Asal (owner) needs to reconnect Xero in Settings → Connections & AI. Synced data is kept.");
    const later = buildStatuses({ ...base, xero: { ...base.xero, lastSyncAt: new Date(AT.getTime() + 60_000) }, rows: { xero: err } });
    expect(later[0].state).toBe("connected");
  });
  it("AI budget reached shows as a problem", () => {
    const s = buildStatuses({ ...base, ai: { ...base.ai, budgetPaused: true } });
    expect(s[2]).toMatchObject({ state: "error" });
    expect(s[2].headline).toMatch(/^Monthly AI budget reached \(US\$30\.00\) — AI paused until 01\/11\/2026\./);
  });
});

describe("AI safety stop status", () => {
  it("says the job is paused for an hour, in plain words", async () => {
    const { classifyCode, describeProblem } = await import("./errors");
    const f = { message: "sortEmail: paused for an hour after 8 failed replies in a row", status: null };
    const code = classifyCode("ai", f);
    expect(code).toBe("replies_unreadable");
    const p = describeProblem("ai", code, f, { at: new Date("2026-10-22T08:00:00Z"), timeZone: "Australia/Sydney", ownerName: "Asal", now: new Date("2026-10-22T08:05:00Z"), nextRetryAt: null });
    expect(p.reason).toMatch(/paused for an hour/);
    expect(p.action).toMatch(/everything else keeps working/);
  });
});
