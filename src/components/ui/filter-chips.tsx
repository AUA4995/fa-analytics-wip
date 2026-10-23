"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition, type ReactNode } from "react";
import { type ChipGroup, type ChipRow, type ChipSelection, anyChips, chipCounts, clearChipsSearch, readChips, toggleChipSearch } from "./chip-filter";
import type { TableRowData } from "./table-state";

/**
 * Filter chips (Batch 2 item 25): one row of chips per filter, each chip with its count; several chips in a row = any of
 * them, rows combine; "Clear all". The selection is in the URL, so it stays when a details panel opens or closes.
 *
 *   mode "client" (default): the list is filtered in the browser — the URL is updated with history.replaceState
 *                            (no server round trip; Next keeps useSearchParams in sync)
 *   mode "server":           the page filters on the server from the same URL params (big lists, e.g. Front inbox)
 *
 * Client lists: const sel = useChipSelection(rows, scope); const shown = applyChips(data, sel);
 *               <FilterChips groups={chipCounts(data, rows, sel)} scope={scope} />
 * Server lists: readChips(searchParams, rows) + chipCounts(...) on the server, then <FilterChips groups mode="server" />.
 */

export function useChipSelection(rows: ReadonlyArray<Pick<ChipRow, "key">>, scope?: string): ChipSelection {
  const sp = useSearchParams();
  const keyList = rows.map((r) => r.key).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readChips(sp, rows, scope), [sp, keyList, scope]);
}

export function FilterChips({ groups, scope, mode = "client", hint, total }: { groups: ChipGroup[]; scope?: string; mode?: "client" | "server"; hint?: ReactNode; total?: { shown: number; of: number } }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const sel: ChipSelection = Object.fromEntries(groups.map((g) => [g.key, g.options.filter((o) => o.selected).map((o) => o.value)]));
  const go = (search: string) => {
    const url = search ? `${pathname}?${search}` : pathname;
    if (mode === "server") start(() => router.replace(url, { scroll: false }));
    else window.history.replaceState(null, "", url);
  };
  const visible = groups.filter((g) => g.options.length > 0);
  if (!visible.length && !hint) return null;
  return (
    <div className="chiprows" data-pending={pending || undefined} aria-busy={pending || undefined}>
      {visible.map((g) => (
        <div className="chiprow" role="group" aria-label={g.label} key={g.key}>
          <span className="chiprow-l">{g.label}</span>
          {g.options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={"fchip" + (o.count === 0 ? " zero" : "")}
              aria-pressed={o.selected}
              onClick={() => go(toggleChipSearch(sp, g.key, o.value, scope))}
            >
              {o.label}
              <span className="n">{o.count}</span>
            </button>
          ))}
        </div>
      ))}
      {(anyChips(sel) || hint || total) && (
        <div className="chiprows-foot">
          {anyChips(sel) && (
            <button type="button" className="lnk" onClick={() => go(clearChipsSearch(sp, groups.map((g) => g.key), scope))}>
              Clear all
            </button>
          )}
          {total && anyChips(sel) && (
            <span className="meta">
              {total.shown} of {total.of}
            </span>
          )}
          {hint && (
            <span className="meta" style={{ marginLeft: "auto" }}>
              {hint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Client-side chips over a list in one call: returns the filtered rows and the chips to render. */
export function useChips<T extends Pick<TableRowData, "filter">>(data: T[], rows: ReadonlyArray<ChipRow>, scope?: string): { shown: T[]; groups: ChipGroup[]; selection: ChipSelection } {
  const selection = useChipSelection(rows, scope);
  return useMemo(() => {
    const groups = chipCounts(data, rows, selection);
    const active = Object.entries(selection).filter(([, v]) => v.length);
    const shown = active.length ? data.filter((d) => active.every(([k, vals]) => toList(d.filter?.[k]).some((v) => vals.includes(v)))) : data;
    return { shown, groups, selection };
  }, [data, rows, selection]);
}

const toList = (v: string | string[] | null | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
