"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";
import { calcSaving, isInitiative, proposeBlocks, proposeSteps, suggestPeople, type CalcBlock } from "@/lib/improve/calc";
import { prefill } from "@/lib/improve/data";
import { logChange } from "@/lib/model/store";
import { createTask } from "@/lib/tasks";

export type ImpState = { ok: boolean; message: string; id?: string };
const actor = (u: { name: string }) => ({ type: "USER" as const, name: u.name });
const day = (s: string | null | undefined) => (s ? new Date(s + "T00:00:00Z") : null);
const addWeeks = (d: Date, w: number) => new Date(d.getTime() + w * 7 * 86400000);
const done = () => revalidatePath("/improve");
const wrap = async (fn: () => Promise<ImpState>): Promise<ImpState> => {
  try {
    return await fn();
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
};

const NewIdea = z.object({
  name: z.string().trim().min(3, "Give it a name"),
  description: z.string().trim().max(2000).optional(),
  category: z.string().min(1, "Pick a category"),
  sub: z.string().optional(),
  detail: z.string().optional(),
  changes: z.array(z.string()).min(1, "Pick at least one thing that changes"),
  reviewer: z.string().optional(),
  reviewDue: z.string().optional(),
  horizon: z.enum(["SHORT", "LONG"]),
  site: z.string().optional(),
  supplierContactId: z.string().optional(),
  itemText: z.string().optional(),
  savingType: z.enum(["HARD", "AVOIDANCE", "SOFT"]),
});

/** Guided "+ New idea": saved with the proposed calculation, prefilled from the app's own figures. */
export async function createIdeaAction(_p: ImpState | null, fd: FormData): Promise<ImpState> {
  return wrap(async () => {
    const me = await assertUser();
    const raw = Object.fromEntries([...fd.keys()].map((k) => [k, k === "changes" ? fd.getAll(k).map(String) : String(fd.get(k) ?? "")]));
    const v = NewIdea.safeParse(raw);
    if (!v.success) return { ok: false, message: v.error.issues[0].message };
    const d = v.data;
    const pf = await prefill({ supplierContactId: d.supplierContactId || null, itemText: d.itemText || null, site: d.site || null });
    const blocks = proposeBlocks(d.changes, pf);
    const r = calcSaving(blocks);
    const imp = await prisma.improvement.create({
      data: {
        name: d.name,
        description: d.description || null,
        category: d.category,
        sub: d.sub || null,
        detail: d.detail || null,
        changes: d.changes,
        reviewer: d.reviewer || null,
        reviewDue: day(d.reviewDue),
        horizon: d.horizon,
        savingType: d.savingType,
        calc: blocks as never,
        estMonthly: r.monthly,
        investment: r.investment || null,
        mapping: { site: d.site || null, supplierContactId: d.supplierContactId || null, itemText: d.itemText || null, prefillBasis: pf.basis } as never,
        createdBy: me.name,
      },
    });
    await logChange({ entity: "improve", entityId: imp.id, field: "_created", oldValue: null, newValue: { name: d.name, category: d.category, sub: d.sub }, actor: actor(me) });
    done();
    return { ok: true, message: "Idea saved — complete the calculation in its panel.", id: imp.id };
  });
}

const FIELDS = ["name", "description", "reviewer", "reviewDue", "horizon", "priority", "owner", "startDate", "dueDate", "savingType", "participants", "measuredMonthly", "monthsConfirmed", "category", "sub", "detail"] as const;
type Field = (typeof FIELDS)[number];

export async function updateImprovementAction(id: string, field: Field, value: string | string[] | null): Promise<ImpState> {
  return wrap(async () => {
    const me = await assertUser();
    if (!FIELDS.includes(field)) return { ok: false, message: "Unknown field" };
    const cur = await prisma.improvement.findUniqueOrThrow({ where: { id } });
    let v: unknown = value === "" ? null : value;
    if (["reviewDue", "startDate", "dueDate"].includes(field)) v = day(value as string);
    if (["priority", "monthsConfirmed"].includes(field)) v = value === "" || value == null ? (field === "monthsConfirmed" ? 0 : null) : Number(value);
    if (field === "measuredMonthly") v = value === "" || value == null ? null : Number(String(value).replace(/[$,]/g, ""));
    if ((typeof v === "number" && !Number.isFinite(v)) || (field === "name" && !v)) return { ok: false, message: "That value doesn't look right" };
    await prisma.improvement.update({ where: { id }, data: { [field]: v } });
    await logChange({ entity: "improve", entityId: id, field, oldValue: cur[field as keyof typeof cur] ?? null, newValue: v, actor: actor(me) });
    done();
    return { ok: true, message: "Saved" };
  });
}

export async function saveCalcAction(id: string, blocks: CalcBlock[]): Promise<ImpState> {
  return wrap(async () => {
    const me = await assertUser();
    const cur = await prisma.improvement.findUniqueOrThrow({ where: { id } });
    const r = calcSaving(blocks);
    await prisma.improvement.update({ where: { id }, data: { calc: blocks as never, estMonthly: r.monthly, investment: r.investment || null } });
    await logChange({ entity: "improve", entityId: id, field: "calc", oldValue: cur.estMonthly != null ? Number(cur.estMonthly) : null, newValue: r.monthly, actor: actor(me), reason: r.lines.map((l) => `${l.title}: ${l.working}`).join(" · ") });
    done();
    return { ok: true, message: r.monthly == null ? "Saved — inputs still missing" : "Saved and recalculated" };
  });
}

export async function addBlockAction(id: string, kind: CalcBlock["kind"]): Promise<ImpState> {
  return wrap(async () => {
    await assertUser();
    const cur = await prisma.improvement.findUniqueOrThrow({ where: { id } });
    const m = (cur.mapping ?? {}) as { site?: string; supplierContactId?: string; itemText?: string };
    const pf = await prefill({ site: m.site, supplierContactId: m.supplierContactId, itemText: m.itemText });
    const map: Record<string, string> = { minutes: "process", price: "supplier", materials: "materials", space: "space", investment: "equipment" };
    const add = proposeBlocks([map[kind]], pf).filter((b) => b.kind === kind);
    await prisma.improvement.update({ where: { id }, data: { calc: [...((cur.calc as unknown as CalcBlock[]) ?? []), ...add] as never } });
    done();
    return { ok: true, message: "Added" };
  });
}

/** Move along: Approve opens the project (standard steps + suggested people); Verify needs measured months. */
export async function setStageAction(id: string, stage: string): Promise<ImpState> {
  return wrap(async () => {
    const me = await assertUser();
    const cur = await prisma.improvement.findUniqueOrThrow({ where: { id }, include: { steps: true } });
    if (stage === "VERIFIED" && (cur.measuredMonthly == null || cur.monthsConfirmed < 1)) return { ok: false, message: "Enter the measured saving and how many months of real data confirm it (1–3) first." };
    const data: Record<string, unknown> = { stage };
    if (stage === "APPROVED" && !isInitiative(cur.stage)) {
      const max = await prisma.improvement.aggregate({ where: { stage: { in: ["APPROVED", "IN_PROGRESS"] } }, _max: { priority: true } });
      data.priority = (max._max.priority ?? 0) + 1;
      const start = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
      data.startDate = cur.startDate ?? start;
      if (!cur.steps.length) {
        const steps = proposeSteps(cur.category, cur.sub);
        data.dueDate = addWeeks(start, steps.at(-1)!.weeks[1]);
        await prisma.improveStep.createMany({ data: steps.map((s, i) => ({ improvementId: id, name: s.name, start: addWeeks(start, s.weeks[0]), due: addWeeks(start, s.weeks[1]), kind: s.kind ?? null, sortOrder: i, owner: cur.owner ?? me.name })) });
      }
      if (!cur.participants.length) {
        const staff = await prisma.staff.findMany({ where: { endDate: null }, select: { name: true, position: true, site: true, pool: true } });
        data.participants = suggestPeople(staff, cur.category, cur.sub, cur.detail);
      }
      data.owner = cur.owner ?? me.name;
    }
    if (stage === "VERIFIED") data.verifiedAt = new Date();
    await prisma.improvement.update({ where: { id }, data });
    await logChange({ entity: "improve", entityId: id, field: "stage", oldValue: cur.stage, newValue: stage, actor: actor(me) });
    if (stage === "APPROVED") await syncStepTasks(id);
    done();
    return { ok: true, message: stage === "APPROVED" ? "Approved — moved to Initiatives with a proposed plan." : "Saved" };
  });
}

/** Steps owned by someone with a login become Tasks (one each); done steps close their task. */
async function syncStepTasks(improvementId: string) {
  const imp = await prisma.improvement.findUniqueOrThrow({ where: { id: improvementId }, include: { steps: true } });
  if (!isInitiative(imp.stage)) return;
  const users = new Set((await prisma.user.findMany({ where: { active: true }, select: { name: true } })).map((u) => u.name));
  for (const s of imp.steps) {
    const source = `improve-step:${s.id}`;
    if (s.status === "DONE") {
      await prisma.task.updateMany({ where: { source, status: { not: "DONE" } }, data: { status: "DONE", doneAt: new Date(), doneBy: s.owner ?? "Analytics", lastCheck: "Step marked done on the project" } });
      continue;
    }
    if (!s.owner || !users.has(s.owner)) continue;
    const open = await prisma.task.findFirst({ where: { source, status: { not: "DONE" } } });
    if (open) await prisma.task.update({ where: { id: open.id }, data: { owner: s.owner, due: s.due, title: `${s.name} · ${imp.name}` } });
    else await createTask({ title: `${s.name} · ${imp.name}`, detail: "Project step (Improvements & savings)", where: "Analytics", link: `/improve?section=initiatives&panel=imp:${imp.id}`, owner: s.owner, due: s.due ?? undefined, source });
  }
}

const StepPatch = z.object({ name: z.string().trim().min(1).optional(), start: z.string().nullable().optional(), due: z.string().nullable().optional(), owner: z.string().nullable().optional(), status: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE"]).optional() });
export async function updateStepAction(stepId: string, patch: z.infer<typeof StepPatch>): Promise<ImpState> {
  return wrap(async () => {
    const me = await assertUser();
    const p = StepPatch.parse(patch);
    const cur = await prisma.improveStep.findUniqueOrThrow({ where: { id: stepId }, include: { improvement: true } });
    const data = { ...(p.name ? { name: p.name } : {}), ...(p.start !== undefined ? { start: day(p.start) } : {}), ...(p.due !== undefined ? { due: day(p.due) } : {}), ...(p.owner !== undefined ? { owner: p.owner || null } : {}), ...(p.status ? { status: p.status } : {}) };
    await prisma.improveStep.update({ where: { id: stepId }, data });
    for (const [k, v] of Object.entries(data)) await logChange({ entity: "improve", entityId: cur.improvementId, field: `step:${cur.name}:${k}`, oldValue: (cur as Record<string, unknown>)[k] ?? null, newValue: v, actor: actor(me) });
    let message = "Saved";
    if (p.status && cur.improvement.stage === "APPROVED" && p.status !== "NOT_STARTED") await prisma.improvement.update({ where: { id: cur.improvementId }, data: { stage: "IN_PROGRESS" } });
    if (p.status === "DONE" && cur.kind === "measure_after") {
      message = "Measured — enter the measured saving per month on the project; it's recalculated and can be verified after 1–3 months of data.";
      await createTask({ title: `Enter the measured saving · ${cur.improvement.name}`, detail: "Measure after: baseline vs after from Base cost / Xero", where: "Analytics", link: `/improve?section=initiatives&panel=imp:${cur.improvementId}`, owner: cur.improvement.owner ?? undefined, source: `improve-measure:${cur.improvementId}` });
    }
    await syncStepTasks(cur.improvementId);
    done();
    return { ok: true, message };
  });
}

export async function addStepAction(improvementId: string, name: string): Promise<ImpState> {
  return wrap(async () => {
    const me = await assertUser();
    if (!name.trim()) return { ok: false, message: "Name the step" };
    const n = await prisma.improveStep.count({ where: { improvementId } });
    await prisma.improveStep.create({ data: { improvementId, name: name.trim(), sortOrder: n, owner: me.name } });
    await logChange({ entity: "improve", entityId: improvementId, field: "step:add", oldValue: null, newValue: name.trim(), actor: actor(me) });
    await syncStepTasks(improvementId);
    done();
    return { ok: true, message: "Added" };
  });
}

export async function deleteStepAction(stepId: string): Promise<ImpState> {
  return wrap(async () => {
    const me = await assertUser();
    const s = await prisma.improveStep.delete({ where: { id: stepId } });
    await prisma.task.updateMany({ where: { source: `improve-step:${stepId}`, status: { not: "DONE" } }, data: { status: "DONE", doneAt: new Date(), doneBy: me.name, lastCheck: "Step removed from the project" } });
    await logChange({ entity: "improve", entityId: s.improvementId, field: "step:remove", oldValue: s.name, newValue: null, actor: actor(me) });
    done();
    return { ok: true, message: "Removed" };
  });
}

export async function moveStepAction(stepId: string, dir: -1 | 1): Promise<ImpState> {
  return wrap(async () => {
    await assertUser();
    const s = await prisma.improveStep.findUniqueOrThrow({ where: { id: stepId } });
    const all = await prisma.improveStep.findMany({ where: { improvementId: s.improvementId }, orderBy: { sortOrder: "asc" } });
    const i = all.findIndex((x) => x.id === stepId);
    const j = i + dir;
    if (j < 0 || j >= all.length) return { ok: true, message: "" };
    [all[i], all[j]] = [all[j], all[i]];
    await prisma.$transaction(all.map((x, k) => prisma.improveStep.update({ where: { id: x.id }, data: { sortOrder: k } })));
    done();
    return { ok: true, message: "" };
  });
}

export async function addCommentAction(improvementId: string, text: string): Promise<ImpState> {
  return wrap(async () => {
    const me = await assertUser();
    if (!text.trim()) return { ok: false, message: "Write something" };
    await prisma.improveComment.create({ data: { improvementId, by: me.name, text: text.trim().slice(0, 2000) } });
    done();
    return { ok: true, message: "Added" };
  });
}

export async function addCategoryAction(name: string, subs: string): Promise<ImpState> {
  return wrap(async () => {
    const me = await assertUser();
    const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!key) return { ok: false, message: "Name the category" };
    const n = await prisma.improveCategory.count();
    await prisma.improveCategory.upsert({ where: { key }, create: { key, name: name.trim(), subs: subs.split(",").map((s) => s.trim()).filter(Boolean).concat("General"), sortOrder: n }, update: {} });
    await logChange({ entity: "improve-category", entityId: key, field: "_created", oldValue: null, newValue: name.trim(), actor: actor(me) });
    done();
    return { ok: true, message: "Category added" };
  });
}
