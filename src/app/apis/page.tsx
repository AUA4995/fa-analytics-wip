import { EmptyState } from "@/components/ui/card";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "API connections" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  return (
    <PlaceholderPage page="apis" searchParams={searchParams} subtitle="Systems this app reads from, and keys we give out to other apps.">
      <EmptyState title="Not built yet">API connections are built in chunk 7.</EmptyState>
    </PlaceholderPage>
  );
}
