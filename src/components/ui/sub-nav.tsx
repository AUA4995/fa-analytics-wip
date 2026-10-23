import Link from "next/link";
import type { ReactNode } from "react";
import { PAGES, sectionHref, type PageKey } from "./sections";

/** Second, page-level vertical menu (horizontal scroll on phones). Sections via `?section=`. */
export function SubNav({ page, current }: { page: PageKey; current: string }) {
  const def = PAGES[page];
  return (
    <nav className="subnav" aria-label={`${def.label} sections`}>
      {def.sections.map(([k, label]) => (
        <Link key={k} href={sectionHref(page, k)} aria-current={k === current ? "true" : "false"} scroll={false}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Page layout with the sub-menu on the left and the page body on the right. */
export function WithSubNav({ page, current, children }: { page: PageKey; current: string; children: ReactNode }) {
  return (
    <div className="page">
      <div className="withsub">
        <SubNav page={page} current={current} />
        <div className="subbody">{children}</div>
      </div>
    </div>
  );
}
