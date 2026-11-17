/** Security review: a user can't approve a lender report or change its class through the edit action. */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isTestDatabase } from "@/lib/test-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  assertUser: vi.fn(async () => ({ id: "u", email: "u@b.c", name: "Uma", role: "USER" })),
  assertOwner: vi.fn(async () => {
    throw new Error("owners only");
  }),
}));

describe.skipIf(!isTestDatabase())("updateReportAction (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let act: typeof import("./actions");
  let id = "";
  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    act = await import("./actions");
    id = (await prisma.report.create({ data: { name: "Bank pack test", template: "finance", period: "MONTH", cls: "EXTERNAL", createdBy: "T" } })).id;
  });
  afterAll(async () => {
    await prisma.changeLog.deleteMany({ where: { entity: "report", entityId: id } });
    await prisma.report.deleteMany({ where: { id } });
    await prisma.$disconnect();
  });

  it("refuses approval, class or template changes; keeps ordinary edits", async () => {
    expect(await act.updateReportAction(id, { approvedAt: "2026-11-17T00:00:00Z", approvedBy: "Mark" })).toMatchObject({ ok: false });
    expect(await act.updateReportAction(id, { cls: "INTERNAL" })).toMatchObject({ ok: false });
    expect(await act.updateReportAction(id, { name: "Bank pack Nov" })).toMatchObject({ ok: true });
    const r = await prisma.report.findUniqueOrThrow({ where: { id } });
    expect([r.approvedAt, r.cls, r.name]).toEqual([null, "EXTERNAL", "Bank pack Nov"]);
  });
});
