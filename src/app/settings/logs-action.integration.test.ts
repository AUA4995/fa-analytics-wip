/** Who may read change history (security review): one record at a time; access/connection/setup history for admins only. */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isTestDatabase } from "@/lib/test-db";

let role = "USER";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  assertUser: vi.fn(async () => ({ id: "u", email: "u@b.c", name: "Uma", role })),
  assertAdmin: vi.fn(async () => ({ id: "u", email: "u@b.c", name: "Uma", role })),
}));

describe.skipIf(!isTestDatabase())("logsAction (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let logsAction: typeof import("./model-actions").logsAction;
  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ logsAction } = await import("./model-actions"));
    await prisma.changeLog.createMany({
      data: [
        { entity: "thomax", entityId: "connection", field: "connection", newValue: { username: "secretuser" }, actorType: "USER", actorName: "T" },
        { entity: "site", entityId: "logs-test", field: "labourUtil", newValue: 0.8, actorType: "USER", actorName: "T" },
      ],
    });
  });
  afterAll(async () => {
    await prisma.changeLog.deleteMany({ where: { OR: [{ entityId: "logs-test" }, { actorName: "T", entity: "thomax" }] } });
    await prisma.$disconnect();
  });

  it("users see a record's own history, never everything and never access/connection history", async () => {
    role = "USER";
    expect(await logsAction("site", "logs-test")).toHaveLength(1);
    expect(await logsAction("site", "*")).toEqual([]);
    expect(await logsAction("thomax", "connection")).toEqual([]);
    expect(await logsAction("user", "*")).toEqual([]);
    for (const id of ["%|*", "_|*", "a*", "|*", "%"]) expect(await logsAction("allocation", id), id).toEqual([]);
    expect(await logsAction("setting", "internalDomains")).toEqual([]);
    expect(await logsAction("staff", "x")).toEqual([]);
  });
  it("admins see connection history of one record, still never a bare *", async () => {
    role = "ADMIN";
    expect((await logsAction("thomax", "connection")).length).toBeGreaterThan(0);
    expect(await logsAction("thomax", "*")).toEqual([]);
  });
});
