import { EmptyState } from "@/components/ui/card";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  return (
    <PlaceholderPage page="reports" searchParams={searchParams} subtitle="Saved reports, sent by email as PDF through Front.">
      <EmptyState title="Not built yet">Reports are built in chunk 6.</EmptyState>
    </PlaceholderPage>
  );
}
