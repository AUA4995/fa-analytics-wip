import { EmptyState } from "./card";
import { PageHeader } from "./page-header";
import { PAGES, parseSection, type PageKey } from "./sections";
import { WithSubNav } from "./sub-nav";
import type { ReactNode } from "react";

/** Shell + sub-menu + empty state for pages Round 2 fills in. */
export async function PlaceholderPage({
  page,
  searchParams,
  subtitle,
  children,
}: {
  page: PageKey;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  subtitle: string;
  children?: ReactNode;
}) {
  const section = parseSection(page, (await searchParams).section);
  return (
    <WithSubNav page={page} current={section}>
      <PageHeader title={PAGES[page].label} subtitle={subtitle} />
      {children ?? <EmptyState>Built in the next step.</EmptyState>}
    </WithSubNav>
  );
}
