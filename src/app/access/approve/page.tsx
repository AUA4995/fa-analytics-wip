import { AccessRequestView } from "../request-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Approve access" };

/** Owner's Approve link from the access request email (Batch 2 item 31). */
export default async function ApproveAccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <AccessRequestView token={typeof sp.token === "string" ? sp.token : ""} decision="approve" />;
}
