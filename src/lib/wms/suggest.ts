import { prisma } from "@/lib/db";
import { KIND_FIELDS, type Mapping, type WmsKind } from "./import";

/**
 * Claude suggests which file column is which field (batch 6) — for exports with unusual headers (e.g. 3PLWMS).
 * Privacy: Claude sees only the column names and the *shape* of a few values (digits → 9, letters → A), never the
 * values themselves. The person still checks the mapping and the preview before anything is saved.
 */

export function shapeOf(v: string): string {
  return v
    .trim()
    .slice(0, 24)
    .replace(/[0-9]/g, "9")
    .replace(/[A-Za-z]/g, "A");
}

export function columnShapes(header: string[], rows: string[][]): Array<{ index: number; name: string; shapes: string[] }> {
  return header.map((name, index) => ({ index, name: name.slice(0, 80), shapes: [...new Set(rows.slice(0, 5).map((r) => shapeOf(r[index] ?? "")).filter(Boolean))].slice(0, 3) }));
}

/** Keeps only known fields and column numbers that exist; each column used once. */
export function cleanSuggestion(raw: unknown, kind: WmsKind, columns: number): Mapping {
  const out: Mapping = {};
  const used = new Set<number>();
  const m = raw && typeof raw === "object" ? ((raw as { mapping?: unknown }).mapping ?? raw) : {};
  for (const f of KIND_FIELDS[kind]) {
    const v = (m as Record<string, unknown>)[f.key];
    const i = typeof v === "number" && Number.isInteger(v) && v >= 0 && v < columns && !used.has(v) ? v : null;
    if (i !== null) used.add(i);
    out[f.key] = i;
  }
  return out;
}

export async function suggestMapping(kind: WmsKind, header: string[], rows: string[][]): Promise<Mapping> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Claude isn't connected (ANTHROPIC_API_KEY) — map the columns by hand.");
  const { callClaude } = await import("@/lib/ai/anthropic");
  const { HAIKU } = await import("@/lib/ai/models");
  const fields = KIND_FIELDS[kind].map((f) => ({ key: f.key, label: f.label, required: f.required }));
  const cols = columnShapes(header, rows);
  const r = await callClaude({
    model: HAIKU,
    maxTokens: 400,
    system:
      "You map columns of a warehouse (WMS) export file to fields. You get the column names and the shape of sample values (9 = a digit, A = a letter). Answer with the column index for each field, or null when no column fits. Never guess when unsure — use null.",
    messages: [{ role: "user", content: `File type: ${kind}\nFields: ${JSON.stringify(fields)}\nColumns: ${JSON.stringify(cols)}` }],
    tool: {
      name: "column_mapping",
      description: "The column index for each field key, or null.",
      input_schema: { type: "object", properties: { mapping: { type: "object", additionalProperties: { type: ["integer", "null"] } } }, required: ["mapping"] },
    },
  });
  await prisma.aiCallLog.create({ data: { job: "wms-column-suggest", model: HAIKU, inputTokens: r.inputTokens, outputTokens: r.outputTokens, ok: true, ref: kind } }).catch(() => {});
  return cleanSuggestion(r.toolInput, kind, header.length);
}
