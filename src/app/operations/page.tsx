import Link from "next/link";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { parseSection } from "@/components/ui/sections";
import { WithSubNav } from "@/components/ui/sub-nav";
import { requireUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { lookup, showThomaxTime } from "@/lib/thomax/lookup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations" };

type SP = Promise<Record<string, string | string[] | undefined>>;

const SUBTITLE: Record<string, string> = {
  lookup: "Type an order, consignment, reference or tracking number: every Thomax row that has it, and the timeline from all their dates.",
  receiving: "Coming soon: expected and received deliveries by client and type.",
  sla: "Coming soon: same-day dispatch, ticket replies, receiving and billing against their targets.",
  returns: "Coming soon: returns waiting and processed.",
  trends: "Coming soon: volumes over time and the forecast.",
};

const cell = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Operations (batch 1, 16/11/2026): Order lookup over the Thomax copy. Other sections come in later batches. */
export default async function OperationsPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const sp = await searchParams;
  const section = parseSection("operations", sp.section);
  const q = typeof sp.q === "string" ? sp.q : "";
  return (
    <WithSubNav page="operations" current={section}>
      <PageHeader title="Operations" subtitle={SUBTITLE[section]} />
      {section === "lookup" ? (
        isAdminRole(me.role) ? (
          <Lookup q={q} />
        ) : (
          <EmptyState title="Admins only">Order lookup shows receivers&apos; names and addresses from Thomax, so it is limited to admins and the owner.</EmptyState>
        )
      ) : (
        <EmptyState title="Coming in a later batch">This section is planned and agreed; it&apos;s built after the Thomax copy is running.</EmptyState>
      )}
    </WithSubNav>
  );
}

async function Lookup({ q }: { q: string }) {
  const copied = await prisma.thomaxRow.count();
  const res = q ? await lookup(q) : null;
  return (
    <>
      <Card title="Find" sub={copied ? `${copied.toLocaleString("en-AU")} Thomax rows copied. Exact match on each table's searchable fields (Data sources → WMS).` : undefined}>
        {!copied && (
          <p className="small" style={{ marginTop: 0 }}>
            <Pill tone="amber">no data yet</Pill> Nothing is copied from Thomax yet — connect it on{" "}
            <Link href="/data?section=wms" className="lnk">
              Data sources → WMS
            </Link>
            .
          </p>
        )}
        <form className="lookup-form" action="/operations" method="get">
          <input type="hidden" name="section" value="lookup" />
          <input name="q" type="search" defaultValue={q} placeholder="Order no., consignment no., reference…" maxLength={100} aria-label="Search" />
          <button className="btn primary">Search</button>
        </form>
      </Card>
      {q && !res && <p className="meta">Type at least 2 characters.</p>}
      {res && !res.rows.length && <EmptyState title="Nothing found">No copied Thomax row has “{q}” in a searchable field. Check the spelling, or add the field to a table&apos;s searchable fields.</EmptyState>}
      {res && res.rows.length > 0 && (
        <>
          <Card title="Timeline" sub={`${res.rows.length} rows${res.truncated ? " (first 200)" : ""} · every date in them, oldest first`}>
            {res.timeline.length ? (
              <ul className="timeline">
                {res.timeline.map((e, i) => {
                  return (
                    <li key={i}>
                      <span>{showThomaxTime(e.at)}</span>
                      <span>
                        <b>{e.table}</b> · {e.field}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty">No dates in these rows.</p>
            )}
          </Card>
          {res.related.length > 0 && (
            <Card title="Linked numbers" sub="Other searchable values in these rows — click to search for them.">
              <div className="chips-wrap">
                {res.related.map((r) => (
                  <Link key={`${r.field}|${r.value}`} href={`/operations?section=lookup&q=${encodeURIComponent(r.value)}`} className="chip-check">
                    {r.table}.{r.field}: {r.value}
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {res.rows.map((r) => (
            <Card key={r.id} title={`${r.table} · ${r.label}`} sub={`matched on ${r.matchedOn.join(", ")}`}>
              <dl className="raw-kv">
                {r.entries.map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{cell(v)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </>
      )}
    </>
  );
}
