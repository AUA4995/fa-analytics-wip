import { EmptyState } from "@/components/ui/card";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Improvements & savings" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  return (
    <PlaceholderPage page="improve" searchParams={searchParams} subtitle="Cost no longer spent: ideas, initiatives and their projects.">
      <EmptyState title="Not built yet">Improvements & savings is built in chunk 6.</EmptyState>
    </PlaceholderPage>
  );
}
