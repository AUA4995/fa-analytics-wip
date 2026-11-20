import Link from "next/link";

/**
 * Third-level tabs under a section (same look as the Accounts Hub's tabs, e.g. Tasks → Open / Waiting / Done):
 * menu → sub-menu on the left → these tabs across the top of the content. The tab is in the address (`?tab=…`), so
 * refresh, Back and shared links open the same tab.
 */
export interface TabDef {
  key: string;
  label: string;
  /** small number after the label (e.g. rows, problems) */
  count?: number | null;
  /** red dot: something there needs attention */
  dot?: boolean;
}

export function pickTab(raw: string | string[] | undefined, tabs: readonly TabDef[]): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return tabs.some((t) => t.key === v) ? (v as string) : (tabs[0]?.key ?? "");
}

export function PageTabs({ tabs, current, href, label }: { tabs: readonly TabDef[]; current: string; href: (key: string) => string; label: string }) {
  return (
    <nav className="ctabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <Link key={t.key} role="tab" aria-selected={current === t.key} href={href(t.key)} scroll={false}>
          {t.label}
          {t.count != null && <span className="n0">{t.count.toLocaleString("en-AU")}</span>}
          {t.dot && <span className="dot" aria-label="needs attention" />}
        </Link>
      ))}
    </nav>
  );
}
