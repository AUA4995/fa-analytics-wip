/** What Claude may see of a WMS file (batch 6): no imports, so the upload form can show it before anything is sent. */

/** Any letter in any alphabet → A, any digit → 9, other symbols except simple punctuation → ? */
export function shapeOf(v: string): string {
  return [...v.trim()]
    .slice(0, 24)
    .join("")
    .replace(/\p{N}/gu, "9")
    .replace(/\p{L}\p{M}*/gu, "A")
    .replace(/[^A9 \-_/.:,@#()+&]/gu, "?");
}

/**
 * A column name is sent only if it looks like a column name: plain Latin words, at most 40 characters, at most one
 * short number (e.g. "Address 2"), no "@". Anything else — a file whose first line is data, a name, an address —
 * is sent as its shape only.
 */
export function looksLikeHeader(name: string): boolean {
  const n = name.trim();
  if (!n || n.length > 40 || n.includes("@")) return false;
  if (!/^[A-Za-z][A-Za-z0-9 _\-/.()#&%]*$/.test(n)) return false;
  const digits = n.match(/\d+/g) ?? [];
  return digits.length <= 1 && digits.every((d) => d.length <= 2);
}

export function columnShapes(header: string[], rows: string[][]): Array<{ index: number; name: string; shapes: string[] }> {
  return header.map((name, index) => ({
    index,
    name: looksLikeHeader(name) ? name.trim() : `(hidden: ${shapeOf(name)})`,
    shapes: [...new Set(rows.slice(0, 5).map((r) => shapeOf(r[index] ?? "")).filter(Boolean))].slice(0, 3),
  }));
}
