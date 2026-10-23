import { EmptyState } from "@/components/ui/card";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  return (
    <PlaceholderPage page="finance" searchParams={searchParams} subtitle="Company-level figures for management and the bank, from Xero.">
      <EmptyState title="Not built yet">Finance is built in chunk 6.</EmptyState>
    </PlaceholderPage>
  );
}
