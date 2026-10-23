/**
 * Integration test for Settings → Branding — runs only when DATABASE_URL is set.
 * Restores the company row afterwards.
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ assertAdmin: vi.fn(async () => ({ id: "u", email: "a@b.c", name: "Admin", role: "ADMIN" })) }));

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("Branding actions (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let saveBranding: typeof import("./branding-actions").saveBranding;
  let resetBranding: typeof import("./branding-actions").resetBranding;
  let getCompany: typeof import("@/lib/company").getCompany;
  let before: Awaited<ReturnType<typeof prisma.company.findUnique>>;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ saveBranding, resetBranding } = await import("./branding-actions"));
    ({ getCompany } = await import("@/lib/company"));
    before = await prisma.company.findUnique({ where: { id: "default" } });
  });

  afterAll(async () => {
    if (before) {
      const { id, ...data } = before;
      delete (data as { updatedAt?: Date }).updatedAt;
      await prisma.company.upsert({ where: { id }, update: data, create: { id, ...data } });
    } else {
      await prisma.company.deleteMany({ where: { id: "default" } });
    }
    await prisma.$disconnect();
  });

  const form = (fields: Record<string, string>, files: Record<string, File> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    for (const [k, v] of Object.entries(files)) fd.set(k, v);
    return fd;
  };
  const colours = { accentColour: "#112233", primaryColour: "#aa00cc", textColour: "#222222" };
  const svg = () => new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], "logo.svg", { type: "image/svg+xml" });

  it("saves colours (upper-cased) and SVG/PNG logos for dark, light and the menu icon", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "l.png", { type: "image/png" });
    const res = await saveBranding({ ok: false, message: "" }, form(colours, { logoDark: svg(), logoLight: png, logoMark: svg() }));
    expect(res.ok).toBe(true);
    const row = await prisma.company.findUniqueOrThrow({ where: { id: "default" } });
    expect([row.accentColour, row.primaryColour, row.textColour]).toEqual(["#112233", "#AA00CC", "#222222"]);
    expect(row.logoDarkMime).toBe("image/svg+xml");
    expect(row.logoLightMime).toBe("image/png");
    expect(row.logoMarkMime).toBe("image/svg+xml");
    const c = await getCompany();
    expect(c).toMatchObject({ accentColour: "#112233", hasLogoDark: true, hasLogoLight: true, hasLogoMark: true });
  });

  it("rejects bad colours and non-image logos without saving", async () => {
    const res = await saveBranding({ ok: false, message: "" }, form({ ...colours, primaryColour: "blue" }, { logoLight: new File(["x"], "x.gif", { type: "image/gif" }) }));
    expect(res.ok).toBe(false);
    expect(res.errors).toHaveProperty("primaryColour");
    expect(res.errors).toHaveProperty("logoLight");
    const row = await prisma.company.findUniqueOrThrow({ where: { id: "default" } });
    expect(row.primaryColour).toBe("#AA00CC");
  });

  it("clears one uploaded logo on request", async () => {
    const res = await saveBranding({ ok: false, message: "" }, form({ ...colours, clear_logoMark: "on" }));
    expect(res.ok).toBe(true);
    const row = await prisma.company.findUniqueOrThrow({ where: { id: "default" } });
    expect(row.logoMarkMime).toBeNull();
    expect(row.logoDarkMime).toBe("image/svg+xml");
  });

  it("Reset to FA brand restores the FA colours and bundled logos", async () => {
    const res = await resetBranding();
    expect(res.ok).toBe(true);
    const row = await prisma.company.findUniqueOrThrow({ where: { id: "default" } });
    expect([row.accentColour, row.primaryColour, row.textColour]).toEqual(["#010028", "#1F54EE", "#14132E"]);
    expect([row.logoDark, row.logoLight, row.logoMark]).toEqual([null, null, null]);
  });
});
