import { EmptyState } from "@/components/ui/card";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leakage" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  return (
    <PlaceholderPage page="leakage" searchParams={searchParams} subtitle="Revenue not collected: under-billing, under-pricing and rate mismatches.">
      <EmptyState title="Not built yet">Leakage is built in chunk 5.</EmptyState>
    </PlaceholderPage>
  );
}
