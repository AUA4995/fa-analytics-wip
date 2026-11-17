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
import { parseThomaxDate } from "@/lib/thomax/shape";
import { THOMAX_TABLES } from "@/lib/thomax/tables";
import { Kpi, KpiRow, type KpiTone } from "@/components/ui/kpi";
import { NotConnected } from "@/components/ui/not-connected";
import { OpsSetupForm } from "@/components/ops/setup-form";
import { metPct, parsePeriod, periodRange, PERIODS, showWall, sydneyWallNow, type SlaCount } from "@/lib/ops/calc";
import { FLOW_INFO, flowReady, getOpsConfig, type FlowKey, type OpsConfig } from "@/lib/ops/config";
import { siteCodes, tenantNames } from "@/lib/ops/load";
import { pct, receivingView, slaView, trendsView, type Item } from "@/lib/ops/views";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations" };

type SP = Promise<Record<string, string | string[] | undefined>>;

const SUBTITLE: Record<string, string> = {
  lookup: "Type an order, consignment, reference or tracking number: every Thomax row that has it, and the timeline from all their dates.",
  receiving: "Deliveries expected (ASN) and received, by client and type, and receipts waiting longer than the target.",
  sla: "Same-day dispatch and receiving against their targets, by client. Tickets and billing join when their sources are connected.",
  returns: "Returns waiting and processed.",
  trends: "Orders per week by client, and an outlook for the next 7 days from the same weekdays in the last 8 weeks.",
  setup: "Which Thomax table and fields mean client, created and done for each flow, and the SLA rules.",
};

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  // /Date(…)/ values read as a date, the raw value kept in brackets
  if (/^\/Date\(-?\d+/.test(s)) {
    const d = parseThomaxDate(s);
    return d ? `${showThomaxTime(d)} (${s})` : s;
  }
  return s;
};

/** Operations: Order lookup (batch 1) + Receiving, SLA, Trends, Setup (batch 5) over the Thomax copy. */
export default async function OperationsPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const sp = await searchParams;
  const section = parseSection("operations", sp.section);
  const q = typeof sp.q === "string" ? sp.q : "";
  const admin = isAdminRole(me.role);
  return (
    <WithSubNav page="operations" current={section}>
      <PageHeader title="Operations" subtitle={SUBTITLE[section]} />
      {section === "lookup" &&
        (admin ? (
          <Lookup q={q} by={me.name} />
        ) : (
          <EmptyState title="Admins only">Order lookup shows receivers&apos; names and addresses from Thomax, so it is limited to admins and owners.</EmptyState>
        ))}
      {(section === "sla" || section === "receiving" || section === "trends") && <Views section={section} sp={sp} admin={admin} />}
      {section === "returns" && (
        <EmptyState title="Coming soon">
          Returns join later: Thomax has no separate returns table in the Query API list, so they will come from Front (the FA Returns inbox) or from Logiwa. Nothing is estimated in the meantime.
        </EmptyState>
      )}
      {section === "setup" && (admin ? <Setup /> : <EmptyState title="Admins only">Only admins and owners change the Operations setup.</EmptyState>)}
    </WithSubNav>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Views({ section, sp, admin }: { section: "sla" | "receiving" | "trends"; sp: Record<string, string | string[] | undefined>; admin: boolean }) {
  const cfg = await getOpsConfig();
  const [names, sites, copied] = await Promise.all([tenantNames(), siteCodes(), prisma.thomaxRow.count()]);
  const now = sydneyWallNow();
  const period = parsePeriod(one(sp.p));
  const range = periodRange(period, now, { from: one(sp.from), to: one(sp.to) });
  const tenant = one(sp.client) || "";
  const siteKey = one(sp.site) || "";
  const site = sites.find((s) => s.key === siteKey);
  const filter = { tenants: tenant ? [tenant] : null, warehouses: site ? site.codes : null };
  const name = (t: string) => names.get(t) ?? (t ? `tenant ${t}` : "(no tenant)");
  const tenantOptions = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const siteNoCodes = site && !site.codes.length;
  const flowsMissing = (section === "sla" ? ["dispatch", "receiving"] : section === "receiving" ? ["receiving", "expected"] : ["dispatch"]).filter((k) => !flowReady(cfg, k as FlowKey));

  return (
    <>
      <Card>
        <form className="ops-filters" action="/operations" method="get">
          <input type="hidden" name="section" value={section} />
          {section !== "trends" && (
            <>
              <label>
                Period
                <select name="p" defaultValue={period}>
                  {PERIODS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                From
                <input type="date" name="from" defaultValue={one(sp.from)} />
              </label>
              <label>
                To
                <input type="date" name="to" defaultValue={one(sp.to)} />
              </label>
            </>
          )}
          <label>
            Client
            <select name="client" defaultValue={tenant}>
              <option value="">All clients</option>
              {tenantOptions.map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Site
            <select name="site" defaultValue={siteKey}>
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn">Show</button>
        </form>
        <p className="meta" style={{ marginBottom: 0 }}>
          {section !== "trends" && <>Period: {range.label}{period === "custom" ? " (From/To dates; at most 400 days)" : ""}. </>}
          Times are Sydney time as Thomax records them.
          {siteNoCodes && <> {site.name} has no WMS warehouse codes yet (Settings → Sites), so the site filter can&apos;t apply.</>}
        </p>
      </Card>
      {!copied && (
        <EmptyState title="No data yet">
          Nothing is copied from Thomax yet — connect it on{" "}
          <Link href="/data?section=wms" className="lnk">
            Data sources → WMS
          </Link>
          .
        </EmptyState>
      )}
      {copied > 0 && flowsMissing.length > 0 && (
        <Card tone="warn" title="Setup needed">
          <p className="small" style={{ margin: 0 }}>
            Choose which Thomax fields mean client, created and done for: {flowsMissing.map((k) => FLOW_INFO[k as FlowKey].title).join(", ")}.{" "}
            {admin ? (
              <Link href="/operations?section=setup" className="lnk">
                Operations → Setup
              </Link>
            ) : (
              "An admin does this in Operations → Setup."
            )}
          </p>
        </Card>
      )}
      {copied > 0 && section === "sla" && <Sla cfg={cfg} from={range.from} to={range.to} filter={filter} now={now} name={name} />}
      {copied > 0 && section === "receiving" && <Receiving cfg={cfg} from={range.from} to={range.to} filter={filter} now={now} name={name} />}
      {copied > 0 && section === "trends" && <Trends cfg={cfg} filter={filter} now={now} name={name} />}
    </>
  );
}

type ViewProps = { cfg: OpsConfig; from: Date; to: Date; filter: { tenants: string[] | null; warehouses: string[] | null }; now: Date; name: (t: string) => string };

const tone = (p: number | null): KpiTone => (p === null ? "normal" : p >= 0.97 ? "green" : p >= 0.9 ? "amber" : "red");

function CountsTable({ rows, name }: { rows: Array<{ tenant: string; c: SlaCount }>; name: (t: string) => string }) {
  if (!rows.length) return <p className="empty">Nothing in this period.</p>;
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th className="r">Total</th>
            <th className="r">On time</th>
            <th className="r">Late</th>
            <th className="r">Overdue now</th>
            <th className="r">Not due yet</th>
            <th className="r">On time %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tenant}>
              <td>{name(r.tenant)}</td>
              <td className="r">{r.c.total.toLocaleString("en-AU")}</td>
              <td className="r">{r.c.met.toLocaleString("en-AU")}</td>
              <td className="r">{r.c.late.toLocaleString("en-AU")}</td>
              <td className="r">{r.c.overdue.toLocaleString("en-AU")}</td>
              <td className="r">{r.c.open.toLocaleString("en-AU")}</td>
              <td className="r">{pct(metPct(r.c))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProblemTable({ items, name, doneLabel, dayEnd = false }: { items: Item[]; name: (t: string) => string; doneLabel: string; dayEnd?: boolean }) {
  if (!items.length) return <p className="empty">None.</p>;
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>Reference</th>
            <th>Created</th>
            <th>Due by</th>
            <th>{doneLabel}</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>{name(it.tenant)}</td>
              <td>{it.ref ? <Link href={`/operations?section=lookup&q=${encodeURIComponent(it.ref)}`} className="lnk">{it.ref}</Link> : "—"}</td>
              <td>{showWall(it.created)}</td>
              <td>{dayEnd ? `${showWall(new Date(it.due.getTime() - 60_000)).slice(0, 10)} (end of day)` : showWall(it.due)}</td>
              <td>{showWall(it.done)}</td>
              <td>{it.state === "LATE" ? <Pill tone="amber">late</Pill> : <Pill tone="red">overdue</Pill>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Sla({ cfg, from, to, filter, now, name }: ViewProps) {
  const v = await slaView(cfg, from, to, filter, now);
  const d = metPct(v.dispatch.total);
  const r = metPct(v.receiving.total);
  return (
    <>
      <KpiRow lead={false}>
        <Kpi label="Dispatch on time" value={v.dispatch.ready ? pct(d) : "—"} tone={tone(d)} sub={v.dispatch.ready ? `${v.dispatch.total.total.toLocaleString("en-AU")} orders · ${v.dispatch.total.overdue} overdue now` : "setup needed"} />
        <Kpi label={`Receiving within ${cfg.rules.receivingHours} h`} value={v.receiving.ready ? pct(r) : "—"} tone={tone(r)} sub={v.receiving.ready ? `${v.receiving.total.total.toLocaleString("en-AU")} receipts · ${v.receiving.total.overdue} overdue now` : "setup needed"} />
        <Kpi label="Ticket replies (4 working hours)" value="—" sub="needs reply times from Front — coming soon" />
        <Kpi label="Billing on time" value="—" sub={<NotConnected source="hub" />} />
      </KpiRow>
      <p className="meta">
        On time % = on time ÷ (on time + late + overdue); orders not due yet aren&apos;t counted. Rule: before {cfg.rules.cutoffHour}:00 on a working day → same day, otherwise the next working day; B2B {cfg.rules.b2bExtraDays} working days more
        {cfg.b2bValues.length ? ` (order type ${cfg.b2bValues.join(" / ")})` : " (no B2B order types set — every order counts as B2C)"}.{" "}
        {cfg.rules.holidays.length ? `${cfg.rules.holidays.length} public holidays excluded.` : "No public holidays entered yet."}
      </p>
      {(v.dispatch.capped || v.receiving.capped) && <p className="msg-err">Very large period — only the first 300,000 rows were used. Choose a shorter period.</p>}
      {v.dispatch.ready && (
        <>
          <Card title="Dispatch by client">
            <CountsTable rows={v.dispatch.byTenant} name={name} />
          </Card>
          <Card title="Late and overdue orders" sub="Oldest due first, up to 200.">
            <ProblemTable items={v.dispatch.problems} name={name} doneLabel="Shipped" dayEnd />
          </Card>
        </>
      )}
      {v.receiving.ready && (
        <Card title="Receiving by client">
          <CountsTable rows={v.receiving.byTenant} name={name} />
        </Card>
      )}
    </>
  );
}

async function Receiving({ cfg, from, to, filter, now, name }: ViewProps) {
  const v = await receivingView(cfg, from, to, filter, now);
  const sum = (k: "expected" | "arrived" | "received" | "open" | "late") => v.byTenant.reduce((s, x) => s + x[k], 0);
  return (
    <>
      <KpiRow lead={false}>
        <Kpi label="Expected (ASN)" value={v.ready.expected ? sum("expected").toLocaleString("en-AU") : "—"} sub={v.ready.expected ? "in the period" : "setup needed"} />
        <Kpi label="Arrived" value={v.ready.receiving ? sum("arrived").toLocaleString("en-AU") : "—"} />
        <Kpi label="Received" value={v.ready.receiving ? sum("received").toLocaleString("en-AU") : "—"} />
        <Kpi label={`Waiting over ${cfg.rules.receivingHours} h`} value={v.ready.receiving ? v.waiting.length.toLocaleString("en-AU") : "—"} tone={v.waiting.length ? "red" : "normal"} sub="arrived in the last 60 days" />
      </KpiRow>
      <p className="meta">
        Expected and received deliveries are counted separately: Thomax&apos;s link between an ASN and its receipt isn&apos;t known yet, so they aren&apos;t matched one to one. Emails from clients about deliveries (no ASN yet) join when Front events are added.
      </p>
      {v.capped && <p className="msg-err">Very large period — only the first 300,000 rows were used. Choose a shorter period.</p>}
      <Card title="By client">
        {!v.byTenant.length ? (
          <p className="empty">Nothing in this period.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="r">Expected</th>
                  <th className="r">Arrived</th>
                  <th className="r">Received</th>
                  <th className="r">Still open</th>
                  <th className="r">Received late</th>
                </tr>
              </thead>
              <tbody>
                {v.byTenant.map((x) => (
                  <tr key={x.tenant}>
                    <td>{name(x.tenant)}</td>
                    <td className="r">{v.ready.expected ? x.expected : "—"}</td>
                    <td className="r">{x.arrived}</td>
                    <td className="r">{x.received}</td>
                    <td className="r">{x.open}</td>
                    <td className="r">{x.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {v.byType.length > 0 && cfg.flows.receiving.roles.type && (
        <Card title="By receipt type">
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="r">Arrived</th>
                  <th className="r">Received</th>
                </tr>
              </thead>
              <tbody>
                {v.byType.map((t) => (
                  <tr key={t.type}>
                    <td>{t.type}</td>
                    <td className="r">{t.arrived}</td>
                    <td className="r">{t.received}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card title={`Waiting longer than ${cfg.rules.receivingHours} hours`} sub="Arrived but not received, oldest first, up to 200.">
        <ProblemTable items={v.waiting} name={name} doneLabel="Received" />
      </Card>
    </>
  );
}

async function Trends({ cfg, filter, now, name }: Omit<ViewProps, "from" | "to">) {
  const v = await trendsView(cfg, "dispatch", filter, now);
  if (!v.ready) return null;
  const wk = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return (
    <>
      <Card title="Next 7 days — outlook" sub="Average orders on the same weekday over the last 8 weeks. Shown only with at least 4 weeks of history; not a promise, just the usual pattern.">
        <div className="tw">
          <table>
            <thead>
              <tr>
                {v.outlook.map((o) => (
                  <th key={o.day.toISOString()} className="r">
                    {o.day.toLocaleDateString("en-AU", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {v.outlook.map((o) => (
                  <td key={o.day.toISOString()} className="r" title={`${o.basis} weeks of history`}>
                    {o.value === null ? <span className="meta">not enough history</span> : Math.round(o.value).toLocaleString("en-AU")}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Orders per week" sub="Week starting Monday; the last column is this week so far.">
        {!v.rows.length ? (
          <p className="empty">No orders in the last 12 weeks.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  {v.weeks.map((w) => (
                    <th key={w} className="r">
                      {wk(w)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <b>All</b>
                  </td>
                  {v.totals.map((t, i) => (
                    <td key={i} className="r">
                      <b>{t.toLocaleString("en-AU")}</b>
                    </td>
                  ))}
                </tr>
                {v.rows.slice(0, 40).map((r) => (
                  <tr key={r.tenant}>
                    <td>{name(r.tenant)}</td>
                    {r.counts.map((c, i) => (
                      <td key={i} className="r">
                        {c ? c.toLocaleString("en-AU") : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

async function Setup() {
  const [cfg, tables] = await Promise.all([getOpsConfig(), prisma.thomaxTable.findMany({ select: { name: true, fields: true }, orderBy: { name: "asc" } })]);
  const list = THOMAX_TABLES.filter((t) => !t.off).map((t) => {
    const f = tables.find((x) => x.name === t.name)?.fields;
    return { name: t.name, label: t.label, fields: Array.isArray(f) ? (f as string[]) : [] };
  });
  return (
    <Card title="Fields and rules" sub="Field lists come from Explore on Data sources → WMS. Required fields are needed before a view shows numbers.">
      <OpsSetupForm cfg={cfg} info={FLOW_INFO} tables={list} />
    </Card>
  );
}

async function Lookup({ q, by }: { q: string; by: string }) {
  const copied = await prisma.thomaxRow.count();
  const res = q ? await lookup(q) : null;
  // Results can show receivers' names and addresses: every search is logged (who, what, when)
  if (res) await prisma.changeLog.create({ data: { entity: "OrderLookup", entityId: res.term, field: "search", newValue: { rows: res.rows.length }, actorName: by } }).catch((err) => console.error("[lookup] search log not written:", err));
  const rowNo = new Map(res?.rows.map((r, i) => [r.id, i + 1]) ?? []);
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
                        <a href={`#row-${e.rowId}`} className="lnk">
                          <b>{e.table}</b> row {rowNo.get(e.rowId)}
                        </a>{" "}
                        · {e.field}
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
            <Card key={r.id} id={`row-${r.id}`} title={`${r.table} row ${rowNo.get(r.id)} · ${r.label}`} sub={`matched on ${r.matchedOn.join(", ")}`}>
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
