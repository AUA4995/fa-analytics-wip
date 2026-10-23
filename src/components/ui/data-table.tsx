"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { isInteractiveTarget } from "./clickable-row";
import { FilterChips, useChips } from "./filter-chips";
import type { ChipRow } from "./chip-filter";
import { withPanel } from "./panel";
import { nextSort, sortRows, type SortState, type TableRowData } from "./table-state";

export interface DataColumn {
  key: string;
  label: ReactNode;
  sortable?: boolean;
  align?: "left" | "right";
  /** Fixed width (CSS), so several tables line up */
  width?: string;
  className?: string;
}

export interface DataRow extends TableRowData {
  /** Pre-rendered cells by column key (server components can render these) */
  cells: Record<string, ReactNode>;
  /** `kind:id` — clicking the row opens the details panel */
  panel?: string;
  className?: string;
}

/** A chip row (Batch 2 item 25): key into DataRow.filter, label, optional fixed chips in order. */
export type DataFilter = ChipRow;

/**
 * Sortable / filterable table (Payables, Receivables, Front inbox, Settings …).
 * Click a sortable header to sort, again to reverse. Filters are chip rows with counts (multi-select in a row, rows
 * combine, Clear all) kept in the URL (`f.<key>`, or `f.<filterScope>.<key>`), so they survive the panel opening and closing.
 */
export function DataTable({
  columns,
  rows,
  filters = [],
  defaultSort = null,
  empty = "Nothing here.",
  minWidth,
  fixed = false,
  hint,
  filterScope,
  hideByDefault,
}: {
  columns: DataColumn[];
  rows: DataRow[];
  filters?: DataFilter[];
  defaultSort?: SortState | null;
  empty?: ReactNode;
  minWidth?: number;
  fixed?: boolean;
  hint?: ReactNode;
  /** URL namespace when a page has two filtered tables with the same keys */
  filterScope?: string;
  /**
   * Rows hidden until a chip in that row is picked (b2-set: Inactive clients are hidden by default). Chip counts still
   * include them; `hint` says how many are hidden ("{n}" is replaced by the number; plain text — this prop crosses from
   * server components).
   */
  hideByDefault?: { key: string; values: string[]; hint?: string };
}) {
  const [sort, setSort] = useState<SortState | null>(defaultSort);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const chips = useChips(rows, filters, filterScope);
  const visible = useMemo(() => {
    if (!hideByDefault || chips.selection[hideByDefault.key]?.length) return chips.shown;
    const hide = (r: DataRow) => {
      const v = r.filter?.[hideByDefault.key];
      return (Array.isArray(v) ? v : v == null ? [] : [v]).some((x) => hideByDefault.values.includes(x));
    };
    return chips.shown.filter((r) => !hide(r));
  }, [chips.shown, chips.selection, hideByDefault]);
  const hiddenCount = chips.shown.length - visible.length;
  const shown = useMemo(() => sortRows(visible, sort), [visible, sort]);
  const fullHint = hiddenCount > 0 && hideByDefault?.hint ? (
    <>
      {hideByDefault.hint.replace("{n}", String(hiddenCount))}
      {hint ? <> · {hint}</> : null}
    </>
  ) : (
    hint
  );
  const tableStyle: CSSProperties = { ...(fixed ? { tableLayout: "fixed" } : {}), ...(minWidth ? { minWidth } : {}) };

  return (
    <div>
      {(filters.length > 0 || fullHint) && <FilterChips groups={chips.groups} scope={filterScope} hint={fullHint} total={{ shown: visible.length, of: rows.length }} />}
      <div className="tw">
        <table style={tableStyle}>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={[c.align === "right" ? "r" : "", c.className ?? ""].join(" ").trim() || undefined}
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}
                  >
                    {c.sortable ? (
                      <button type="button" className="sort" onClick={() => setSort(nextSort(sort, c.key))}>
                        {c.label}
                        <span aria-hidden>{active ? (sort!.dir === 1 ? "▲" : "▼") : "↕"}</span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="empty">
                  {empty}
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const open = r.panel ? () => router.push(withPanel(pathname, sp, r.panel!), { scroll: false }) : undefined;
              return (
                <tr
                  key={r.id}
                  data-panel={r.panel || undefined}
                  className={[open ? "clickable" : "", r.className ?? ""].join(" ").trim() || undefined}
                  tabIndex={open ? 0 : undefined}
                  onClick={open ? (e) => !isInteractiveTarget(e.target) && open() : undefined}
                  onKeyDown={open ? (e) => e.key === "Enter" && !isInteractiveTarget(e.target) && open() : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={[c.align === "right" ? "r num" : "", c.className ?? ""].join(" ").trim() || undefined}>
                      {r.cells[c.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
