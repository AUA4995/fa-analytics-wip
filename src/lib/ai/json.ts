import type { z } from "zod";

/** Pull the JSON object out of a model reply (tolerates ```json fences and prose around it). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = (fenced ? fenced[1] : text).trim();
  const start = src.search(/[[{]/);
  if (start < 0) throw new Error("No JSON in reply");
  const open = src[start];
  const close = open === "{" ? "}" : "]";
  const end = src.lastIndexOf(close);
  if (end <= start) throw new Error("Unterminated JSON in reply");
  return JSON.parse(src.slice(start, end + 1));
}

/** Strict parse: valid JSON that matches the schema, else throws with a short reason (used for the one retry). */
export function parseStrict<T>(text: string, schema: z.ZodType<T>): T {
  let data: unknown;
  try {
    data = extractJson(text);
  } catch (err) {
    throw new Error(`Not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`JSON does not match the schema — ${issues.join("; ")}`);
  }
  return r.data;
}

/** Digits of a number as they could appear in text: 1388.69 → ["1388.69", "1,388.69"]; 4 → ["4"]. */
function numberForms(n: number): string[] {
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const [int, dec] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const forms = new Set([fixed, String(n), dec ? `${grouped}.${dec}` : grouped]);
  if (dec === "00") forms.add(int).add(grouped);
  return [...forms];
}

/** True when the number appears in the source text (so the AI did not invent it). */
export function numberInText(n: number | null | undefined, text: string): boolean {
  if (n == null || !Number.isFinite(n)) return false;
  const t = text.replace(/\s+/g, " ");
  const zeros = Number.isInteger(n) ? "(?:\\.0+)?" : "";
  return numberForms(Math.abs(n)).some((f) => new RegExp(`(^|[^\\d.,])${f.replace(/[.,]/g, (c) => `\\${c}`)}${zeros}(?![\\d]|[.,]\\d)`).test(t));
}

/** Keep a number only if it is grounded in the source text; otherwise null ("never invent numbers"). */
export function groundedNumber(n: number | null | undefined, text: string): number | null {
  return numberInText(n, text) ? (n as number) : null;
}

/** Every number written in a sentence (e.g. "$4,312.55", "12 days", "80%"). */
export function numbersIn(sentence: string): number[] {
  return (sentence.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((s) => Number(s.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}
