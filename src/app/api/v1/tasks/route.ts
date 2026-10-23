import { NextResponse } from "next/server";
import { z } from "zod";
import { authorise, isResponse } from "@/lib/apikeys";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/model/store";
import { createTask } from "@/lib/tasks";

export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().trim().min(3).max(200),
  detail: z.string().max(2000).optional(),
  owner: z.string().max(80).optional(),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  link: z.string().url().optional(),
  clientId: z.string().optional(),
  /** The person in the other app who triggered it (shown in Logs) */
  by: z.string().max(80).optional(),
  /** Your own id, so sending the same thing twice doesn't make two tasks */
  externalId: z.string().max(120).optional(),
});

/** POST /api/v1/tasks — another app adds a follow-up task. Scope tasks:write. Logged with the key's name. */
export async function POST(req: Request) {
  const who = await authorise(req, "tasks:write");
  if (isResponse(who)) return who;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0].message, field: p.error.issues[0].path.join(".") }, { status: 400 });
  const b = p.data;
  if (b.clientId && !(await prisma.client.findUnique({ where: { id: b.clientId } }))) return NextResponse.json({ error: "Unknown clientId", field: "clientId" }, { status: 400 });
  const t = await createTask({ title: b.title, detail: b.detail, owner: b.owner, due: b.due ? new Date(b.due + "T00:00:00Z") : undefined, link: b.link, clientId: b.clientId, where: who.name, source: b.externalId ? `api:${who.id}:${b.externalId}` : undefined });
  await logChange({ entity: "task", entityId: t.id, field: "_created", oldValue: null, newValue: b.title, actor: { type: "API_KEY", name: b.by ? `${who.name} (${b.by})` : who.name } });
  return NextResponse.json({ id: t.id, status: t.status }, { status: 201 });
}
