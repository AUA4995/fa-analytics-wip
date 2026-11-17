import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Guards the Windows .cmd scripts against label mix-ups (cmd jumps to the FIRST label of a name). */
const dir = join(process.cwd(), "scripts", "windows");
const read = (f: string) => readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n");

describe("Windows scripts", () => {
  it.each(readdirSync(dir).filter((f) => f.endsWith(".cmd")))("%s: every label is defined once and every goto has a label", (f) => {
    const text = read(f);
    const labels = [...text.matchAll(/^:(\w+)\s*$/gm)].map((m) => m[1].toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
    for (const m of text.matchAll(/goto\s+:(\w+)/gi)) if (m[1].toLowerCase() !== "eof") expect(labels).toContain(m[1].toLowerCase());
  });
  it("update.cmd: success message only on the success path, every step failure goes to :fail", () => {
    const lines = read("update.cmd").split("\n");
    const ok = lines.findIndex((l) => l.includes("Updated. Start the app again"));
    const firstLabel = lines.findIndex((l) => /^:\w+/.test(l));
    expect(ok).toBeGreaterThan(-1);
    expect(ok).toBeLessThan(firstLabel); // reached only by falling through after all steps
    expect(lines[ok + 1].trim()).toBe("exit /b 0");
    for (const l of lines.filter((x) => /^(git|call npm)/.test(x))) expect(l).toMatch(/\|\| goto :fail$/);
  });
});
