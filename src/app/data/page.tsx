import { EmptyState } from "@/components/ui/card";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data sources" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  return (
    <PlaceholderPage page="data" searchParams={searchParams} subtitle="Where the numbers come from: WMS, Xero, Front, contracts and AI.">
      <EmptyState title="Not built yet">Data sources are built in chunk 3. Xero can already be connected in Settings → Company.</EmptyState>
    </PlaceholderPage>
  );
}
