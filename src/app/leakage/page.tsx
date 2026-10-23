import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Drawer, DrawerHeader } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { parsePanel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { parseSection } from "@/components/ui/sections";
import { WithSubNav } from "@/components/ui/sub-nav";
import { DetectButton, LeakActions } from "@/components/work/buttons";
import { LeakLogImport, RateDecide, RateUpload, StartReview } from "@/components/work/leak-client";
import { LogsButton } from "@/components/model/editable";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { loadCostRun } from "@/lib/cost/load";
import { getRules } from "@/lib/model/store";
import { rateChecks } from "@/lib/rates/checks";
import "@/app/cost/cost.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leakage" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const aud = (n: number | null | undefined, dp = 2) => (n == null ? "—" : n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: dp, maximumFractionDigits: dp }));
const pc = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(1)}%`);
const au = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : "—");
const KIND = { UNDER_BILLING: "Under-billing", WEEKLY_MINIMUM: "Weekly minimum", RATE_MISMATCH: "Rate mismatch" } as const;
const STATUS_TONE = { OPEN: "red", TASK: "amber", EXPLAINED: "grey", RECOVERED: "green" } as const;
const STATUS_LABEL = { OPEN: "Open", TASK: "Task created", EXPLAINED: "Explained", RECOVERED: "Recovered" } as const;

type Item = Awaited<ReturnType<typeof prisma.leakageItem.findMany>>[number];

/** Leakage (brief §5, §7): revenue not collected. The app never changes Xero, Dyspatch or the WMS. */
export default async function LeakagePage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const section = parseSection("leakage", one(sp.section));
  const [items, clients, staff] = await Promise.all([
    prisma.leakageItem.findMany({ orderBy: [{ foundOn: "desc" }] }),
    prisma.client.findMany({ select: { id: true, name: true, shortName: true } }),
    prisma.user.findMany({ where: { active: true }, select: { name: true } }),
  ]);
  const cn = (id: string) => clients.find((c) => c.id === id)?.shortName || clients.find((c) => c.id === id)?.name || "?";
  const panel = parsePanel(sp.panel);
  const people = [...new Set([...staff.map((s) => s.name), ...(await prisma.staff.findMany({ where: { pool: { in: ["admin", "supervisor", "csr"] } }, select: { name: true } })).map((s) => s.name)])];
  return (
    <WithSubNav page="leakage" current={section}>
      <PageHeader title={section === "overview" ? "Leakage" : (({ underbilling: "Under-billing", underpricing: "Under-pricing", ratechecks: "Rate checks", log: "Leakage log" }) as Record<string, string>)[section]} subtitle="Revenue not collected. A person decides; fixes in Xero, Dyspatch or the WMS are tasks done by hand." actions={<DetectButton />} />
      {section === "overview" && <Overview items={items} cn={cn} card={one(sp.card) ?? null} />}
      {section === "underbilling" && <ItemsTable items={items.filter((i) => i.kind !== "RATE_MISMATCH" && !i.imported)} cn={cn} title="Under-billing and weekly minimums" sub="WMS volume × rate vs what was billed in Xero, per client per service per month; weekly invoice totals under the client's minimum." />}
      {section === "underpricing" && <UnderPricing />}
      {section === "ratechecks" && <RateChecks />}
      {section === "log" && <LogSection items={items} cn={cn} />}
      {panel?.kind === "leak" && <LeakPanel item={items.find((i) => i.id === panel.id) ?? null} cn={cn} people={people} />}
    </WithSubNav>
  );
}

function stats(items: Item[]) {
  const found = items.filter((i) => i.kind !== "RATE_MISMATCH");
  const rec = found.filter((i) => i.status === "RECOVERED");
  const open = found.filter((i) => i.status === "OPEN" || i.status === "TASK");
  const recTot = rec.reduce((a, i) => a + Number(i.recoveredAmount ?? i.gap), 0);
  const foundTot = found.reduce((a, i) => a + Number(i.gap), 0);
  const dayList = rec.filter((i) => i.recoveredOn).map((i) => (i.recoveredOn!.getTime() - i.foundOn.getTime()) / 86400000);
  return { found, rec, open, recTot, foundTot, openTot: open.reduce((a, i) => a + Number(i.gap), 0), rate: foundTot ? recTot / foundTot : null, days: dayList.length ? dayList.reduce((a, b) => a + b, 0) / dayList.length : null };
}

async function Overview({ items, cn, card }: { items: Item[]; cn: (id: string) => string; card: string | null }) {
  const s = stats(items);
  const mism = (await rateChecks()).filter((r) => !r.match);
  const tile = (k: string, l: string, v: string, sub: string, tone = "") => (
    <Link href={card === k ? "/leakage" : `/leakage?card=${k}`} className={"kpi clickable " + tone + (card === k ? " on" : "")} aria-pressed={card === k} scroll={false}>
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className="s">{sub}</div>
    </Link>
  );
  const months = [...new Set(s.found.map((i) => i.foundOn.toISOString().slice(0, 7)))].sort().slice(-6);
  const mx = Math.max(1, ...months.map((m) => s.found.filter((i) => i.foundOn.toISOString().startsWith(m)).reduce((a, i) => a + Number(i.gap), 0)));
  const byKind = Object.entries(KIND).map(([k, l]) => [l, items.filter((i) => i.kind === k).reduce((a, i) => a + Number(i.gap), 0)] as const).filter(([, v]) => v > 0);
  const kmx = Math.max(1, ...byKind.map(([, v]) => v));
  return (
    <>
      <div className="kpis tabtiles ovtiles">
        {tile("found", "Found", aud(s.foundTot, 0), `${s.found.length} findings`)}
        {tile("rec", "Recovered", aud(s.recTot, 0), `${s.rec.length} · ≈ 100% to profit`, "green")}
        {tile("open", "Open", String(s.open.length), `${aud(s.openTot, 0)} still to bill`, s.open.length ? "red" : "")}
        {tile("mism", "Rate mismatches", String(mism.length), "CLM vs Dyspatch vs WMS")}
        {tile("rate", "Recovery rate", pc(s.rate), s.days != null ? `avg ${Math.round(s.days)} days to recover` : "no recoveries yet")}
      </div>
      {card === "found" && <ItemsTable items={s.found} cn={cn} title="All findings" />}
      {card === "rec" && (
        <Card title="Recovered" sub="Billed by hand in Xero after a finding. The work was already done and paid for, so recovered money goes straight to profit.">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>What</th>
                <th className="r">Recovered</th>
                <th>Xero invoice</th>
                <th>On</th>
                <th>By</th>
                <th className="r">Days</th>
              </tr>
            </thead>
            <tbody>
              {s.rec.map((i) => (
                <ClickableRow key={i.id} panel={`leak:${i.id}`}>
                  <td className="sup">{cn(i.clientId)}</td>
                  <td>
                    {KIND[i.kind]} · {i.serviceCode ?? "all services"} · {i.period}
                  </td>
                  <td className="r num">{aud(Number(i.recoveredAmount ?? i.gap))}</td>
                  <td className="mono small">{i.recoveredInvoice ?? "—"}</td>
                  <td>{au(i.recoveredOn)}</td>
                  <td>{i.recoveredBy ?? "—"}</td>
                  <td className="r num">{i.recoveredOn ? Math.round((i.recoveredOn.getTime() - i.foundOn.getTime()) / 86400000) : "—"}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {card === "open" && <ItemsTable items={s.open} cn={cn} title="Open" />}
      {card === "mism" && <RateChecks onlyMismatch />}
      {card === "rate" && (
        <Card title="Recovery rate">
          <dl className="fl">
            <dt>Found</dt>
            <dd>{aud(s.foundTot)}</dd>
            <dt>Recovered</dt>
            <dd>{aud(s.recTot)}</dd>
            <dt>Recovery rate</dt>
            <dd>
              <strong>{pc(s.rate)}</strong>
            </dd>
            <dt>Average days to recover</dt>
            <dd>{s.days != null ? `${Math.round(s.days)} days (found → billed in Xero)` : "—"}</dd>
          </dl>
        </Card>
      )}
      {!card && (
        <>
          <div className="grid2">
            <Card title="Found vs recovered by month">
              {!months.length ? (
                <p className="empty">Nothing found yet.</p>
              ) : (
                months.map((m) => {
                  const f = s.found.filter((i) => i.foundOn.toISOString().startsWith(m)).reduce((a, i) => a + Number(i.gap), 0);
                  const r = s.rec.filter((i) => i.recoveredOn?.toISOString().startsWith(m)).reduce((a, i) => a + Number(i.recoveredAmount ?? i.gap), 0);
                  return (
                    <div key={m} style={{ marginBottom: 8 }}>
                      <div className="catbar">
                        <span>{m}</span>
                        <span className="track">
                          <i style={{ width: `${(f / mx) * 100}%`, background: "var(--red)" }} />
                        </span>
                        <span className="num small">{aud(f, 0)} found</span>
                      </div>
                      <div className="catbar">
                        <span />
                        <span className="track">
                          <i style={{ width: `${(r / mx) * 100}%`, background: "var(--green)" }} />
                        </span>
                        <span className="num small">{aud(r, 0)} recovered</span>
                      </div>
                    </div>
                  );
                })
              )}
            </Card>
            <Card title="By type and status">
              {byKind.map(([l, v]) => (
                <div key={l} className="catbar">
                  <span>{l}</span>
                  <span className="track">
                    <i style={{ width: `${(v / kmx) * 100}%` }} />
                  </span>
                  <span className="num small">{aud(v, 0)}</span>
                </div>
              ))}
              <div className="chips" style={{ marginTop: 10 }}>
                {(Object.keys(STATUS_LABEL) as Array<keyof typeof STATUS_LABEL>).map((k) => (
                  <span key={k}>
                    <Pill tone={STATUS_TONE[k]}>{STATUS_LABEL[k]}</Pill> <span className="small">{items.filter((i) => i.status === k).length}</span>
                  </span>
                ))}
              </div>
            </Card>
          </div>
          <ItemsTable items={s.open.sort((a, b) => Number(b.gap) - Number(a.gap)).slice(0, 5)} cn={cn} title="Top 5 open" />
        </>
      )}
    </>
  );
}

function ItemsTable({ items, cn, title, sub }: { items: Item[]; cn: (id: string) => string; title: string; sub?: string }) {
  return (
    <Card title={`${title} · ${items.length}`} sub={sub}>
      {!items.length ? (
        <p className="empty">Nothing here.</p>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>What</th>
                <th>Period</th>
                <th className="r">Should bill</th>
                <th className="r">Billed</th>
                <th className="r">Gap</th>
                <th>Status</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <ClickableRow key={i.id} panel={`leak:${i.id}`}>
                  <td className="sup">{cn(i.clientId)}</td>
                  <td>
                    {KIND[i.kind]}
                    <div className="meta">{i.serviceCode ?? (i.kind === "WEEKLY_MINIMUM" ? "postage + processing" : "all rated services")}</div>
                  </td>
                  <td className="small">{i.period}</td>
                  <td className="r num">{aud(Number(i.expected))}</td>
                  <td className="r num">{aud(Number(i.billed))}</td>
                  <td className="r num">
                    <strong>{aud(Number(i.gap))}</strong>
                  </td>
                  <td>
                    <Pill tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Pill>
                  </td>
                  <td>{i.owner ?? "—"}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function UnderPricing() {
  const run = await loadCostRun();
  const rules = await getRules();
  const floor = rules.marginFloor ?? 0.15;
  const rows = run.result.clients.flatMap((c) => c.lines.filter((l) => l.rate != null && (l.marginPctT ?? 1) < floor).map((l) => ({ c, l })));
  rows.sort((a, b) => (a.l.marginPctT ?? 0) - (b.l.marginPctT ?? 0));
  return (
    <Card title={`Priced below cost or under the ${pc(floor)} floor · ${run.month}`} sub="Rate vs TDABC unit cost per client per service. Red = below cost; amber = below the margin floor (Settings → Rules).">
      {!rows.length ? (
        <p className="empty">No rated services below the floor this month{run.input.clients.some((c) => Object.keys(c.rates).length) ? "" : " — no client rates yet (CLM, or Settings → Clients)"}.</p>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Service</th>
                <th className="r">Rate</th>
                <th className="r">Cost (TDABC)</th>
                <th className="r">Margin</th>
                <th className="r">Volume</th>
                <th className="r">$ / month lost or short</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, l }) => {
                const short = (l.unitT / (1 - floor) - (l.rate ?? 0)) * l.qty;
                return (
                  <tr key={c.id + l.code}>
                    <td className="sup">{c.name}</td>
                    <td>
                      <Link href={`/cost?section=serve&panel=line:${c.id}|${l.code}`} className="lnk">
                        {l.name}
                      </Link>
                    </td>
                    <td className="r num">{aud(l.rate, 3)}</td>
                    <td className="r num">{aud(l.unitT, 3)}</td>
                    <td className="r">
                      <Pill tone={(l.marginPctT ?? 0) < 0 ? "red" : "amber"}>{pc(l.marginPctT)}</Pill>
                    </td>
                    <td className="r num">{l.qty.toLocaleString("en-AU")}</td>
                    <td className="r num">{aud(short, 0)}</td>
                    <td>
                      <StartReview clientId={c.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function RateChecks({ onlyMismatch = false }: { onlyMismatch?: boolean }) {
  const rows = (await rateChecks()).filter((r) => !onlyMismatch || !r.match);
  const snaps = await prisma.rateSnapshot.groupBy({ by: ["source"], _max: { asOf: true }, _count: { _all: true } });
  return (
    <>
      {!onlyMismatch && (
        <Card title="Rate exports" sub="CLM (or Settings until CLM connects) vs Dyspatch vs the WMS. Upload the Dyspatch and WMS rate exports as CSV; their APIs replace this later.">
          <div className="row" style={{ marginBottom: 8 }}>
            {(["DYSPATCH", "WMS"] as const).map((s) => {
              const x = snaps.find((y) => y.source === s);
              return (
                <span key={s} className="small">
                  <strong>{s === "DYSPATCH" ? "Dyspatch" : "WMS"}</strong>: {x ? `${x._count._all} rates · ${au(x._max.asOf)}` : "not loaded"}
                </span>
              );
            })}
          </div>
          <RateUpload />
        </Card>
      )}
      <Card title={`${onlyMismatch ? "Rate mismatches" : "Rates side by side"} · ${rows.length}`} sub="A person decides which one is right. Analytics updates itself; the other systems get a task to fix by hand.">
        {!rows.length ? (
          <p className="empty">Nothing to compare yet.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Service</th>
                  <th className="r">CLM / Settings</th>
                  <th className="r">Dyspatch</th>
                  <th className="r">WMS</th>
                  <th>Decides</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.clientId + r.serviceCode}>
                    <td className="sup">{r.clientName}</td>
                    <td>
                      {r.serviceName}
                      <div className="meta mono">{r.serviceCode}</div>
                    </td>
                    <td className="r num">{aud(r.clm, 3)}</td>
                    <td className={"r num" + (r.dyspatch != null && r.clm != null && Math.abs(r.dyspatch - r.clm) >= 0.005 ? " delta-neg" : "")}>{aud(r.dyspatch, 3)}</td>
                    <td className={"r num" + (r.wms != null && r.clm != null && Math.abs(r.wms - r.clm) >= 0.005 ? " delta-neg" : "")}>{aud(r.wms, 3)}</td>
                    <td>{r.match ? <Pill tone="green">match</Pill> : <RateDecide clientId={r.clientId} serviceCode={r.serviceCode} options={[["CLM", r.clm], ["DYSPATCH", r.dyspatch], ["WMS", r.wms]].filter((o): o is [string, number] => o[1] != null)} />}</td>
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

function LogSection({ items, cn }: { items: Item[]; cn: (id: string) => string }) {
  return (
    <>
      <Card title="Import FA_Leakage_Log" sub="Save the Excel log as CSV and paste or upload it once; it replaces the spreadsheet from then on.">
        <LeakLogImport />
      </Card>
      <ItemsTable items={items} cn={cn} title="Every finding" />
    </>
  );
}

async function LeakPanel({ item, cn, people }: { item: Item | null; cn: (id: string) => string; people: string[] }) {
  if (!item) return null;
  const tasks = await prisma.task.findMany({ where: { source: `leakage:${item.id}` } });
  return (
    <Drawer label="Finding">
      <DrawerHeader kicker={`${KIND[item.kind]} · ${item.period}`} title={`${cn(item.clientId)} · ${item.serviceCode ?? (item.kind === "WEEKLY_MINIMUM" ? "weekly minimum" : "all rated services")}`} />
      <div className="row">
        <Pill tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Pill>
        <span className="meta">Found {au(item.foundOn)}</span>
      </div>
      <div className="tsec">
        <div className="tsec-h">How it was worked out</div>
        <div className="formula">{item.working}</div>
      </div>
      <dl className="fl">
        <dt>Gap</dt>
        <dd>
          <strong>{aud(Number(item.gap))}</strong>
        </dd>
        {item.cause && (
          <>
            <dt>Cause / explanation</dt>
            <dd>{item.cause}</dd>
          </>
        )}
        {item.status === "RECOVERED" && (
          <>
            <dt>Recovered</dt>
            <dd>
              {aud(Number(item.recoveredAmount))} on {item.recoveredInvoice} · {au(item.recoveredOn)} · {item.recoveredBy}
            </dd>
          </>
        )}
        {tasks.length > 0 && (
          <>
            <dt>Task</dt>
            <dd>
              {tasks.map((t) => (
                <div key={t.id}>
                  {t.title} · {t.status === "DONE" ? "done" : t.status.toLowerCase()}
                </div>
              ))}
            </dd>
          </>
        )}
      </dl>
      <div className="tsec">
        <LeakActions id={item.id} status={item.status} people={people} />
      </div>
      <div className="tsec">
        <div className="tsec-h">Sources</div>
        <p className="small">
          Volumes: <Link href="/data">Data sources → WMS</Link> · Rate: <Link href={`/settings?section=clients&panel=client:${item.clientId}`}>client rates</Link> · Billed: Xero sales lines (read-only). <LogsButton entity="leakage" id={item.id} count={0} />
        </p>
      </div>
    </Drawer>
  );
}
