import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SOURCES } from "./registry";

/** Every source that isn't connected yet is flagged on at least one page (batch 2 review: no unflagged numbers). */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("not-connected flags", () => {
  const all = files(path.resolve(__dirname, "../../app"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  it.each(SOURCES.map((s) => s.key))("%s is flagged on a page", (key) => {
    expect(all).toMatch(new RegExp(`<NotConnected source="${key}"`));
  });
  it("every affected page link points inside the app", () => {
    for (const s of SOURCES) for (const a of s.affects) expect(a.href.startsWith("/")).toBe(true);
  });
});
