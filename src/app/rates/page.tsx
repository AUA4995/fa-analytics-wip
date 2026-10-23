import { EmptyState } from "@/components/ui/card";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rate review" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  return (
    <PlaceholderPage page="rates" searchParams={searchParams} subtitle="Review calendar, reviews in progress and the rate workbench.">
      <EmptyState title="Not built yet">Rate review is built in chunk 5.</EmptyState>
    </PlaceholderPage>
  );
}
