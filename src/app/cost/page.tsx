import { EmptyState } from "@/components/ui/card";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cost & margin" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  return (
    <PlaceholderPage page="cost" searchParams={searchParams} subtitle="What one order costs the company (Base cost) and what each client costs (Cost to serve). TDABC and Full absorption.">
      <EmptyState title="Not built yet">Cost & margin is built in chunk 4, after Settings and Data sources.</EmptyState>
    </PlaceholderPage>
  );
}
