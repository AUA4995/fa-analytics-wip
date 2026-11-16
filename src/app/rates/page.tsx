import { redirect } from "next/navigation";

/** The rate review page moved (batch 4): the workbench is Cost & margin → Rate workbench; calendar and stages live in CLM. */
export default async function RatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams({ section: "workbench" });
  for (const k of ["client", "review", "panel"]) {
    const v = sp[k];
    if (typeof v === "string") p.set(k, v);
  }
  redirect(`/cost?${p.toString()}`);
}
