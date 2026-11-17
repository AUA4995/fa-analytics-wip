import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { parseSection } from "@/components/ui/sections";
import { WithSubNav } from "@/components/ui/sub-nav";
import { WmsUpload } from "@/components/data/wms-upload";
import { DeleteImportButton, FrontRecountButton, XeroSyncButtons } from "@/components/data/buttons";
import { requireUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { isFrontConfigured } from "@/lib/front/client";
import { getConnection } from "@/lib/xero/auth";
import { WMS_SOURCES } from "@/lib/wms/import";
import { ThomaxPanel } from "@/components/data/thomax-panel";
import { isOwnerRole } from "@/lib/auth/roles";
import { plainError } from "@/lib/plain-error";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data sources" };

const au = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : "—");
const auTime = (d: Date | null | undefined) => (d ? d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");
const n = (x: number) => x.toLocaleString("en-AU");
const srcName = (s: string) => WMS_SOURCES.find(([k]) => k === s)?.[1] ?? s;

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Data sources (brief §11): where every number comes from, what has been read, and what's missing. */
export default async function DataPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const admin = isAdminRole(me.role);
  const sp = await searchParams;
  const section = parseSection("data", sp.section);
  const openTable = typeof sp.t === "string" ? sp.t : undefined;
  return (
    <WithSubNav page="data" current={section}>
      <PageHeader title="Data sources" subtitle="Everything here is read-only: the app copies data in, never changes the source." />
      {section === "wms" && <WmsSection admin={admin} owner={isOwnerRole(me.role)} openTable={openTable} />}
      {section === "xero" && <XeroSection admin={admin} />}
      {section === "front" && <FrontSection admin={admin} />}
      {section === "contracts" && <ContractsSection />}
      {section === "ai" && <AiSection />}
    </WithSubNav>
  );
}

async function WmsSection({ admin, owner, openTable }: { admin: boolean; owner: boolean; openTable?: string }) {
  const [imports, coverage, orderCoverage, clients, maps] = await Promise.all([
    prisma.volumeImport.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { _count: { select: { lines: true, orders: true } } } }),
    prisma.volumeLine.groupBy({ by: ["source", "tenant"], _min: { date: true }, _max: { date: true }, _count: { _all: true } }),
    prisma.orderFact.groupBy({ by: ["source", "tenant"], _min: { date: true }, _max: { date: true }, _count: { _all: true } }),
    prisma.client.findMany({ select: { id: true, name: true, dyspatchCustomerId: true, thomaxTenantId: true, p3lClientId: true, logiwaClientId: true } }),
    prisma.wmsCodeMap.findMany({ select: { source: true, wmsCode: true } }),
  ]);
  const codes = await prisma.volumeLine.groupBy({ by: ["source", "wmsCode"], _sum: { quantity: true } });
  const unmapped = codes.filter((c) => !maps.some((m) => m.source === c.source && m.wmsCode === c.wmsCode));
  const clientFor = (source: string, tenant: string) =>
    clients.find((c) => (source === "THOMAX" ? [c.thomaxTenantId, c.dyspatchCustomerId] : source === "P3L" ? [c.p3lClientId] : [c.logiwaClientId, c.dyspatchCustomerId]).includes(tenant));
  const keys = new Map<string, { source: string; tenant: string; chg?: (typeof coverage)[number]; ord?: (typeof orderCoverage)[number] }>();
  for (const c of coverage) keys.set(`${c.source}|${c.tenant}`, { source: c.source, tenant: c.tenant, chg: c });
  for (const o of orderCoverage) {
    const k = `${o.source}|${o.tenant}`;
    keys.set(k, { ...(keys.get(k) ?? { source: o.source, tenant: o.tenant }), ord: o });
  }
  const rows = [...keys.values()].sort((a, b) => a.source.localeCompare(b.source) || a.tenant.localeCompare(b.tenant));
  return (
    <>
      <ThomaxPanel admin={admin} owner={owner} open={openTable} />
      <div className="grid2">
        <Card title="Logiwa · API">
          <p className="small" style={{ marginTop: 0 }}>
            <Pill tone="grey">not live yet</Pill> Connects with an API key once Logiwa is live; it then becomes the only live WMS source. Its client and charge codes join through Settings → Clients and Cost pools & mapping.
          </p>
        </Card>
      </div>
      {admin && (
        <Card title="Load a WMS file" sub="Thomax exports now, 3PLWMS exports (a few months in 2026), Logiwa files if ever needed. The same file can't be loaded twice; overlaps are shown before anything is saved.">
          <WmsUpload sources={WMS_SOURCES} aiReady={!!process.env.ANTHROPIC_API_KEY} />
        </Card>
      )}
      <Card title="What's loaded" sub="Per WMS and tenant: dates covered, day lines (charges) and orders.">
        {!rows.length ? (
          <p className="empty">Nothing loaded yet.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>WMS</th>
                  <th>Tenant</th>
                  <th>Client</th>
                  <th>Charges · dates</th>
                  <th className="r">Day lines</th>
                  <th>Orders · dates</th>
                  <th className="r">Orders</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = clientFor(r.source, r.tenant);
                  return (
                    <tr key={`${r.source}|${r.tenant}`}>
                      <td>{srcName(r.source)}</td>
                      <td className="mono small">{r.tenant}</td>
                      <td>{c ? c.name : <Link href="/settings?section=clients" className="lnk" style={{ color: "var(--red)" }}>no client has this ID</Link>}</td>
                      <td className="small">{r.chg ? `${au(r.chg._min.date)} – ${au(r.chg._max.date)}` : "—"}</td>
                      <td className="r num">{r.chg ? n(r.chg._count._all) : "—"}</td>
                      <td className="small">{r.ord ? `${au(r.ord._min.date)} – ${au(r.ord._max.date)}` : "—"}</td>
                      <td className="r num">{r.ord ? n(r.ord._count._all) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {unmapped.length > 0 && (
        <Card title={`Charge codes not mapped · ${unmapped.length}`} tone="warn" sub="These WMS codes have no standard service code yet, so their volumes don't reach the cost model.">
          <p className="small mono" style={{ margin: 0 }}>
            {unmapped.slice(0, 60).map((u) => `${srcName(u.source)}: ${u.wmsCode}`).join(" · ")}
            {unmapped.length > 60 ? ` … and ${unmapped.length - 60} more` : ""}
          </p>
          <p style={{ marginBottom: 0 }}>
            <Link href="/settings?section=pools" className="lnk">
              Map them in Settings → Cost pools & mapping
            </Link>
          </p>
        </Card>
      )}
      <Card title="Files loaded">
        {!imports.length ? (
          <p className="empty">No files yet.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>WMS</th>
                  <th>Type</th>
                  <th>Dates</th>
                  <th className="r">Rows read</th>
                  <th className="r">Saved</th>
                  <th className="r">Replaced</th>
                  <th>By · when</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {imports.map((i) => (
                  <tr key={i.id}>
                    <td className="sup">{i.fileName ?? "—"}</td>
                    <td>{srcName(i.source)}</td>
                    <td>{i.kind === "ORDERS" ? "Orders" : "Charges"}</td>
                    <td className="small">
                      {au(i.dateFrom)} – {au(i.dateTo)}
                    </td>
                    <td className="r num">{n(i.rows)}</td>
                    <td className="r num">{n(i._count.lines + i._count.orders)}</td>
                    <td className="r num">{i.replaced ? n(i.replaced) : "—"}</td>
                    <td className="small">
                      {i.uploadedBy} · {auTime(i.createdAt)}
                    </td>
                    <td>{admin && <DeleteImportButton id={i.id} name={i.fileName ?? "this file"} />}</td>
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

async function XeroSection({ admin }: { admin: boolean }) {
  const [conn, runs, accounts, contacts, sales, saleRange, pnl, employees, payRuns, payslips] = await Promise.all([
    getConnection(),
    prisma.sourceRun.findMany({ where: { source: "xero" }, orderBy: { startedAt: "desc" }, take: 8 }),
    prisma.xeroAccount.count(),
    prisma.xeroContact.count(),
    prisma.xeroSale.count(),
    prisma.xeroSale.aggregate({ _min: { date: true }, _max: { date: true } }),
    prisma.xeroPnl.groupBy({ by: ["month"], orderBy: { month: "asc" } }),
    prisma.payrollEmployee.count(),
    prisma.payRun.count(),
    prisma.payslip.count(),
  ]);
  return (
    <>
      <Card title="Xero" sub="Accounting, reports and AU Payroll, read-only. Reads every night at 05:30; P&L re-reads the last 3 months each night (closed months are kept).">
        <div className="row" style={{ marginBottom: 10 }}>
          <Pill tone={conn ? "green" : "grey"}>{conn ? `Connected · ${conn.tenantName}` : "Not connected"}</Pill>
          <span className="meta">Last read {auTime(conn?.lastSyncAt)} · full {auTime(conn?.lastFullSyncAt)}</span>
          {admin && <XeroSyncButtons connected={!!conn} />}
        </div>
        {!conn && (
          <p className="small">
            <Link href="/settings?section=company" className="lnk">
              Connect Xero in Settings → Company
            </Link>
          </p>
        )}
        <div className="tw">
          <table>
            <tbody>
              <tr>
                <td>Chart of accounts</td>
                <td className="r num">{n(accounts)}</td>
                <td className="meta">expense accounts appear in Settings → Cost pools & mapping</td>
              </tr>
              <tr>
                <td>Contacts</td>
                <td className="r num">{n(contacts)}</td>
                <td className="meta">clients and suppliers are suggested from these</td>
              </tr>
              <tr>
                <td>Sales invoices and credit notes (line by line)</td>
                <td className="r num">{n(sales)}</td>
                <td className="meta">
                  {au(saleRange._min.date)} – {au(saleRange._max.date)}
                </td>
              </tr>
              <tr>
                <td>Profit &amp; loss months</td>
                <td className="r num">{pnl.length}</td>
                <td className="meta">{pnl.length ? `${pnl[0].month} – ${pnl[pnl.length - 1].month}` : "—"}</td>
              </tr>
              <tr>
                <td>Payroll: employees · pay runs · payslips</td>
                <td className="r num">
                  {n(employees)} · {n(payRuns)} · {n(payslips)}
                </td>
                <td className="meta">gross, super and hours per person per pay run</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <RunsCard runs={runs} />
    </>
  );
}

async function FrontSection({ admin }: { admin: boolean }) {
  const configured = isFrontConfigured();
  const [counts, runs, clientsNoDomain] = await Promise.all([
    prisma.frontTicketMonth.findMany({ orderBy: [{ month: "desc" }] }),
    prisma.sourceRun.findMany({ where: { source: "front" }, orderBy: { startedAt: "desc" }, take: 5 }),
    prisma.client.count({ where: { status: { not: "INACTIVE" }, frontDomains: { isEmpty: true } } }),
  ]);
  const clients = await prisma.client.findMany({ where: { id: { in: [...new Set(counts.map((c) => c.clientId))] } }, select: { id: true, name: true } });
  const months = [...new Set(counts.map((c) => c.month))].sort().reverse().slice(0, 6);
  return (
    <>
      <Card title="Front · tickets per client" sub="Client-service effort for cost to serve: conversations per client per month, matched by the client's email domains. Counted every night at 05:45, together with the weighted ticket scores per week (types and weights: Settings → Ticket types). Recount also re-scores the weeks it covers.">
        <div className="row" style={{ marginBottom: 10 }}>
          <Pill tone={configured ? "green" : "grey"}>{configured ? "Token set" : "Not connected"}</Pill>
          {admin && <FrontRecountButton configured={configured} />}
          <Link href="/settings?section=tickets" className="lnk">
            Ticket types & weekly scores
          </Link>
          {clientsNoDomain > 0 && (
            <Link href="/settings?section=clients" className="lnk">
              {clientsNoDomain} active clients have no email domain yet
            </Link>
          )}
        </div>
        {!counts.length ? (
          <p className="empty">No counts yet.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  {months.map((m) => (
                    <th key={m} className="r">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td className="sup">{c.name}</td>
                    {months.map((m) => (
                      <td key={m} className="r num">
                        {counts.find((x) => x.clientId === c.id && x.month === m)?.tickets ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <RunsCard runs={runs} />
    </>
  );
}

function ContractsSection() {
  return (
    <div className="grid2">
      <Card title="CLM (contracts & rates)">
        <p className="small" style={{ marginTop: 0 }}>
          <Pill tone="grey">not connected</Pill> CLM is the master for client rates. It connects with an API key once CLM gives one out; then rates, renewal dates and review clauses are read from it (Rate review calendar).
        </p>
      </Card>
      <Card title="Dyspach rate export">
        <p className="small" style={{ marginTop: 0 }}>
          <Pill tone="grey">not connected</Pill> No confirmed API yet (ask Varun). A rate export file can be loaded here for the CLM vs Dyspach vs WMS rate checks (Leakage, chunk 5).
        </p>
      </Card>
    </div>
  );
}

async function AiSection() {
  const configured = !!process.env.ANTHROPIC_API_KEY;
  const month = new Date().toISOString().slice(0, 7);
  const usage = await prisma.aiCallLog.aggregate({ where: { createdAt: { gte: new Date(month + "-01T00:00:00Z") } }, _sum: { costUsd: true }, _count: { _all: true } });
  return (
    <Card title="Claude" sub="Reads original supplier invoices attached to Xero bills and Front attachments, writes report summaries, proposes calculations for new improvement ideas. Each value it reads shows a confidence and a link; low confidence is checked by a person.">
      <dl className="fl">
        <dt>Key</dt>
        <dd>{configured ? <Pill tone="green">set</Pill> : <Pill tone="grey">not set — ANTHROPIC_API_KEY in .env (own key for Analytics)</Pill>}</dd>
        <dt>This month</dt>
        <dd>
          {usage._count._all} calls · US${Number(usage._sum.costUsd ?? 0).toFixed(2)} of the US$30 budget
        </dd>
      </dl>
    </Card>
  );
}

function RunsCard({ runs }: { runs: Array<{ id: string; label: string; status: string; startedAt: Date; finishedAt: Date | null; error: string | null; startedBy: string | null; stats: unknown }> }) {
  if (!runs.length) return null;
  return (
    <Card title="Recent runs">
      <div className="tw">
        <table>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="small">{auTime(r.startedAt)}</td>
                <td>{r.label}</td>
                <td>
                  <Pill tone={r.status === "SUCCESS" ? "green" : r.status === "FAILED" ? "red" : "blue"}>{r.status === "SUCCESS" ? "done" : r.status === "FAILED" ? "failed" : "running"}</Pill>
                </td>
                <td className="small meta">{r.error ? plainError(r.error, { log: false }) : summary(r.stats)}</td>
                <td className="small">{r.startedBy ?? "schedule"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function summary(stats: unknown): string {
  if (!stats || typeof stats !== "object") return "";
  return Object.entries(stats as Record<string, unknown>)
    .filter(([k, v]) => k !== "durationMs" && v !== undefined && v !== null && v !== 0)
    .map(([k, v]) => `${k} ${typeof v === "number" ? n(v) : String(v)}`)
    .join(" · ");
}
