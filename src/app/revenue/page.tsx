import Link from "next/link";
import { Card, EmptyState } from "@/components/ui/card";
import { Drawer, DrawerHeader } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { parsePanel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { parseSection } from "@/components/ui/sections";
import { WithSubNav } from "@/components/ui/sub-nav";
import { CaseForm, type CaseValues } from "@/components/revenue/case-form";
import { requireUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { CASE_KINDS, caseResult, isProvisional, periods, summarise, type CaseIn } from "@/lib/revenue/summary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revenue protection" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const aud = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }));
const au = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
const kindLabel = (k: string) => CASE_KINDS.find(([x]) => x === k)?.[1] ?? k;

/**
 * Revenue protection (batch 4, 16/11/2026): Mark's weekly figure — cost avoided, leakage recovered and losses —
 * and the case log behind it (cost avoided, losses not prevented, recoveries), each with a CAR number when one exists.
 */
export default async function RevenuePage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const sp = await searchParams;
  const section = parseSection("revenue", sp.section);
  const admin = isAdminRole(me.role);
  const [cases, clients, recovered, improvements] = await Promise.all([
    prisma.revenueCase.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    prisma.client.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true } }),
    prisma.leakageItem.findMany({ where: { status: "RECOVERED", recoveredOn: { not: null } }, select: { recoveredOn: true, recoveredAmount: true, gap: true } }),
    prisma.improvement.findMany({ where: { stage: "VERIFIED" }, select: { name: true, measuredMonthly: true, estMonthly: true } }),
  ]);
  const cn = (c: { clientId: string | null; clientName: string | null }) => clients.find((x) => x.id === c.clientId)?.shortName || clients.find((x) => x.id === c.clientId)?.name || c.clientName || "—";
  const ins: CaseIn[] = cases.map((c) => ({ date: c.date, kind: c.kind, amountBefore: c.amountBefore == null ? null : Number(c.amountBefore), amountAfter: c.amountAfter == null ? null : Number(c.amountAfter), pending: c.pending, status: c.status }));
  const panel = parsePanel(sp.panel);
  const sel = panel?.kind === "case" ? cases.find((c) => c.id === panel.id) : undefined;
  const toValues = (c?: (typeof cases)[number]): CaseValues => ({
    id: c?.id,
    // New case: today in Sydney (not UTC, which is yesterday before 11:00)
    date: c ? c.date.toISOString().slice(0, 10) : new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date()),
    clientId: c?.clientId ?? "",
    clientName: c?.clientName ?? "",
    title: c?.title ?? "",
    kind: c?.kind ?? "COST_AVOIDED",
    whatHappened: c?.whatHappened ?? "",
    amountBefore: c?.amountBefore?.toString() ?? "",
    amountAfter: c?.amountAfter?.toString() ?? "",
    pending: c?.pending ?? "",
    status: c?.status ?? "OPEN",
    stoppedBy: c?.stoppedBy ?? "",
    carNumber: c?.carNumber ?? "",
    lessons: c?.lessons ?? "",
  });
  const clientOpts: Array<[string, string]> = clients.map((c) => [c.id, c.shortName || c.name]);

  return (
    <WithSubNav page="revenue" current={section}>
      <PageHeader title="Revenue protection" subtitle={section === "cases" ? "Every case: what happened, what it would have cost, what it cost, and the lesson. Amounts not known yet stay empty — never guessed." : "Money protected: cost avoided + leakage recovered − losses not prevented. The weekly figure for Mark."} />
      {section === "overview" ? <Overview ins={ins} recovered={recovered} improvements={improvements} /> : <Cases cases={cases} cn={cn} />}
      {section === "cases" && admin && (
        <Card title="Add a case">
          <CaseForm v={toValues()} clients={clientOpts} canEdit />
        </Card>
      )}
      {sel && (
        <Drawer label="Case">
          <DrawerHeader kicker={`${kindLabel(sel.kind)} · ${au(sel.date)}`} title={sel.title} />
          <div className="formula">
            {cn(sel)} · result <strong>{aud(caseResult(ins[cases.indexOf(sel)]))}</strong>
            {isProvisional(sel) && <span className="meta"> + parts still to confirm ({sel.pending})</span>}
            {sel.pending ? ` · still to confirm: ${sel.pending}` : ""}
            {sel.carNumber ? ` · CAR ${sel.carNumber}` : ""}
          </div>
          <CaseForm v={toValues(sel)} clients={clientOpts} canEdit={admin} />
        </Drawer>
      )}
    </WithSubNav>
  );
}

function Overview({ ins, recovered, improvements }: { ins: CaseIn[]; recovered: Array<{ recoveredOn: Date | null; recoveredAmount: unknown; gap: unknown }>; improvements: Array<{ name: string; measuredMonthly: unknown; estMonthly: unknown }> }) {
  const p = periods(new Date());
  // Only recovered amounts actually entered count; a recovery with no amount is counted separately, never assumed = the gap
  const inP = (from: Date, to: Date) => recovered.filter((r) => r.recoveredOn && r.recoveredOn >= from && r.recoveredOn < to);
  const rec = (from: Date, to: Date) => inP(from, to).reduce((a, r) => a + (r.recoveredAmount == null ? 0 : Number(r.recoveredAmount)), 0);
  const noAmt = (from: Date, to: Date) => inP(from, to).filter((r) => r.recoveredAmount == null).length;
  const rows = (["week", "month", "fy"] as const).map((k) => ({ k, label: p[k].label, s: summarise(ins, rec(p[k].from, p[k].to), p[k].from, p[k].to, noAmt(p[k].from, p[k].to)) }));
  const monthlySavings = improvements.reduce((a, i) => a + Number(i.measuredMonthly ?? 0), 0);
  return (
    <>
      <div className="kpis">
        {rows.map(({ k, label, s }) => (
          <div key={k} className={"kpi" + (s.protectedNet < 0 ? " red" : "")}>
            <div className="l">Protected · {label}</div>
            <div className="v">{s.provisional ? `≈ ${aud(s.protectedNet)}` : aud(s.protectedNet)}</div>
            <div className="s">
              {s.cases} cases{s.provisional ? ` · ${s.provisional} provisional (parts still to confirm aren't counted yet)` : ""}
              {s.noResult ? ` · ${s.noResult} without figures` : ""}
              {s.recoveredNoAmount ? ` · ${s.recoveredNoAmount} leakage recoveries with no amount entered (not counted)` : ""}
            </div>
          </div>
        ))}
      </div>
      <Card title="How it adds up" sub="Cost avoided and recovered add; losses not prevented subtract. Provisional = a figure is still to confirm (see the case).">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th className="r">Cost avoided</th>
                <th className="r">Recovered (cases)</th>
                <th className="r">Leakage recovered</th>
                <th className="r">Losses</th>
                <th className="r">Protected</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ k, label, s }) => (
                <tr key={k}>
                  <td>{label}</td>
                  <td className="r num">{aud(s.avoided)}</td>
                  <td className="r num">{aud(s.recoveredCases)}</td>
                  <td className="r num">
                    <Link href="/leakage?section=log" className="lnk">
                      {aud(s.recoveredLeakage)}
                    </Link>
                  </td>
                  <td className="r num delta-neg">{aud(s.losses)}</td>
                  <td className="r num">
                    <strong>{aud(s.protectedNet)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Ongoing savings (separate)" sub="Verified improvements save every month — a rate, so they're shown here, not added to the one-off figures above.">
        {improvements.length ? (
          <p className="small" style={{ margin: 0 }}>
            {improvements.length} verified improvement{improvements.length === 1 ? "" : "s"}: <strong>{aud(monthlySavings)}</strong> a month measured.{" "}
            <Link href="/improve" className="lnk">
              Improvements & savings
            </Link>
          </p>
        ) : (
          <p className="empty">No verified improvements yet.</p>
        )}
      </Card>
    </>
  );
}

function Cases({ cases, cn }: { cases: Awaited<ReturnType<typeof prisma.revenueCase.findMany>>; cn: (c: { clientId: string | null; clientName: string | null }) => string }) {
  if (!cases.length) return <EmptyState title="No cases yet">Add the first case below.</EmptyState>;
  return (
    <Card title={`Cases · ${cases.length}`} sub="Click a case to see and edit it.">
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Case</th>
              <th>Kind</th>
              <th className="r">Result</th>
              <th>Status</th>
              <th>CAR</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => {
              const r = caseResult({ amountBefore: c.amountBefore == null ? null : Number(c.amountBefore), amountAfter: c.amountAfter == null ? null : Number(c.amountAfter) });
              return (
                <tr key={c.id}>
                  <td>{au(c.date)}</td>
                  <td>{cn(c)}</td>
                  <td>
                    <Link href={`/revenue?section=cases&panel=case:${c.id}`} className="lnk" scroll={false}>
                      {c.title}
                    </Link>
                    {c.pending && <div className="meta small">to confirm: {c.pending}</div>}
                  </td>
                  <td>
                    <Pill tone={c.kind === "LOSS" ? "red" : "green"}>{kindLabel(c.kind)}</Pill>
                  </td>
                  <td className={"r num" + (r != null && r < 0 ? " delta-neg" : "")} title={isProvisional(c) ? `Provisional — still to confirm: ${c.pending}` : undefined}>
                    {r == null ? "no figure yet" : isProvisional(c) ? `${aud(r)} + TBC` : aud(r)}
                  </td>
                  <td>{c.status === "CLOSED" ? <Pill tone="grey">closed</Pill> : <Pill tone="amber">open</Pill>}</td>
                  <td>{c.carNumber ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
