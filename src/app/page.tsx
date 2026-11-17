import Link from "next/link";
import { NotConnected } from "@/components/ui/not-connected";
import { ComboChart, Sparkline, TargetLine } from "@/components/charts/charts";
import { Card, EmptyState } from "@/components/ui/card";
import { leakageInputs } from "@/lib/leakage/inputs";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { requireUser } from "@/lib/auth/session";
import { buildInput, loadCostRun } from "@/lib/cost/load";
import { runEngine } from "@/lib/cost/engine";
import { prisma } from "@/lib/db";
import { addMonth, lastN, loadFinance, monthLabel } from "@/lib/finance/load";
import { isoWeek } from "@/lib/leakage/detect";
import { getRules } from "@/lib/model/store";
import { STAGES, TYPES } from "@/lib/rates/review";
import { loadBreakEven } from "@/lib/finance/breakeven-load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const aud = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }));
const pc = (v: number | null | undefined, dp = 1) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(dp)}%`);
const n0 = (v: number) => Math.round(v).toLocaleString("en-AU");
const au = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : "—");
const DAY = 86400000;

/**
 * Overview — the main dashboard (brief §5): five toggle cards (Services margin · Leakage found · Priced below cost ·
 * Orders · Break-even). Click → only that detail; click again → all. Always: Needs attention, Renewals and reviews.
 * Real figures only; a card without data says so.
 */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const card = (Array.isArray(sp.card) ? sp.card[0] : sp.card) ?? null;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const lastMonth = addMonth(today.toISOString().slice(0, 7), -1);
  const [run, rules, leaks, clients, tasks, reviews, fin, ordersByMonth, ordersByDay] = await Promise.all([
    loadCostRun(lastMonth),
    getRules(),
    prisma.leakageItem.findMany({ where: { status: { in: ["OPEN", "TASK"] } }, orderBy: { gap: "desc" } }),
    prisma.client.findMany({ select: { id: true, name: true, renewalDate: true, status: true } }),
    prisma.task.findMany({ where: { status: "OPEN", createdAt: { lt: new Date(today.getTime() - 7 * DAY) } }, orderBy: { createdAt: "asc" }, take: 20 }),
    prisma.rateReview.findMany({ where: { closed: false }, orderBy: { due: "asc" } }),
    loadFinance(),
    prisma.$queryRaw<Array<{ m: string; n: number }>>`SELECT to_char(date, 'YYYY-MM') AS m, count(*)::int AS n FROM "OrderFact" WHERE date >= ${new Date(addMonth(lastMonth, -11) + "-01T00:00:00Z")} AND date < ${new Date(addMonth(lastMonth, 1) + "-01T00:00:00Z")} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ d: Date; n: number }>>`SELECT date AS d, count(*)::int AS n FROM "OrderFact" WHERE date >= ${new Date(today.getTime() - 21 * DAY)} AND date < ${today} GROUP BY 1`,
  ]);
  const cn = (id: string) => clients.find((c) => c.id === id)?.name ?? "?";
  const res = run.result;
  const floor = rules.marginFloor ?? 0.15;

  // 1 Services margin (cost engine, last month): processing revenue vs cost, both variants
  const hasMargin = res.totals.revenue > 0;
  const marginT = hasMargin ? (res.totals.revenue - res.totals.costT) / res.totals.revenue : null;
  const marginF = hasMargin ? (res.totals.revenue - res.totals.costF) / res.totals.revenue : null;
  const trendMonths = (run.months.filter((m) => m <= lastMonth).slice(0, 12)).reverse();
  const trend = await Promise.all(
    trendMonths.map(async (m) => {
      if (m === run.month) return { m, v: marginT };
      const r = runEngine((await buildInput(m)).input);
      return { m, v: r.totals.revenue ? (r.totals.revenue - r.totals.costT) / r.totals.revenue : null };
    }),
  );

  // 2 Leakage, 3 below cost
  const leakOpen = leaks.reduce((a, l) => a + Number(l.gap), 0);
  const below = res.clients.flatMap((c) => c.lines.filter((l) => l.rate != null && l.rate < l.unitT).map((l) => ({ c, l, gap: (l.unitT - l.rate!) * l.qty }))).sort((a, b) => b.gap - a.gap);
  const belowTot = below.reduce((a, x) => a + x.gap, 0);

  // 4 Orders
  const om = new Map(ordersByMonth.map((r) => [r.m, r.n]));
  const months12 = Array.from({ length: 12 }, (_, i) => addMonth(lastMonth, i - 11));
  const oLast = om.get(lastMonth) ?? null;
  const oPrev = om.get(addMonth(lastMonth, -1)) ?? null;
  const wk = (d: Date) => isoWeek(d);
  const thisWeek = wk(new Date(today.getTime() - 7 * DAY));
  const prevWeek = wk(new Date(today.getTime() - 14 * DAY));
  const wkSum = (w: string) => ordersByDay.filter((r) => wk(r.d) === w).reduce((a, r) => a + r.n, 0);

  // 5 Break-even (standard cost-behaviour method, batch 3; Xero P&L last 3 months, high-low over 12)
  const fin3 = lastN(fin.months, 3, fin.current);
  const orders3 = fin3.map((m) => om.get(m.month) ?? 0);
  const be = fin3.length && fin.current ? await loadBreakEven(fin.current, fin3.map((m) => m.month), orders3.every((x) => x > 0) ? orders3.reduce((a, b) => a + b, 0) / orders3.length : null) : null;
  const fin12 = lastN(fin.months, 12, fin.current);

  const tile = (k: string, l: string, v: string, s: React.ReactNode, tone = "", spark?: Array<number | null>) => (
    <Link href={card === k ? "/" : `/?card=${k}`} className={"kpi clickable " + tone + (card === k ? " on" : "")} aria-pressed={card === k} scroll={false}>
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className="s">{s}</div>
      {spark && <Sparkline values={spark} />}
    </Link>
  );
  const show = (k: string) => !card || card === k;
  const renewals = clients.filter((c) => c.renewalDate && c.status !== "INACTIVE" && c.renewalDate.getTime() - today.getTime() <= 90 * DAY && c.renewalDate >= new Date(today.getTime() - 30 * DAY)).sort((a, b) => a.renewalDate!.getTime() - b.renewalDate!.getTime());
  const soon = renewals.filter((c) => c.renewalDate!.getTime() - today.getTime() <= 60 * DAY);

  const li = await leakageInputs();
  const leakKnown = li.canDetect || leaks.length > 0;
  const belowKnown = li.hasRates && hasMargin;
  return (
    <div className="page">
      <PageHeader title="Overview" subtitle={`${monthLabel(run.month)} · click a card for its detail; click it again for everything.`} />
      <div className="kpis tabtiles ovtiles">
        {tile("margin", "Services margin · TDABC", hasMargin ? pc(marginT) : "no data yet", hasMargin ? <>Full absorption {pc(marginF)} · floor {pc(floor, 0)}</> : "needs volumes + Xero revenue", marginT != null && marginT < floor ? "red" : "", trend.map((t) => t.v))}
        {tile("leakage", "Leakage found · open", leakKnown ? aud(leakOpen) : "no data yet", leakKnown ? `${leaks.length} findings to bill or explain` : `needs ${li.missing}`, leaks.length ? "red" : "")}
        {tile("below", "Priced below cost", belowKnown ? aud(belowTot) : "no data yet", !belowKnown ? "needs client rates, volumes and Xero revenue" : below.length ? `${below.length} client services a month` : "no rated services below cost", below.length ? "red" : "")}
        {tile("orders", `Orders · ${monthLabel(lastMonth)}`, oLast != null ? n0(oLast) : "no data yet", oLast != null && oPrev ? <span className={oLast >= oPrev ? "delta-pos" : "delta-neg"}>{oLast >= oPrev ? "▲" : "▼"} {pc(Math.abs(oLast - oPrev) / oPrev)} vs last month</span> : "load WMS orders in Data sources", "", months12.map((m) => om.get(m) ?? null))}
        {tile("breakeven", "Break-even · revenue / month", be?.beRevenue != null ? aud(be.beRevenue) : "no data yet", be?.headroom != null ? <span className={be.headroom >= 0 ? "delta-pos" : "delta-neg"}>{be.headroom >= 0 ? `${aud(be.headroom)} above` : `${aud(-be.headroom)} below`} · {be.beOrders != null ? `${n0(be.beOrders)} orders` : "orders n/a"}</span> : "needs the Xero P&L", be?.headroom != null && be.headroom < 0 ? "red" : "")}
      </div>

      {show("margin") && (
        <Card title="Services margin" sub="Processing revenue (Xero) vs cost to serve (TDABC). 12-month trend and margin by client, last month.">
          {hasMargin ? (
            <>
              <TargetLine values={trend.map((t) => t.v)} labels={trend.map((t) => monthLabel(t.m))} target={floor} fmt={(v) => pc(v, 0)} h={170} />
              {[...res.clients]
                .filter((c) => c.marginT != null)
                .sort((a, b) => (a.marginT ?? 0) - (b.marginT ?? 0))
                .slice(0, card === "margin" ? 50 : 8)
                .map((c) => (
                  <div key={c.id} className="catbar" style={{ gridTemplateColumns: "180px minmax(0,1fr) 70px" }}>
                    <Link href={`/cost?section=serve&panel=client:${c.id}`} className="small lnk">
                      {c.name}
                    </Link>
                    <span className="track">
                      <i style={{ width: `${Math.max(0, Math.min(1, (c.marginT ?? 0) / 0.6)) * 100}%`, background: (c.marginT ?? 0) < 0 ? "var(--red)" : (c.marginT ?? 0) < floor ? "var(--amber-line)" : undefined }} />
                    </span>
                    <span className="num small">{pc(c.marginT)}</span>
                  </div>
                ))}
              <p className="meta">Lowest margins first. Full detail in <Link href="/cost?section=serve">Cost & margin → Cost to serve</Link>.</p>
            </>
          ) : (
            <p className="empty">Needs WMS volumes, Xero revenue and the cost model (Settings) for {monthLabel(run.month)}.</p>
          )}
        </Card>
      )}
      {show("leakage") && (
        <Card title={leakKnown ? `Open leakage · ${aud(leakOpen)}` : "Open leakage · no data yet"} sub="Biggest first. Recovered money is ≈ 100% profit — the work was already done.">
          {leaks.length ? (
            <div className="tw">
              <table>
                <tbody>
                  {leaks.slice(0, card === "leakage" ? 50 : 5).map((l) => (
                    <tr key={l.id}>
                      <td className="sup">
                        <Link href={`/leakage?section=log&panel=leak:${l.id}`} className="lnk">
                          {cn(l.clientId)}
                        </Link>
                      </td>
                      <td className="small">
                        {l.serviceCode ?? l.kind.toLowerCase().replace("_", " ")} · {l.period}
                      </td>
                      <td className="r num">{aud(Number(l.gap))}</td>
                      <td className="small meta">{Math.floor((today.getTime() - l.foundOn.getTime()) / DAY)} d old</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">Nothing open.</p>
          )}
        </Card>
      )}
      {show("below") && (
        <Card title={belowKnown ? `Priced below cost · ${aud(belowTot)} a month` : "Priced below cost · no data yet"} sub="Client rate below the TDABC unit cost — candidates for a rate review.">
          {below.length ? (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Service</th>
                    <th className="r">Rate</th>
                    <th className="r">Cost</th>
                    <th className="r">Gap / month</th>
                  </tr>
                </thead>
                <tbody>
                  {below.slice(0, card === "below" ? 50 : 5).map((x) => (
                    <tr key={x.c.id + x.l.code}>
                      <td className="sup">
                        <Link href={`/cost?section=serve&panel=line:${x.c.id}|${x.l.code}`} className="lnk">
                          {x.c.name}
                        </Link>
                      </td>
                      <td className="small">{x.l.name}</td>
                      <td className="r num">${x.l.rate!.toFixed(2)}</td>
                      <td className="r num delta-neg">${x.l.unitT.toFixed(2)}</td>
                      <td className="r num">{aud(x.gap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No rated services below cost{run.input.clients.some((c) => Object.keys(c.rates).length) ? "" : " — no client rates yet (Settings → Clients)"}.</p>
          )}
        </Card>
      )}
      {show("orders") && (
        <Card title="Orders" sub="12 months, and the last full week against the week before.">
          {om.size ? (
            <>
              <ComboChart data={months12.map((m) => ({ label: monthLabel(m), bar: om.get(m) ?? null, line: null }))} barLabel="Orders" lineLabel="" h={190} money={false} />
              <p className="small">
                Week {thisWeek}: <strong>{n0(wkSum(thisWeek))}</strong> orders · week {prevWeek}: {n0(wkSum(prevWeek))}
                {wkSum(prevWeek) > 0 && (
                  <span className={wkSum(thisWeek) >= wkSum(prevWeek) ? "delta-pos" : "delta-neg"}>
                    {" "}
                    ({wkSum(thisWeek) >= wkSum(prevWeek) ? "▲" : "▼"} {pc(Math.abs(wkSum(thisWeek) - wkSum(prevWeek)) / wkSum(prevWeek))})
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="empty">No WMS orders loaded yet (Data sources → WMS).</p>
          )}
        </Card>
      )}
      {show("breakeven") && (
        <Card title="Break-even" sub="Standard cost-behaviour method: cost of services (incl. postage, re-billed with a mark-up) variable; overheads, depreciation and interest fixed; semi-variable accounts split by high-low over 12 months; set any account in Settings → Mapping. Averages of the last 3 months of the Xero P&L.">
          {be ? (
            <>
              <ComboChart data={fin12.map((m) => ({ label: monthLabel(m.month), bar: m.revenue, line: be.beRevenue && m.revenue ? (m.revenue - be.beRevenue) / m.revenue : null }))} barLabel="Revenue" lineLabel="Margin of safety % (above break-even)" h={190} />
              <div className="formula">
                Contribution margin = (revenue {aud(be.revenue)} − variable costs {aud(be.variable)}) ÷ revenue = <strong>{pc(be.cmPct)}</strong>
                <br />
                Break-even revenue = fixed costs {aud(be.fixed)} ÷ {pc(be.cmPct)} = <strong>{aud(be.beRevenue)}</strong> a month
                <br />
                {be.revenuePerOrder != null ? (
                  <>
                    Break-even orders = {aud(be.beRevenue)} ÷ revenue per order ${be.revenuePerOrder.toFixed(2)} = <strong>{be.beOrders != null ? n0(be.beOrders) : "—"}</strong> orders a month (now {be.orders != null ? n0(be.orders) : "—"})
                  </>
                ) : (
                  "Break-even in orders needs WMS orders for the same months."
                )}
                {be.semi.length > 0 && (
                  <>
                    <br />
                    Semi-variable (high-low):{" "}
                    {be.semi.map((x) => `${x.account}: ${aud(x.fixed)} fixed + ${aud(x.variable)} variable${x.note !== "high-low" ? ` (${x.note})` : ""}`).join(" · ")}
                  </>
                )}
                {be.overridden > 0 && (
                  <>
                    <br />
                    {be.overridden} account{be.overridden === 1 ? "" : "s"} set by hand in Settings → Mapping.
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="empty">Needs the Xero P&L (Data sources → Xero, full re-read).</p>
          )}
        </Card>
      )}

      <div className="grid2">
        <Card title="Needs attention" tone={leaks.length || soon.length || tasks.length ? "warn" : "normal"}>
          <ul className="attn">
            <li>
              {leakKnown ? (
                <>
                  <Link href="/leakage?section=log">{leaks.length} open leakage findings</Link> · {aud(leakOpen)}
                </>
              ) : (
                <>Leakage: no data yet — needs {li.missing}</>
              )}
            </li>
            <li>
              {soon.length} renewal{soon.length === 1 ? "" : "s"} in the next 60 days{soon.length ? ": " : ""}
              {soon.map((c, i) => (
                <span key={c.id}>
                  {i ? ", " : ""}
                  <Link href={`/settings?section=clients&panel=client:${c.id}`}>{c.name}</Link> ({au(c.renewalDate)})
                </span>
              ))}
            </li>
            <li>
              <Link href="/tasks">{tasks.length} tasks open 7+ days</Link>
              {tasks.slice(0, 3).map((t) => (
                <div key={t.id} className="meta small">
                  · {t.title}
                </div>
              ))}
            </li>
          </ul>
        </Card>
        <Card title="Renewals and reviews" sub={<>Contract renewals in the next 90 days and rate reviews in progress. <NotConnected source="clm" until="renewal dates in Settings → Clients" /></>}>
          {!renewals.length && !reviews.length ? (
            <p className="empty">None — renewal dates come from CLM once connected (Settings → Clients until then).</p>
          ) : (
            <div className="tw">
              <table>
                <tbody>
                  {renewals.map((c) => (
                    <tr key={"r" + c.id}>
                      <td>
                        <Pill tone="green">renewal</Pill>
                      </td>
                      <td className="sup">{c.name}</td>
                      <td className={c.renewalDate! < today ? "msg-err" : ""}>{au(c.renewalDate)}</td>
                    </tr>
                  ))}
                  {reviews.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Pill tone="blue">{TYPES[r.type as keyof typeof TYPES]?.[0] ?? r.type}</Pill>
                      </td>
                      <td className="sup">
                        <Link href={`/cost?section=workbench&client=${r.clientId}&review=${r.id}`} className="lnk">
                          {cn(r.clientId)}
                        </Link>
                        <div className="meta small">{STAGES[r.stage] ?? ""}{r.owner ? ` · ${r.owner}` : ""}</div>
                      </td>
                      <td className={r.due && r.due < today ? "msg-err" : ""}>{au(r.due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {!hasMargin && !om.size && !fin.months.length && <EmptyState title="No data yet">The dashboard shows real figures only. It fills in as Xero, WMS orders and the cost model are set up.</EmptyState>}
    </div>
  );
}
