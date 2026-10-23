import { EmptyState } from "@/components/ui/card";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  return (
    <PlaceholderPage page="tasks" searchParams={searchParams} subtitle="Follow-up tasks from notifications, leakage and projects. Resolved tasks are checked against the source system.">
      <EmptyState title="Not built yet">Tasks are built in chunk 5.</EmptyState>
    </PlaceholderPage>
  );
}
