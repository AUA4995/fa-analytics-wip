/** Menu pin preference is remembered per user — runs only when DATABASE_URL is set. */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const me = { id: "", email: "pin-test@example.com", name: "Pin Test", role: "USER" as const };
vi.mock("@/lib/auth/session", () => ({
  assertUser: vi.fn(async () => {
    if (!me.id) throw new Error("Not signed in");
    return me;
  }),
}));

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("setMenuPinned (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let setMenuPinned: typeof import("./shell").setMenuPinned;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ setMenuPinned } = await import("./shell"));
    await prisma.user.deleteMany({ where: { email: me.email } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: me.email } });
    await prisma.$disconnect();
  });

  it("is signed-in only", async () => {
    expect(await setMenuPinned(false)).toEqual({ ok: false });
  });

  it("new users start pinned; the choice survives (stored on the user)", async () => {
    const u = await prisma.user.create({ data: { email: me.email, name: me.name, passwordHash: "x" } });
    me.id = u.id;
    expect(u.menuPinned).toBe(true);
    expect(await setMenuPinned(false)).toEqual({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).menuPinned).toBe(false);
    expect(await setMenuPinned(true)).toEqual({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).menuPinned).toBe(true);
  });
});
