/** Settings values, logs, allocation and CSV import against the test database (runs when DATABASE_URL is set). */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;
const actor = { type: "USER" as const, name: "Test Person" };

describe.skipIf(!hasDb)("cost model settings (integration)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let store: typeof import("./store");
  let csv: typeof import("./csv");
  const tag = `t${Date.now()}`;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    store = await import("./store");
    csv = await import("./csv");
    const { ensureModelDefaults } = await import("./defaults");
    await ensureModelDefaults(prisma);
  });
  afterAll(async () => {
    await prisma.changeLog.deleteMany({ where: { actorName: actor.name } });
    await prisma.service.deleteMany({ where: { code: { startsWith: tag.toUpperCase() } } });
    await prisma.client.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.setting.deleteMany({ where: { key: "rule:marginFloor" } });
    await prisma.site.update({ where: { key: "smi" }, data: { labourUtil: 0.85 } });
    await prisma.$disconnect();
  });

  it("edits a site value, logs old → new with the reason, and skips no-op edits", async () => {
    const r = await store.updateValue("site", "smi", "labourUtil", "80", actor, "Measured from WMS in October");
    expect(r).toMatchObject({ ok: true, changed: true, value: 0.8 });
    expect(Number((await prisma.site.findUniqueOrThrow({ where: { key: "smi" } })).labourUtil)).toBe(0.8);
    const again = await store.updateValue("site", "smi", "labourUtil", "80%", actor);
    expect(again).toMatchObject({ ok: true, changed: false });
    const logs = await store.getLogs("site", "smi", "labourUtil");
    expect(logs[0]).toMatchObject({ oldValue: 0.85, newValue: 0.8, reason: "Measured from WMS in October", actorName: actor.name, actorType: "USER" });
    expect(logs.filter((l) => l.actorName === actor.name)).toHaveLength(1);
  });

  it("rules fall back to defaults and store edits as settings", async () => {
    expect(await store.getRule("marginFloor")).toBe(0.15);
    await store.updateValue("rule", "rule", "marginFloor", "18", actor);
    expect(await store.getRule("marginFloor")).toBe(0.18);
    expect((await store.getRules()).b2bUnits).toBe(20);
    expect(await store.updateValue("rule", "rule", "marginFloor", "abc", actor)).toMatchObject({ ok: false });
    expect(await store.updateValue("rule", "rule", "nope", "1", actor)).toMatchObject({ ok: false });
  });

  it("CSV import: preview lists creates and updates; apply writes them and logs each", async () => {
    const code = `${tag.toUpperCase()}-PICK`;
    const text = `code,name,unit,minutes,basis,billable\n${code},Pick per unit,unit,0.25,ESTIMATE,yes\n${code}-B,Bad,unit,abc,ESTIMATE,yes`;
    const bad = await csv.planImport("service", csv.parseCsv(text));
    expect(bad.errors).toHaveLength(1);
    const ok = await csv.planImport("service", csv.parseCsv(text.split("\n").slice(0, 2).join("\n")));
    expect(ok.creates).toHaveLength(1);
    await csv.applyImport("service", ok, actor);
    expect(Number((await prisma.service.findUniqueOrThrow({ where: { code } })).minutes)).toBe(0.25);
    const upd = await csv.planImport("service", csv.parseCsv(`code,minutes,basis\n${code},0.3,TIME_STUDY`));
    expect(upd.updates.map((u) => u.field).sort()).toEqual(["minutes", "minutesBasis"]);
    await csv.applyImport("service", upd, actor);
    const logs = await store.getLogs("service", code);
    expect(logs.map((l) => l.field).sort()).toEqual(["_created", "minutes", "minutesBasis"]);
    expect(logs.every((l) => l.reason === "CSV import")).toBe(true);
  });

  it("client CSV matches by name when there is no Xero ID", async () => {
    const name = `${tag} Organics`;
    const p1 = await csv.planImport("client", csv.parseCsv(`name,sites,weekly minimum\n${name},"smi, par",300`));
    await csv.applyImport("client", p1, actor);
    const p2 = await csv.planImport("client", csv.parseCsv(`name,weekly minimum\n${name},350`));
    expect(p2.creates).toHaveLength(0);
    expect(p2.updates).toMatchObject([{ field: "weeklyMinimum", value: 350 }]);
  });
});
