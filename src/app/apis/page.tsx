import Link from "next/link";
import { NewKeyForm, RevokeKey } from "@/components/apis/keys";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { parseSection } from "@/components/ui/sections";
import { WithSubNav } from "@/components/ui/sub-nav";
import { isAdminRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getConnectionStatuses } from "@/lib/integrations/status";
import { SCOPES } from "@/lib/apikeys/scopes";

export const dynamic = "force-dynamic";
export const metadata = { title: "API connections" };

const au = (d: Date | null | undefined) => (d ? d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const ad = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

/** API connections (brief §12): systems we read from, and keys we give out. */
export default async function ApisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireUser();
  const section = parseSection("apis", (await searchParams).section);
  return (
    <WithSubNav page="apis" current={section}>
      <PageHeader title="API connections" subtitle={section === "connected" ? "Every system this app reads from: status, last sync and the period of data held. The app never writes to these systems (except report emails and drafts through Front)." : "Keys for other apps to read from Analytics. Read-only by default, scoped, with an expiry; shown once; revoke any time. Pay by person is never available through a key."} />
      {section === "connected" ? <Connected /> : <Keys admin={isAdminRole(me.role)} />}
    </WithSubNav>
  );
}

async function Connected() {
  const [statuses, sales, pnl, orders, lastImport, payRuns, tickets, bal, bills] = await Promise.all([
    getConnectionStatuses(),
    prisma.xeroSale.aggregate({ _min: { date: true }, _max: { date: true }, _count: true }),
    prisma.xeroPnl.aggregate({ _min: { month: true }, _max: { month: true } }),
    prisma.orderFact.aggregate({ _min: { date: true }, _max: { date: true }, _count: true }),
    prisma.volumeImport.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.payRun.aggregate({ _min: { paymentDate: true }, _max: { paymentDate: true }, _count: true }),
    prisma.frontTicketMonth.aggregate({ _min: { month: true }, _max: { month: true } }),
    prisma.xeroBalance.aggregate({ _min: { month: true }, _max: { month: true } }),
    prisma.xeroBill.aggregate({ _count: true }),
  ]);
  const st = (k: string) => statuses.find((s) => s.key === k);
  const tone = (s?: { state: string }) => (!s ? "grey" : s.state === "connected" ? "green" : s.state === "error" ? "red" : "grey");
  const rows: Array<{ name: string; what: string; state: React.ReactNode; last: string; period: string; manage: React.ReactNode }> = [
    { name: "Xero (accounting)", what: `Accounts, contacts, sales ${sales._count ? `(${sales._count.toLocaleString("en-AU")})` : ""}, P&L, balance sheet, bills ${bills._count ? `(${bills._count})` : ""}`, state: <Pill tone={tone(st("xero"))}>{st("xero")?.state ?? "not set up"}</Pill>, last: st("xero")?.headline ?? "—", period: sales._min.date ? `sales ${ad(sales._min.date)} → ${ad(sales._max.date)} · P&L ${pnl._min.month ?? "—"} → ${pnl._max.month ?? "—"}${bal._min.month ? ` · balance sheet ${bal._min.month} → ${bal._max.month}` : ""}` : "no data yet", manage: <Link href="/settings?section=company">Settings → Company</Link> },
    { name: "Xero Payroll (AU)", what: "Employees, pay runs, payslips (hours, gross, super) — labour cost only", state: <Pill tone={payRuns._count ? "green" : "grey"}>{payRuns._count ? "reading" : "no data yet"}</Pill>, last: payRuns._max.paymentDate ? `last pay run ${ad(payRuns._max.paymentDate)}` : "—", period: payRuns._min.paymentDate ? `${ad(payRuns._min.paymentDate)} → ${ad(payRuns._max.paymentDate)}` : "—", manage: <Link href="/data?section=xero">Data sources → Xero</Link> },
    { name: "Front", what: "Ticket counts per client; sends report emails and drafts (the only write)", state: <Pill tone={tone(st("front"))}>{st("front")?.state ?? "not set up"}</Pill>, last: st("front")?.headline ?? "—", period: tickets._min.month ? `${tickets._min.month} → ${tickets._max.month}` : "—", manage: <Link href="/settings?section=company">Settings → Company</Link> },
    { name: "WMS files (Thomax, 3PLWMS, Logiwa)", what: "Orders and charge volumes by client, uploaded as files", state: <Pill tone={orders._count ? "green" : "grey"}>{orders._count ? "loaded" : "no files yet"}</Pill>, last: lastImport ? `last file ${au(lastImport.createdAt)} · ${lastImport.fileName}` : "—", period: orders._min.date ? `orders ${ad(orders._min.date)} → ${ad(orders._max.date)}` : "—", manage: <Link href="/data?section=wms">Data sources → WMS</Link> },
    { name: "Thomax API", what: "Automatic daily pull instead of files", state: <Pill tone="grey">waiting for Thomax</Pill>, last: "Needs the base address / cluster code, key method and query names (support@thomax.com)", period: "Ends 31/05/2027 — data kept as archive", manage: "—" },
    { name: "Claude (AI)", what: "Report summaries — figures only, never names of people", state: <Pill tone={tone(st("ai"))}>{st("ai")?.state ?? "not set up"}</Pill>, last: st("ai")?.headline ?? "—", period: "—", manage: <Link href="/data?section=ai">Data sources → AI</Link> },
    { name: "CLM (contracts & rates)", what: "Client rates, renewal dates, schedule of rates", state: <Pill tone="grey">not connected yet</Pill>, last: "Rates and renewal dates entered in Settings → Clients until then", period: "—", manage: <Link href="/data?section=contracts">Data sources → Contracts</Link> },
    { name: "Dyspatch", what: "Billing rates for the rate checks", state: <Pill tone="grey">export files</Pill>, last: "API details to come (Varun)", period: "—", manage: <Link href="/leakage?section=rates">Leakage → Rate checks</Link> },
  ];
  return (
    <>
      <Card title="Connected to">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>System</th>
                <th>Status</th>
                <th>Last</th>
                <th>Data held</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="sup">
                    {r.name}
                    <div className="meta small">{r.what}</div>
                  </td>
                  <td>{r.state}</td>
                  <td className="small">{r.last}</td>
                  <td className="small">{r.period}</td>
                  <td className="small">{r.manage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Ended connections" sub="When a system is switched off, its data stays here as an archive (read-only).">
        <p className="empty">None yet. Thomax ends 31/05/2027 — its history stays.</p>
      </Card>
    </>
  );
}

async function Keys({ admin }: { admin: boolean }) {
  const keys = await prisma.apiKey.findMany({ orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }] });
  const now = new Date();
  return (
    <>
      {admin ? (
        <Card title="New key" tone="hl">
          <NewKeyForm />
        </Card>
      ) : (
        <p className="meta">Only admins and the owner can create or revoke keys.</p>
      )}
      <Card title={`Keys · ${keys.filter((k) => !k.revokedAt).length} active`}>
        {!keys.length ? (
          <p className="empty">No keys yet.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>App</th>
                  <th>Key</th>
                  <th>Scopes</th>
                  <th>Expires</th>
                  <th>Last used</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const state = k.revokedAt ? "revoked" : k.expiresAt && k.expiresAt < now ? "expired" : "active";
                  return (
                    <tr key={k.id} className={state !== "active" ? "muted" : ""}>
                      <td className="sup">
                        {k.name}
                        <div className="meta small">by {k.createdBy} · {ad(k.createdAt)}</div>
                      </td>
                      <td>
                        <code className="small">{k.prefix}…</code>
                      </td>
                      <td className="small">{k.scopes.map((s) => SCOPES.find((x) => x.key === s)?.label ?? s).join(", ")}</td>
                      <td className="small">{k.expiresAt ? ad(k.expiresAt) : "never"}</td>
                      <td className="small">{k.lastUsedAt ? `${au(k.lastUsedAt)} · ${k.uses.toLocaleString("en-AU")} calls` : "never"}</td>
                      <td>
                        <Pill tone={state === "active" ? "green" : "grey"}>{state}</Pill>
                        {k.revokedAt && <div className="meta small">{k.revokedBy} · {ad(k.revokedAt)}</div>}
                      </td>
                      <td>{admin && state === "active" && <RevokeKey id={k.id} name={k.name} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="How other apps call it" sub="Base address: this app's address + /api/v1. Send the key as a Bearer token. Full list in docs/API.md in the repo.">
        <div className="formula small" style={{ fontFamily: "var(--mono)" }}>
          GET /api/v1/me · GET /api/v1/volumes?month=2026-09 · GET /api/v1/kpi?site=smi · GET /api/v1/leakage?status=open · GET /api/v1/costs?month=2026-09 · GET /api/v1/finance · GET /api/v1/improvements · POST /api/v1/tasks
          <br />
          Authorization: Bearer fa_live_…
        </div>
      </Card>
    </>
  );
}
