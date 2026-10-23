import Link from "next/link";
import { ComboChart, Gauge, Sparkline, TargetLine, Waterfall } from "@/components/charts/charts";
import { AddDebt, DeleteDebt } from "@/components/finance/debt";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { parseSection } from "@/components/ui/sections";
import { WithSubNav } from "@/components/ui/sub-nav";
import { requireUser } from "@/lib/auth/session";
import { AGE_BUCKETS, LINE_LABEL, cashBridge, fyOf, gaugeTone, ratios, sumMonths, type Line, type Month } from "@/lib/finance/calc";
import { aged, concentration, lastN, loadFinance, monthLabel, ratiosAt, type FinanceData } from "@/lib/finance/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance" };

const aud = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : x.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }));
const pc = (x: number | null | undefined, dp = 1) => (x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(dp)}%`);
const xx = (x: number | null | undefined, dp = 2) => (x == null || !Number.isFinite(x) ? "—" : `${x.toFixed(dp)}×`);
const dd = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : `${Math.round(x)} days`);
const chg = (a: number | null, b: number | null, money = true) => {
  if (a == null || b == null || !b) return <span className="meta">no last year yet</span>;
  const d = money ? (a - b) / Math.abs(b) : a - b;
  return (
    <span className={d >= 0 ? "delta-pos" : "delta-neg"}>
      {d >= 0 ? "▲" : "▼"} {money ? pc(Math.abs(d)) : `${(Math.abs(d) * 100).toFixed(1)} pts`} vs last year
    </span>
  );
};

/** Finance (brief §9b): company totals for management and the bank, from Xero (read-only). */
export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const section = parseSection("finance", sp.section);
  const d = await loadFinance();
  const sub: Record<string, string> = {
    overview: "Company totals from Xero. Click a card for its detail; click again for everything.",
    pl: "Profit & loss by month from Xero, with the year before. Rows open to the Xero accounts.",
    cash: "Where the cash went this month, debt service and the debt schedule.",
    wc: "Debtor and creditor days, aged receivables and payables. Read-only — chasing stays in the Accounts Hub.",
    clients: "How much of revenue depends on the biggest clients. Names hidden by default (as in bank reports).",
    bank: "What goes to the bank, what's ready and what's missing. Sent from Reports as an External finance report, after approval.",
  };
  const noData = !d.months.length && section !== "bank";
  return (
    <WithSubNav page="finance" current={section}>
      <PageHeader title="Finance" subtitle={sub[section]} />
      {noData ? (
        <EmptyState title="No Xero P&L yet">Connect Xero and run a full re-read in Data sources → Accounting · Xero. Nothing here is estimated.</EmptyState>
      ) : section === "overview" ? (
        <Overview d={d} card={one("card") ?? null} fc={one("fc") === "1"} />
      ) : section === "pl" ? (
        <PL d={d} pct={one("pc") === "1"} open={one("open") ?? null} />
      ) : section === "cash" ? (
        <Cash d={d} />
      ) : section === "wc" ? (
        <WorkingCapital d={d} />
      ) : section === "clients" ? (
        <Clients show={one("names") === "1"} />
      ) : (
        <BankPack d={d} />
      )}
    </WithSubNav>
  );
}

function series(d: FinanceData, n: number, f: (m: Month) => number | null) {
  return lastN(d.months, n, d.current).map(f);
}
const gm = (m: Month) => (m.revenue ? m.gross / m.revenue : null);
const em = (m: Month) => (m.revenue ? m.ebitda / m.revenue : null);

function Overview({ d, card, fc }: { d: FinanceData; card: string | null; fc: boolean }) {
  const cur = d.months.find((m) => m.month === d.current)!;
  const ly = d.months.find((m) => m.month === `${Number(d.current!.slice(0, 4)) - 1}${d.current!.slice(4)}`) ?? null;
  const bal = d.bal.find((b) => b.month === d.current) ?? null;
  const balLy = d.bal.find((b) => b.month === ly?.month) ?? null;
  const r = ratiosAt(d, d.current);
  const rLy = ly ? ratiosAt(d, ly.month) : null;
  const dscrSeries = lastN(d.months, 12, d.current).map((m) => ratiosAt(d, m.month).dscr);
  const tile = (k: string, l: string, v: string, s: React.ReactNode, spark: Array<number | null>) => (
    <Link href={card === k ? "/finance" : `/finance?card=${k}${fc ? "&fc=1" : ""}`} className={"kpi clickable" + (card === k ? " on" : "")} aria-pressed={card === k} scroll={false}>
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className="s">{s}</div>
      <Sparkline values={spark} />
    </Link>
  );
  const last24 = lastN(d.months, 24, d.current);
  const combo = [...last24.map((m) => ({ label: monthLabel(m.month), bar: m.revenue, line: em(m) })), ...(fc && d.forecast ? d.forecast.map((f) => ({ label: monthLabel(f.month), bar: f.value, line: null, forecast: true })) : [])];
  return (
    <>
      <div className="kpis tabtiles ovtiles">
        {tile("rev", `Revenue · ${monthLabel(d.current!)}`, aud(cur.revenue), chg(cur.revenue, ly?.revenue ?? null), series(d, 12, (m) => m.revenue))}
        {tile("gm", "Gross margin", pc(gm(cur)), chg(gm(cur), ly ? gm(ly) : null, false), series(d, 12, gm))}
        {tile("ebitda", "EBITDA margin", pc(em(cur)), chg(em(cur), ly ? em(ly) : null, false), series(d, 12, em))}
        {tile("cash", "Cash at bank", bal ? aud(bal.cash) : "no data yet", bal ? chg(bal.cash, balLy?.cash ?? null) : "balance sheet not synced", lastN(d.months, 12, d.current).map((m) => d.bal.find((b) => b.month === m.month)?.cash ?? null))}
        {tile("dscr", "DSCR · 12 months", xx(r.dscr), r.dscr == null ? (d.debts.length ? "needs 12 months of P&L" : "add the debt schedule (Cash & debt)") : <span className={r.dscr >= 1.25 ? "delta-pos" : "delta-neg"}>min 1.25× · last year {xx(rLy?.dscr)}</span>, dscrSeries)}
      </div>
      {card === "rev" && <AccountsCard d={d} lines={["revenue", "other"]} title="Revenue · 24 months" />}
      {card === "gm" && (
        <Card title="Gross margin · 24 months" sub="Revenue − cost of services (Xero direct-cost accounts), as % of revenue.">
          <TargetLine values={last24.map(gm)} labels={last24.map((m) => monthLabel(m.month))} fmt={(v) => pc(v, 0)} />
          <AccountsTable d={d} lines={["cos"]} months={last24.slice(-12)} />
        </Card>
      )}
      {card === "ebitda" && (
        <Card title="EBITDA margin · 24 months" sub="Earnings before interest, tax, depreciation and amortisation, as % of revenue.">
          <TargetLine values={last24.map(em)} labels={last24.map((m) => monthLabel(m.month))} fmt={(v) => pc(v, 0)} />
          <AccountsTable d={d} lines={["overheads"]} months={last24.slice(-12)} />
        </Card>
      )}
      {card === "cash" && <Cash d={d} only="flow" />}
      {card === "dscr" && <DscrCard d={d} />}
      {!card && (
        <>
          <Card title="Revenue and EBITDA margin · 24 months" sub={d.forecast ? undefined : "Forecast needs 24 months of P&L — not loaded yet."}>
            <div className="row small" style={{ justifyContent: "flex-end" }}>
              {d.forecast && (
                <Link className={"btn" + (fc ? " on" : "")} href={fc ? "/finance" : "/finance?fc=1"} scroll={false}>
                  {fc ? "✓ " : ""}Include 6-month forecast
                </Link>
              )}
            </div>
            <ComboChart data={combo} barLabel="Revenue" lineLabel="EBITDA %" />
          </Card>
          <Card title={`P&L waterfall · ${monthLabel(d.current!)}`} sub="Revenue → cost of services → overheads → EBITDA → depreciation & interest → net profit.">
            <Waterfall
              steps={[
                { label: "Revenue", value: cur.revenue + cur.other, kind: "start" },
                { label: "Cost of services", value: -cur.cos, kind: "step" },
                { label: "Overheads", value: -cur.overheads, kind: "step" },
                { label: "EBITDA", value: cur.ebitda, kind: "sub" },
                { label: "Depreciation", value: -cur.dep, kind: "step" },
                { label: "Interest & tax", value: -(cur.interest + cur.tax), kind: "step" },
                { label: "Net profit", value: cur.net, kind: "end" },
              ]}
            />
          </Card>
          <Gauges d={d} />
        </>
      )}
    </>
  );
}

function Gauges({ d }: { d: FinanceData }) {
  const r = ratiosAt(d, d.current);
  return (
    <Card title="Bank health" sub="Last 12 months. Lines show what banks usually look for.">
      <div className="gauges">
        <Gauge label="DSCR" value={r.dscr} display={xx(r.dscr)} min={0} max={3} mark={1.25} markLabel="1.25×" tone={gaugeTone("dscr", r.dscr)} note={r.dscr == null ? "needs 12 months of P&L and the debt schedule" : "EBITDA ÷ (principal + interest)"} />
        <Gauge label="Debt / EBITDA" value={r.debtToEbitda} display={xx(r.debtToEbitda, 1)} min={0} max={5} mark={2.5} markLabel="2.5×" tone={gaugeTone("debt", r.debtToEbitda)} note={r.debtToEbitda == null ? "needs debt balances and 12 months" : "below 2.5× is comfortable"} />
        <Gauge label="Current ratio" value={r.currentRatio} display={xx(r.currentRatio)} min={0} max={3} mark={1.2} markLabel="1.2" tone={gaugeTone("current", r.currentRatio)} note={r.currentRatio == null ? "needs the balance sheet from Xero" : "current assets ÷ current liabilities"} />
      </div>
    </Card>
  );
}

function DscrCard({ d }: { d: FinanceData }) {
  const ms = lastN(d.months, 24, d.current);
  const t = sumMonths(lastN(d.months, 12, d.current));
  const r = ratiosAt(d, d.current);
  return (
    <Card title="DSCR · debt service cover" sub="Rolling 12 months. Banks usually want at least 1.25×.">
      <TargetLine values={ms.map((m) => ratiosAt(d, m.month).dscr)} labels={ms.map((m) => monthLabel(m.month))} target={1.25} fmt={(v) => xx(v, 2)} />
      <div className="formula">
        EBITDA (12 months) {aud(t.ebitda)} ÷ (principal {aud(d.principal12)} + interest {aud(t.interest)}) = <strong>{xx(r.dscr)}</strong>
        <br />
        Principal from the debt schedule (Cash & debt) · interest and EBITDA from the Xero P&L.
      </div>
    </Card>
  );
}

function AccountsTable({ d, lines, months }: { d: FinanceData; lines: Line[]; months: Month[] }) {
  const accs = d.accounts.filter((a) => lines.includes(a.line)).map((a) => ({ ...a, tot: months.reduce((s, m) => s + (a.byMonth[m.month] ?? 0), 0) })).filter((a) => a.tot).sort((a, b) => b.tot - a.tot);
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            <th>Xero account</th>
            <th>12 months</th>
            <th className="r">Total</th>
          </tr>
        </thead>
        <tbody>
          {accs.map((a) => (
            <tr key={a.id}>
              <td className="sup">{a.name}</td>
              <td>
                <Sparkline values={months.map((m) => a.byMonth[m.month] ?? 0)} w={140} />
              </td>
              <td className="r num">{aud(a.tot)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function AccountsCard({ d, lines, title }: { d: FinanceData; lines: Line[]; title: string }) {
  const ms = lastN(d.months, 24, d.current);
  return (
    <Card title={title}>
      <ComboChart data={ms.map((m) => ({ label: monthLabel(m.month), bar: m.revenue, line: gm(m) }))} barLabel="Revenue" lineLabel="Gross margin %" />
      <AccountsTable d={d} lines={lines} months={ms.slice(-12)} />
    </Card>
  );
}

const PL_ROWS: Array<{ key: keyof Month; label: string; lines?: Line[]; bold?: boolean; neg?: boolean }> = [
  { key: "revenue", label: "Revenue", lines: ["revenue"] },
  { key: "cos", label: "Cost of services", lines: ["cos"], neg: true },
  { key: "gross", label: "Gross profit", bold: true },
  { key: "other", label: "Other income", lines: ["other"] },
  { key: "overheads", label: "Overheads", lines: ["overheads"], neg: true },
  { key: "ebitda", label: "EBITDA", bold: true },
  { key: "dep", label: "Depreciation & amortisation", lines: ["dep"], neg: true },
  { key: "interest", label: "Interest", lines: ["interest"], neg: true },
  { key: "tax", label: "Income tax", lines: ["tax"], neg: true },
  { key: "net", label: "Net profit", bold: true },
];

function PL({ d, pct, open }: { d: FinanceData; pct: boolean; open: string | null }) {
  const q = (o: Record<string, string | null>) => "/finance?" + new URLSearchParams(Object.entries({ section: "pl", pc: pct ? "1" : null, open, ...o }).filter(([, v]) => v) as Array<[string, string]>).toString();
  const six = lastN(d.months, 6, d.current);
  const l12 = sumMonths(lastN(d.months, 12, d.current));
  const p12m = lastN(d.months, 24, d.current).slice(0, -12);
  const p12 = p12m.length === 12 ? sumMonths(p12m) : null;
  const cols: Array<{ label: string; v: Omit<Month, "month"> | null }> = [...six.map((m) => ({ label: monthLabel(m.month), v: m })), { label: "12 months", v: l12 }, { label: "Prior 12", v: p12 }];
  const cell = (v: Omit<Month, "month"> | null, k: keyof Month) => {
    if (!v) return "—";
    const x = v[k as keyof typeof v] as number;
    return pct ? (v.revenue ? pc(x / v.revenue) : "—") : aud(x);
  };
  const fys = [...new Set(d.months.map((m) => fyOf(m.month)))];
  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <div className="seg">
          <Link href={q({ pc: null })} aria-pressed={!pct}>
            $
          </Link>
          <Link href={q({ pc: "1" })} aria-pressed={pct}>
            % of revenue
          </Link>
        </div>
      </div>
      <Card title="Profit & loss" sub="Click a line to see its Xero accounts.">
        <div className="tw">
          <table className="wk">
            <thead>
              <tr>
                <th />
                {cols.map((c) => (
                  <th key={c.label} className="r">
                    {c.label}
                  </th>
                ))}
                <th className="r">YoY</th>
              </tr>
            </thead>
            <tbody>
              {PL_ROWS.map((row) => {
                const yoy = p12 && (p12[row.key as keyof typeof p12] as number) ? (l12[row.key as keyof typeof l12] as number) / (p12[row.key as keyof typeof p12] as number) - 1 : null;
                const accs = row.lines ? d.accounts.filter((a) => row.lines!.includes(a.line)) : [];
                return [
                  <tr key={row.key} className={row.bold ? "tot" : ""}>
                    <td className="sup">
                      {accs.length ? (
                        <Link href={q({ open: open === row.key ? null : row.key })} scroll={false} className="lnk">
                          {open === row.key ? "▾" : "▸"} {row.label}
                        </Link>
                      ) : row.bold ? (
                        <strong>{row.label}</strong>
                      ) : (
                        row.label
                      )}
                    </td>
                    {cols.map((c) => (
                      <td key={c.label} className="r num">
                        {row.bold ? <strong>{cell(c.v, row.key)}</strong> : cell(c.v, row.key)}
                      </td>
                    ))}
                    <td className={"r num " + (yoy == null ? "" : (yoy >= 0) !== !!row.neg ? "delta-pos" : "delta-neg")}>{yoy == null ? "—" : `${yoy >= 0 ? "+" : ""}${pc(yoy)}`}</td>
                  </tr>,
                  ...(open === row.key ? accs : [])
                    .map((a) => ({ a, t: lastN(d.months, 12, d.current).reduce((s, m) => s + (a.byMonth[m.month] ?? 0), 0) }))
                    .filter((x) => x.t)
                    .sort((x, y) => y.t - x.t)
                    .map(({ a }) => (
                      <tr key={row.key + a.id} className="pl-sub" data-for={row.key}>
                        <td className="small" style={{ paddingLeft: 22 }}>
                          {a.name}
                        </td>
                        {cols.map((c, i) => {
                          const v = i < six.length ? (a.byMonth[six[i].month] ?? 0) : i === six.length ? lastN(d.months, 12, d.current).reduce((s, m) => s + (a.byMonth[m.month] ?? 0), 0) : p12 ? p12m.reduce((s, m) => s + (a.byMonth[m.month] ?? 0), 0) : null;
                          const base = c.v?.revenue;
                          return (
                            <td key={c.label} className="r num small">
                              {v == null ? "—" : pct ? (base ? pc(v / base) : "—") : aud(v)}
                            </td>
                          );
                        })}
                        <td />
                      </tr>
                    )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Financial years" sub="July–June. The current year is year to date.">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th className="r">Months</th>
                <th className="r">Revenue</th>
                <th className="r">Gross margin</th>
                <th className="r">EBITDA</th>
                <th className="r">EBITDA %</th>
                <th className="r">Net profit</th>
              </tr>
            </thead>
            <tbody>
              {fys.map((fy) => {
                const ms = d.months.filter((m) => fyOf(m.month) === fy);
                const t = sumMonths(ms);
                return (
                  <tr key={fy}>
                    <td className="sup">
                      {fy}
                      {ms.length < 12 && <span className="meta"> · {ms.length < 12 && fy === fyOf(d.current!) ? "YTD" : "part year"}</span>}
                    </td>
                    <td className="r">{ms.length}</td>
                    <td className="r num">{aud(t.revenue)}</td>
                    <td className="r num">{pc(t.revenue ? t.gross / t.revenue : null)}</td>
                    <td className="r num">{aud(t.ebitda)}</td>
                    <td className="r num">{pc(t.revenue ? t.ebitda / t.revenue : null)}</td>
                    <td className="r num">{aud(t.net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Cash({ d, only }: { d: FinanceData; only?: "flow" }) {
  const cur = d.months.find((m) => m.month === d.current)!;
  const close = d.bal.find((b) => b.month === d.current);
  const prevM = d.months[d.months.findIndex((m) => m.month === d.current) - 1]?.month;
  const open = d.bal.find((b) => b.month === prevM);
  const flow = close && open ? cashBridge(cur, open, close) : null;
  const flowCard = (
    <Card title={`Cash flow · ${monthLabel(d.current!)}`} sub="From the P&L and the change in Xero's balance sheet. “Other” balances to Xero's closing cash.">
      {flow ? <Waterfall steps={flow} zero={false} /> : <p className="empty">Needs the balance sheet for this month and the month before — run a full Xero re-read.</p>}
    </Card>
  );
  if (only === "flow") return flowCard;
  return (
    <>
      {flowCard}
      <DscrCard d={d} />
      <Gauges d={d} />
      <Card title="Debt schedule" sub="Entered by hand from the lender's statements. Used for DSCR and debt / EBITDA.">
        {!d.debts.length ? (
          <p className="empty">No facilities yet.{d.bal.at(-1)?.debt ? ` Xero shows ${aud(d.bal.at(-1)!.debt)} of loans on the balance sheet.` : ""}</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Lender</th>
                  <th className="r">Limit</th>
                  <th className="r">Balance</th>
                  <th className="r">Rate</th>
                  <th className="r">Principal / month</th>
                  <th>Ends</th>
                  <th>Security</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.debts.map((x) => (
                  <tr key={x.id}>
                    <td className="sup">{x.name}</td>
                    <td>{x.lender ?? "—"}</td>
                    <td className="r num">{aud(x.limit != null ? Number(x.limit) : null)}</td>
                    <td className="r num">{aud(Number(x.balance))}</td>
                    <td className="r">{x.rate != null ? pc(Number(x.rate), 2) : "—"}</td>
                    <td className="r num">{aud(Number(x.principalMonthly))}</td>
                    <td>{x.endDate ? x.endDate.toISOString().slice(0, 10).split("-").reverse().join("/") : "—"}</td>
                    <td className="small">{x.security ?? "—"}</td>
                    <td>
                      <DeleteDebt id={x.id} name={x.name} />
                    </td>
                  </tr>
                ))}
                <tr className="tot">
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td />
                  <td />
                  <td className="r num">
                    <strong>{aud(d.debtBalance)}</strong>
                  </td>
                  <td />
                  <td className="r num">
                    <strong>{aud(d.principal12 / 12)}</strong>
                  </td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <AddDebt />
      </Card>
    </>
  );
}

async function WorkingCapital({ d }: { d: FinanceData }) {
  const ag = await aged();
  const ms = lastN(d.months, 12, d.current);
  const days = ms.map((m) => {
    const b = d.bal.find((x) => x.month === m.month) ?? null;
    return ratios(lastN(d.months, 12, m.month), b, null);
  });
  const ageTable = (title: string, g: Awaited<ReturnType<typeof aged>>["ar"], who: string) => (
    <Card title={`${title} · ${aud(g.total)}`} sub={`Open ${who === "Client" ? "invoices" : "bills"} by days overdue (inc GST).`}>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {AGE_BUCKETS.map((b, i) => (
          <div key={b} className={"kpi" + (i >= 3 && g.totals[i] ? " red" : "")}>
            <div className="l">{b}</div>
            <div className="v" style={{ fontSize: 18 }}>
              {aud(g.totals[i])}
            </div>
            <div className="s">{pc(g.total ? g.totals[i] / g.total : null, 0)}</div>
          </div>
        ))}
      </div>
      {g.list.length > 0 && (
        <div className="tw" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>{who}</th>
                {AGE_BUCKETS.map((b) => (
                  <th key={b} className="r">
                    {b}
                  </th>
                ))}
                <th className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {g.list.slice(0, 15).map((c) => (
                <tr key={c.id}>
                  <td className="sup">
                    {c.name} {c.buckets[4] > 0 && <Pill tone="red">90+</Pill>}
                  </td>
                  {c.buckets.map((v, i) => (
                    <td key={i} className="r num">
                      {v ? aud(v) : "—"}
                    </td>
                  ))}
                  <td className="r num">
                    <strong>{aud(c.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
  return (
    <>
      <Card title="Debtor and creditor days · 12 months" sub="Balance ÷ last-12-month revenue (or costs) × 365, GST taken out of the balances.">
        {d.hasBalance ? (
          <>
            <div className="tsec-h">Debtor days</div>
            <TargetLine values={days.map((x) => x.debtorDays)} labels={ms.map((m) => monthLabel(m.month))} target={30} fmt={(v) => `${Math.round(v)} d`} h={150} />
            <div className="tsec-h">Creditor days</div>
            <TargetLine values={days.map((x) => x.creditorDays)} labels={ms.map((m) => monthLabel(m.month))} target={30} fmt={(v) => `${Math.round(v)} d`} h={150} />
            <p className="meta">Now: debtor days {dd(days.at(-1)?.debtorDays)} · creditor days {dd(days.at(-1)?.creditorDays)}. The 30-day line is a placeholder target (Settings → Rules later).</p>
          </>
        ) : (
          <p className="empty">Needs the balance sheet from Xero — run a full re-read.</p>
        )}
      </Card>
      {ag.any ? (
        <>
          {ageTable("Aged receivables", ag.ar, "Client")}
          {ageTable("Aged payables", ag.ap, "Supplier")}
        </>
      ) : (
        <EmptyState title="No open invoices or bills yet">They appear after the next Xero sync.</EmptyState>
      )}
    </>
  );
}

async function Clients({ show }: { show: boolean }) {
  const c = await concentration(new Date(), show);
  if (!c.count) return <EmptyState title="No Xero sales yet">Client concentration needs invoices from Xero.</EmptyState>;
  return (
    <>
      <div className="kpis ovtiles">
        <div className="kpi">
          <div className="l">Revenue · 12 months</div>
          <div className="v">{aud(c.total)}</div>
          <div className="s">{c.count} clients invoiced</div>
        </div>
        <div className={"kpi" + (c.top1 > 0.2 ? " red" : "")}>
          <div className="l">Largest client</div>
          <div className="v">{pc(c.top1)}</div>
          <div className="s">banks look closely above 20%</div>
        </div>
        <div className="kpi">
          <div className="l">Top 5</div>
          <div className="v">{pc(c.top5)}</div>
        </div>
        <div className="kpi">
          <div className="l">Top 10</div>
          <div className="v">{pc(c.top10)}</div>
        </div>
      </div>
      <Card title="Revenue by client · last 12 months">
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Link className="btn" href={show ? "/finance?section=clients" : "/finance?section=clients&names=1"}>
            {show ? "Hide names" : "Show names (internal only)"}
          </Link>
        </div>
        {c.rows.slice(0, 25).map((r) => (
          <div key={r.contactId} className="catbar" style={{ gridTemplateColumns: "180px minmax(0,1fr) 150px" }}>
            <span className="small">{r.name}</span>
            <span className="track">
              <i style={{ width: `${(r.share / c.rows[0].share) * 100}%` }} />
            </span>
            <span className="num small">
              {aud(r.revenue)} · {pc(r.share)}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

async function BankPack({ d }: { d: FinanceData }) {
  const t = d.months.length;
  const ag = await aged();
  const items: Array<[string, boolean, string]> = [
    ["P&L by month and financial year", t >= 12, t ? `${t} months from Xero` : "run a full Xero re-read"],
    ["Revenue growth, gross margin, EBITDA", t >= 24, t >= 24 ? "24 months — growth vs last year" : `${t} of 24 months`],
    ["Balance sheet (cash, working capital)", d.hasBalance, d.hasBalance ? `${d.bal.length} month ends` : "balance sheet not synced yet"],
    ["Cash flow", d.bal.length >= 2, "from P&L + balance sheet changes"],
    ["Debt service (DSCR, interest cover, debt / EBITDA)", d.debts.length > 0 && t >= 12, d.debts.length ? `${d.debts.length} facilit${d.debts.length === 1 ? "y" : "ies"}` : "add the debt schedule in Cash & debt"],
    ["Aged receivables and payables", ag.any, ag.any ? "open invoices and bills" : "after the next Xero sync"],
    ["Client concentration (names hidden)", t > 0, "from Xero sales"],
    ["12–24 month forecast with assumptions", !!d.forecast, d.forecast ? "seasonal, labelled as forecast" : "needs 24 months of history"],
    ["Tax and obligations (BAS, super, payroll tax)", false, "manual for now — the accountant confirms"],
    ["Assets, security and covenants", d.debts.some((x) => x.security), "security from the debt schedule; covenants from the facility letters"],
  ];
  return (
    <>
      <Card title="Bank pack · what's ready" sub="Typical bank pack — confirm the exact list with the bank.">
        <div className="tw">
          <table>
            <tbody>
              {items.map(([l, ok, note]) => (
                <tr key={l}>
                  <td style={{ width: 40 }}>{ok ? <Pill tone="green">ready</Pill> : <Pill tone="grey">missing</Pill>}</td>
                  <td className="sup">{l}</td>
                  <td className="small">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Send to the bank" tone="hl" sub="Company totals only: no client rates or margins, no pay by person, client names hidden. Needs the owner's approval before it can be sent.">
        <p>
          Create it in <Link href="/reports?new=1&template=finance">Reports → + New report</Link> with the <strong>Finance · bank pack</strong> template and type <strong>External finance</strong>. Recipients come only from Settings → Contacts & recipients → Lenders & advisers.
        </p>
      </Card>
    </>
  );
}
