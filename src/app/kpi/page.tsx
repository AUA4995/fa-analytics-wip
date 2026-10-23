import { EmptyState } from "@/components/ui/card";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "KPI" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  return (
    <PlaceholderPage page="kpi" searchParams={searchParams} subtitle="KPIs vs target by group and site.">
      <EmptyState title="Not built yet">KPI is built in chunk 6.</EmptyState>
    </PlaceholderPage>
  );
}
