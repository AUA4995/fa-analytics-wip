import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { parseCsv } from "@/lib/model/csv";
import { KIND_FIELDS, applyWmsImport, guessMapping, planWmsImport, type Mapping } from "@/lib/wms/import";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  action: z.enum(["plan", "apply", "suggest"]),
  source: z.enum(["THOMAX", "P3L", "LOGIWA"]),
  kind: z.enum(["CHARGES", "ORDERS"]),
  text: z.string().min(1).max(200_000_000),
  fileName: z.string().max(300).nullable().optional(),
  mapping: z.record(z.string(), z.number().int().min(0).nullable()).nullable().optional(),
  onOverlap: z.enum(["replace", "keep"]).optional(),
});

/**
 * WMS file import (Data sources → WMS). Step 1 "plan": header, column mapping (remembered or guessed) and a preview
 * of what would be saved. Step 2 "apply": the same file + mapping saved; overlap handled as the person chose.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !isAdminRole(me.role)) return Response.json({ error: "Only an admin can import WMS files." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request: " + parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  const b = parsed.data;
  const header = (parseCsv(b.text.split(/\r?\n/, 1)[0] ?? "")[0] ?? []).map((h) => h.trim());
  if (b.action === "suggest") {
    // Claude suggests a mapping from column names + value shapes only; the person still previews before saving
    try {
      const rows = parseCsv(b.text.split(/\r?\n/).slice(0, 6).join("\n")).slice(1);
      const { suggestMapping } = await import("@/lib/wms/suggest");
      return Response.json({ mapping: await suggestMapping(b.kind, header, rows) });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
    }
  }
  let mapping: Mapping | null = b.mapping ?? null;
  if (!mapping) {
    const saved = await prisma.setting.findUnique({ where: { key: `wmsMapping:${b.source}:${b.kind}` } });
    const s = saved?.value as Mapping | undefined;
    // A remembered mapping is used only if it still fits this file's columns
    mapping = s && Object.values(s).every((i) => i == null || i < header.length) ? s : guessMapping(b.kind, header);
  }
  try {
    const plan = await planWmsImport(b.source, b.kind, b.text, mapping);
    if (b.action === "plan") {
      return Response.json({
        header,
        mapping,
        fields: KIND_FIELDS[b.kind].map(({ key, label, required }) => ({ key, label, required })),
        plan: { ...plan, charges: undefined, orders: undefined, lines: plan.kind === "CHARGES" ? plan.charges.length : plan.orders.length, sample: (plan.kind === "CHARGES" ? plan.charges : plan.orders).slice(0, 8) },
      });
    }
    const r = await applyWmsImport(plan, { fileName: b.fileName ?? null, mapping, onOverlap: b.onOverlap ?? "keep", uploadedBy: me.name });
    void import("@/lib/jobs/after-sync").then((m) => m.afterSync(me.name)).catch(() => {});
    return Response.json({ ok: true, ...r });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
