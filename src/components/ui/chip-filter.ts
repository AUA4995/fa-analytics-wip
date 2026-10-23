import type { TableRowData } from "./table-state";

/**
 * Filter chips (Batch 2 item 25) — pure logic shared by <FilterChips>, <DataTable>, the Tasks board and server-filtered
 * screens (Front inbox). Rows of chips; several chips in one row = OR; rows combine with AND. Each chip's count is
 * how many items it would show given the selections in the OTHER rows. State lives in the URL (`f.<key>=value`,
 * repeated for several values; `f.<scope>.<key>` when a page has more than one filtered table) so it survives the
 * details panel opening and closing.
 */

export interface ChipRow {
  /** Matches TableRowData.filter[key] */
  key: string;
  label: string;
  /** Fixed chips in this order (shown even with 0); others found in the data are added after. Omit to list what's in the data. */
  options?: ReadonlyArray<{ value: string; label?: string }>;
  /** Order for chips found in the data: by label (default) or by count (most first) */
  order?: "label" | "count";
}

export type ChipSelection = Record<string, string[]>;

export interface ChipOption {
  value: string;
  label: string;
  count: number;
  selected: boolean;
}

export interface ChipGroup {
  key: string;
  label: string;
  options: ChipOption[];
}

export const chipParam = (key: string, scope?: string) => (scope ? `f.${scope}.${key}` : `f.${key}`);

type Search = URLSearchParams | Record<string, string | string[] | undefined>;

function getAll(sp: Search, name: string): string[] {
  if (sp instanceof URLSearchParams) return sp.getAll(name);
  const v = sp[name];
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

/** Selected values per row from the URL. */
export function readChips(sp: Search, rows: ReadonlyArray<Pick<ChipRow, "key">>, scope?: string): ChipSelection {
  const out: ChipSelection = {};
  for (const r of rows) {
    const vals = [...new Set(getAll(sp, chipParam(r.key, scope)).filter(Boolean))];
    if (vals.length) out[r.key] = vals;
  }
  return out;
}

const asList = (v: string | string[] | null | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Does one item pass every row's selection (optionally ignoring one row)? */
export function matchesChips(row: Pick<TableRowData, "filter">, sel: ChipSelection, skipKey?: string): boolean {
  for (const [k, vals] of Object.entries(sel)) {
    if (k === skipKey || !vals.length) continue;
    const have = asList(row.filter?.[k]);
    if (!have.some((v) => vals.includes(v))) return false;
  }
  return true;
}

export function applyChips<T extends Pick<TableRowData, "filter">>(rows: T[], sel: ChipSelection): T[] {
  if (!Object.values(sel).some((v) => v.length)) return rows;
  return rows.filter((r) => matchesChips(r, sel));
}

/** Chip rows with counts for the current selection in the other rows. */
export function chipCounts(data: ReadonlyArray<Pick<TableRowData, "filter">>, rows: ReadonlyArray<ChipRow>, sel: ChipSelection): ChipGroup[] {
  return rows.map((r) => {
    const counts = new Map<string, number>();
    for (const d of data) {
      if (!matchesChips(d, sel, r.key)) continue;
      for (const v of new Set(asList(d.filter?.[r.key]))) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const picked = sel[r.key] ?? [];
    const fixed = (r.options ?? []).map((o) => o.value);
    const found = [...counts.keys()].filter((v) => !fixed.includes(v));
    found.sort((a, b) => (r.order === "count" ? (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b, "en-AU") : a.localeCompare(b, "en-AU", { numeric: true })));
    const extra = picked.filter((v) => !fixed.includes(v) && !counts.has(v));
    const label = new Map((r.options ?? []).map((o) => [o.value, o.label ?? o.value]));
    return {
      key: r.key,
      label: r.label,
      options: [...fixed, ...found, ...extra].map((value) => ({ value, label: label.get(value) ?? value, count: counts.get(value) ?? 0, selected: picked.includes(value) })),
    };
  });
}

/** URL with one chip switched on/off (keeps every other param, e.g. section and panel). */
export function toggleChipSearch(search: string | URLSearchParams, key: string, value: string, scope?: string): string {
  const sp = new URLSearchParams(typeof search === "string" ? search : search.toString());
  const name = chipParam(key, scope);
  const cur = sp.getAll(name);
  sp.delete(name);
  for (const v of cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]) sp.append(name, v);
  sp.delete("page");
  return sp.toString();
}

/** URL with every chip of these rows off. */
export function clearChipsSearch(search: string | URLSearchParams, keys: string[], scope?: string): string {
  const sp = new URLSearchParams(typeof search === "string" ? search : search.toString());
  for (const k of keys) sp.delete(chipParam(k, scope));
  sp.delete("page");
  return sp.toString();
}

export const anyChips = (sel: ChipSelection) => Object.values(sel).some((v) => v.length > 0);
