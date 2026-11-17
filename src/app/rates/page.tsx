import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

/** The rate review page moved (batch 4): the workbench is Cost & margin → Rate workbench; calendar and stages live in CLM. */
export default async function RatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams({ section: "workbench" });
  for (const k of ["client", "review", "panel"]) {
    const v = sp[k];
    if (typeof v === "string") p.set(k, v);
  }
  // An old link to a review drawer without its client: open it on that review's client
  const panel = typeof sp.panel === "string" ? sp.panel : "";
  if (!p.has("client") && panel.startsWith("review:")) {
    const r = await prisma.rateReview.findUnique({ where: { id: panel.slice(7) }, select: { clientId: true } }).catch(() => null);
    if (r) p.set("client", r.clientId);
  }
  if (sp.section === "calendar" || sp.section === "progress") p.set("moved", "1");
  redirect(`/cost?${p.toString()}`);
}
