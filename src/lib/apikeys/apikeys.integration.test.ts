/** Keys we give out: auth, scopes, expiry / revoke, and two API routes, against the test database. */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("API keys (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let keys: typeof import("./index");
  const tag = `ak${Date.now()}`;
  const made: string[] = [];
  const mk = async (scopes: string[], extra: { expiresAt?: Date; revokedAt?: Date } = {}) => {
    const k = keys.generateKey();
    const row = await prisma.apiKey.create({ data: { name: `${tag}-${made.length}`, prefix: k.prefix, hash: k.hash, scopes, createdBy: "test", ...extra } });
    made.push(row.id);
    return k.key;
  };
  const req = (key: string | null, url = "http://x/api/v1/volumes?month=2026-09", init: RequestInit = {}) => new Request(url, { ...init, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" } });

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    keys = await import("./index");
  });
  afterAll(async () => {
    await prisma.task.deleteMany({ where: { title: { startsWith: tag } } });
    await prisma.changeLog.deleteMany({ where: { actorName: { startsWith: tag } } });
    await prisma.apiKey.deleteMany({ where: { id: { in: made } } });
    await prisma.$disconnect();
  });

  it("keys look right and only a hash is stored", async () => {
    const k = keys.generateKey();
    expect(k.key).toMatch(/^fa_live_[0-9A-Za-z]{32}$/);
    expect(k.hash).toHaveLength(64);
    expect(k.hash).not.toContain(k.key.slice(8));
    expect(keys.validScopes(["volumes:read"])).toBe(true);
    expect(keys.validScopes(["payroll:read"])).toBe(false);
    expect(keys.validScopes([])).toBe(false);
  });

  it("401 without / with an unknown, revoked or expired key; 403 without the scope; 200 and counted with it", async () => {
    const { GET } = await import("@/app/api/v1/volumes/route");
    expect((await GET(req(null))).status).toBe(401);
    expect((await GET(req("fa_live_" + "x".repeat(32)))).status).toBe(401);
    expect((await GET(req(await mk(["volumes:read"], { revokedAt: new Date() })))).status).toBe(401);
    expect((await GET(req(await mk(["volumes:read"], { expiresAt: new Date(Date.now() - 1000) })))).status).toBe(401);
    expect((await GET(req(await mk(["kpi:read"])))).status).toBe(403);
    const good = await mk(["volumes:read"]);
    const r = await GET(req(good));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ month: "2026-09", clients: expect.any(Array) });
    expect((await GET(req(good, "http://x/api/v1/volumes?month=2026-13"))).status).toBe(400);
    const row = await prisma.apiKey.findFirstOrThrow({ where: { hash: keys.hashKey(good) } });
    expect(row.uses).toBe(2);
    expect(row.lastUsedAt).not.toBeNull();
  });

  it("POST /tasks creates one task per externalId and logs the key's name", async () => {
    const { POST } = await import("@/app/api/v1/tasks/route");
    const key = await mk(["tasks:write"]);
    const body = JSON.stringify({ title: `${tag} check rates`, due: "2026-11-01", by: "Paul", externalId: "c-1" });
    const a = await POST(req(key, "http://x/api/v1/tasks", { method: "POST", body }));
    expect(a.status).toBe(201);
    const b = await POST(req(key, "http://x/api/v1/tasks", { method: "POST", body }));
    expect((await b.json()).id).toBe((await a.clone().json()).id);
    expect(await prisma.task.count({ where: { title: `${tag} check rates` } })).toBe(1);
    const log = await prisma.changeLog.findFirstOrThrow({ where: { entity: "task", actorType: "API_KEY", actorName: { startsWith: tag } } });
    expect(log.actorName).toContain("(Paul)");
    expect((await POST(req(key, "http://x/api/v1/tasks", { method: "POST", body: "{}" }))).status).toBe(400);
  });
});
