/**
 * Integration test for the Company settings action — runs only when DATABASE_URL is set
 * (local dev or CI with a PostgreSQL service). Restores the previous company row afterwards.
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isTestDatabase } from "@/lib/test-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ assertAdmin: vi.fn(async () => ({ id: "u", email: "a@b.c", name: "Admin", role: "ADMIN" })) }));

const hasDb = isTestDatabase();

describe.skipIf(!hasDb)("saveCompany (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let saveCompany: typeof import("./actions").saveCompany;
  let before: Awaited<ReturnType<typeof prisma.company.findUnique>>;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ saveCompany } = await import("./actions"));
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

  function form(fields: Record<string, string>, files: Record<string, File> = {}) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    for (const [k, v] of Object.entries(files)) fd.set(k, v);
    return fd;
  }

  const valid = {
    name: "Test Co Pty Ltd",
    shortName: "TC",
    accountHolderName: "David",
    accountHolderEmail: "david@example.com",
    primaryColour: "#123abc",
    timezone: "Australia/Sydney",
  };

  it("saves valid values and normalises the colour", async () => {
    const res = await saveCompany({ ok: false, message: "" }, form(valid));
    expect(res).toMatchObject({ ok: true });
    const row = await prisma.company.findUniqueOrThrow({ where: { id: "default" } });
    expect(row.name).toBe("Test Co Pty Ltd");
    expect(row.accountHolderName).toBe("David");
    expect(row.primaryColour).toBe("#123ABC");
  });

  it("stores and clears an uploaded logo", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "logo.png", { type: "image/png" });
    let res = await saveCompany({ ok: false, message: "" }, form(valid, { logoDark: png }));
    expect(res.ok).toBe(true);
    let row = await prisma.company.findUniqueOrThrow({ where: { id: "default" } });
    expect(row.logoDarkMime).toBe("image/png");
    expect(row.logoDark?.byteLength).toBe(8);

    res = await saveCompany({ ok: false, message: "" }, form({ ...valid, clearLogoDark: "on" }));
    expect(res.ok).toBe(true);
    row = await prisma.company.findUniqueOrThrow({ where: { id: "default" } });
    expect(row.logoDark).toBeNull();
    expect(row.logoDarkMime).toBeNull();
  });

  it("rejects an invalid colour, email and timezone without saving", async () => {
    const res = await saveCompany(
      { ok: false, message: "" },
      form({ ...valid, primaryColour: "blue", accountHolderEmail: "not-an-email" }),
    );
    expect(res.ok).toBe(false);
    expect(res.errors).toHaveProperty("primaryColour");
    expect(res.errors).toHaveProperty("accountHolderEmail");

    const tz = await saveCompany({ ok: false, message: "" }, form({ ...valid, timezone: "Mars/Olympus" }));
    expect(tz.ok).toBe(false);
    expect(tz.errors).toHaveProperty("timezone");
  });

  it("rejects a non-image logo", async () => {
    const txt = new File([new Uint8Array([1, 2, 3])], "x.txt", { type: "text/plain" });
    const res = await saveCompany({ ok: false, message: "" }, form(valid, { logoLight: txt }));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/PNG, JPEG, SVG or WebP/);
  });
});
