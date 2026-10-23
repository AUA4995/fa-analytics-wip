import { AccessRequestView } from "../request-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Decline access" };

/** Owner's Decline link from the access request email (Batch 2 item 31). */
export default async function DeclineAccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <AccessRequestView token={typeof sp.token === "string" ? sp.token : ""} decision="decline" />;
}
