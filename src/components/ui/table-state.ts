/** Pure sort / filter logic behind <DataTable> (column-header sort, multi-select filter chips). */

export type SortDir = 1 | -1;
export interface SortState {
  key: string;
  dir: SortDir;
}
/** Selected values per filter key; an empty/missing set = no filter on that key. */
export type FilterState = Record<string, string[]>;

export interface TableRowData {
  id: string;
  sort?: Record<string, string | number | null | undefined>;
  filter?: Record<string, string | string[] | null | undefined>;
}

/** Click a header: same column reverses, a new column sorts ascending. */
export function nextSort(cur: SortState | null, key: string): SortState {
  return cur && cur.key === key ? { key, dir: (cur.dir * -1) as SortDir } : { key, dir: 1 };
}

const asList = (v: string | string[] | null | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function filterRows<T extends TableRowData>(rows: T[], filters: FilterState): T[] {
  const active = Object.entries(filters).filter(([, vals]) => vals.length);
  if (!active.length) return rows;
  return rows.filter((r) => active.every(([k, vals]) => asList(r.filter?.[k]).some((v) => vals.includes(v))));
}

/** Stable sort; empty values always last; numbers numerically, text with en-AU collation. */
export function sortRows<T extends TableRowData>(rows: T[], sort: SortState | null): T[] {
  if (!sort) return rows;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const x = a.r.sort?.[sort.key];
      const y = b.r.sort?.[sort.key];
      const xe = x == null || x === "";
      const ye = y == null || y === "";
      if (xe || ye) return xe && ye ? a.i - b.i : xe ? 1 : -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en-AU", { numeric: true, sensitivity: "base" });
      return c !== 0 ? c * sort.dir : a.i - b.i;
    })
    .map(({ r }) => r);
}

/** Options for a filter dropdown: each distinct value with its row count, sorted by label. */
export function filterOptions(rows: TableRowData[], key: string): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of rows) for (const v of new Set(asList(r.filter?.[key]))) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value, "en-AU"));
}

export function toggleFilter(f: FilterState, key: string, value: string): FilterState {
  const cur = f[key] ?? [];
  return { ...f, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
}
