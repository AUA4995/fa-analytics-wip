import Link from "next/link";
import { Card, EmptyState } from "@/components/ui/card";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Drawer, DrawerHeader } from "@/components/ui/drawer";
import { NotConnected } from "@/components/ui/not-connected";
import { PageHeader } from "@/components/ui/page-header";
import { parsePanel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { parseSection } from "@/components/ui/sections";
import { WithSubNav } from "@/components/ui/sub-nav";
import { EditableValue } from "@/components/model/editable";
import { requireUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { loadCostRun, type CostRun } from "@/lib/cost/load";
import type { ClientResult, Part, PoolResult, Variant } from "@/lib/cost/engine";
import { ENTITY_FIELDS } from "@/lib/model/specs";
import { getRules } from "@/lib/model/store";
import { PackagingToggle } from "@/components/cost/packaging-toggle";
import { loadLogiwaTracker, type LogiwaTracker } from "@/lib/cost/logiwa";
import "./cost.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cost & margin" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const aud = (n: number | null | undefined, dp = 2) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: dp, maximumFractionDigits: dp }));
const pc = (n: number | null | undefined, dp = 1) => (n == null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(dp)}%`);
const num = (n: number, dp = 0) => n.toLocaleString("en-AU", { maximumFractionDigits: dp });
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
const VNAME: Record<Variant, string> = { T: "TDABC", F: "Full absorption" };

/**
 * Cost & margin (brief §5): Base cost — what the company spends per order / per unit, same for every client — and
 * Cost to serve — what each client costs given how complex it is. TDABC and Full absorption side by side or one at a time.
 */
export default async function CostPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const sp = await searchParams;
  const section = parseSection("cost", one(sp.section));
  const run = await loadCostRun(one(sp.month));
  const vsel = one(sp.v);
  const variants: Variant[] = vsel === "T" ? ["T"] : vsel === "F" ? ["F"] : ["T", "F"];
  const panel = parsePanel(sp.panel);
  const q = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (section !== "base") p.set("section", section);
    if (one(sp.month)) p.set("month", run.month);
    if (vsel) p.set("v", vsel);
    if (one(sp.tile)) p.set("tile", one(sp.tile)!);
    for (const [k, v] of Object.entries(extra)) (v == null ? p.delete(k) : p.set(k, v));
    const s = p.toString();
    return s ? `/cost?${s}` : "/cost";
  };
  const hasData = run.input.clients.length > 0 || Object.keys(run.input.labour).length > 0 || Object.keys(run.input.accounts).length > 0;
  return (
    <WithSubNav page="cost" current={section}>
      <PageHeader
        title={section === "base" ? "Base cost" : "Cost to serve"}
        subtitle={`${monthLabel(run.month)} · ${section === "base" ? "what the company spends per order and per unit — the same for every client" : "what each client costs, given how complex it is"}`}
        actions={
          <>
            <span className="seg">
              {run.months.slice(0, 12).map((m) => (
                <Link key={m} href={q({ month: m })} aria-pressed={m === run.month} className="segb">
                  {m}
                </Link>
              ))}
            </span>
          </>
        }
      />
      {!hasData ? (
        <EmptyState title="No data for this month yet">
          Cost needs payroll and P&amp;L from Xero (Data sources → Xero), WMS volumes (Data sources → WMS), services with minutes, and accounts mapped to cost pools (Settings). Nothing is estimated in their place.
        </EmptyState>
      ) : section === "base" ? (
        <BaseCost run={run} variants={variants} vsel={vsel ?? null} tile={one(sp.tile) ?? "pools"} q={q} admin={isAdminRole(me.role)} />
      ) : (
        <CostToServe run={run} variants={variants} vsel={vsel ?? null} q={q} />
      )}
      {hasData && section === "base" && <PackagingAndSoftware admin={isAdminRole(me.role)} />}
      <Warnings run={run} admin={isAdminRole(me.role)} />
      {panel && <CostPanel run={run} kind={panel.kind} id={panel.id} />}
    </WithSubNav>
  );
}

function VariantCards({ run, vsel, q }: { run: CostRun; vsel: string | null; q: (e: Record<string, string | null>) => string }) {
  const b = run.result.base;
  const u = run.result.unused;
  const card = (k: string, title: string, body: React.ReactNode, sub: string) => (
    <Link href={q({ v: vsel === k ? null : k })} className={"kpi clickable" + (vsel === k ? " on" : "")} aria-pressed={vsel === k}>
      <div className="l">{title}</div>
      {body}
      <div className="s">{sub}</div>
    </Link>
  );
  const cpo = (v: Variant) => b[v].b2c.orders === 0 && b[v].all.cpo != null ? (
    <div className="v2">
      <span>
        All orders <strong>{aud(b[v].all.cpo)}</strong>
      </span>
      <span className="meta">B2C / B2B needs an orders file</span>
    </div>
  ) : (
    <div className="v2">
      <span>
        B2C <strong>{aud(b[v].b2c.cpo)}</strong>
      </span>
      <span>
        B2B <strong>{aud(b[v].b2b.cpo)}</strong>
      </span>
    </div>
  );
  return (
    <div className="kpis tabtiles">
      {card("T", "TDABC · cost per order", cpo("T"), "Practical capacity — for client rates and rate reviews")}
      {card("F", "Full absorption · cost per order", cpo("F"), "Every cost spread — for break-even, the bank and real profit")}
      {card("U", "Unused capacity", <div className="v">{aud(u.total, 0)} <small>{pc(u.pct)}</small></div>, "Paid-for time, space and machines not used this month")}
    </div>
  );
}

function BaseCost({ run, variants, vsel, tile, q, admin }: { run: CostRun; variants: Variant[]; vsel: string | null; tile: string; q: (e: Record<string, string | null>) => string; admin: boolean }) {
  const r = run.result;
  return (
    <>
      <VariantCards run={run} vsel={vsel} q={q} />
      {vsel === "U" ? (
        <UnusedTable run={run} />
      ) : (
        <>
          <div className="tiles">
            {[
              ["pools", "Cost pools"],
              ["labour", "Labour"],
              ["minutes", "Services & minutes"],
              ["overheads", "Overheads"],
            ].map(([k, l]) => (
              <Link key={k} href={q({ tile: k })} className={"btn" + (tile === k ? " on" : "")} scroll={false}>
                {l}
              </Link>
            ))}
          </div>
          {tile === "pools" && <PoolsTable pools={r.pools} variants={variants} />}
          {tile === "labour" && <LabourTable run={run} admin={admin} />}
          {tile === "minutes" && <MinutesTable run={run} variants={variants} admin={admin} />}
          {tile === "overheads" && <PoolsTable pools={r.pools.filter((p) => p.kind === "OVERHEAD")} variants={variants} />}
          <Card title="Cost per order by size" sub={`Orders this month from the WMS · B2B = more than ${run.input.rules.b2bUnits} units (Settings → Rules)`}>
            <table>
              <thead>
                <tr>
                  <th />
                  <th className="r">Orders</th>
                  <th className="r">Units / order</th>
                  {variants.map((v) => (
                    <th key={v} className="r">
                      {VNAME[v]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["b2c", "b2b", "all"] as const).map((k) => (
                  <tr key={k} className={k === "all" ? "tot" : ""}>
                    <td className="sup">{k === "all" ? "All orders" : k.toUpperCase()}</td>
                    <td className="r num">{num(r.base.T[k].orders)}</td>
                    <td className="r num">{r.base.T[k].unitsPerOrder.toFixed(2)}</td>
                    {variants.map((v) => (
                      <td key={v} className="r num">
                        <strong>{aud(r.base[v][k].cpo)}</strong>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="meta" style={{ marginBottom: 0 }}>
              An order = services marked “one per order” + packing (CMC / manual by the orders-weighted CMC share) + units × per-unit floor services.
            </p>
          </Card>
        </>
      )}
    </>
  );
}

function PoolsTable({ pools, variants }: { pools: PoolResult[]; variants: Variant[] }) {
  return (
    <Card title="Cost pools" sub="Cost this month, how much of its practical capacity was used, and the rate it charges per driver unit. Click a pool for its calculation.">
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Pool</th>
              <th className="r">Cost</th>
              <th>Driver</th>
              <th className="r">Practical</th>
              <th className="r">Used</th>
              {variants.map((v) => (
                <th key={v} className="r">
                  Rate · {VNAME[v]}
                </th>
              ))}
              <th className="r">Unused</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((p) => (
              <ClickableRow key={p.key} panel={`pool:${p.key}`}>
                <td className="sup">{p.name}</td>
                <td className="r num">{aud(p.cost, 0)}</td>
                <td className="small">per {p.unitLabel}</td>
                <td className="r num">{p.practical ? num(p.practical) : <span className="meta">—</span>}</td>
                <td className="r">{p.usedPct != null ? <UBar pct={p.usedPct} /> : <span className="num">{num(p.used)}</span>}</td>
                {variants.map((v) => (
                  <td key={v} className="r num">
                    <strong>{aud(v === "T" ? p.rateT : p.rateF, 4)}</strong>
                  </td>
                ))}
                <td className="r num">{p.unused ? aud(p.unused, 0) : "—"}</td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function UBar({ pct }: { pct: number }) {
  const c = pct > 0.95 ? "var(--red)" : pct > 0.85 ? "#e2a33a" : "var(--blue)";
  return (
    <span className="ubar" title={pc(pct)}>
      <i style={{ width: `${Math.min(100, pct * 100)}%`, background: c }} />
      <b>{pc(pct, 0)}</b>
    </span>
  );
}

async function LabourTable({ run, admin }: { run: CostRun; admin: boolean }) {
  const sites = await prisma.site.findMany({ orderBy: { sortOrder: "asc" } });
  const rules = await getRules();
  const lab = run.result.pools.filter((p) => run.input.labour[p.key] || p.kind === "LABOUR");
  return (
    <Card title="Labour" sub="From Xero Payroll for pay runs paid this month: gross + super + payroll tax + workers comp. Practical minutes = paid hours × 60 × labour utilisation (edit it here — the same value as in Settings).">
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Pool</th>
              <th className="r">People</th>
              <th className="r">Gross</th>
              <th className="r">Super</th>
              <th className="r">Payroll tax</th>
              <th className="r">Workers comp</th>
              <th className="r">Paid hours</th>
              <th>Utilisation</th>
              <th className="r">Cost / minute (TDABC)</th>
            </tr>
          </thead>
          <tbody>
            {lab.map((p) => {
              const l = run.input.labour[p.key] ?? { gross: 0, super: 0, hours: 0, people: 0 };
              const s = sites.find((x) => x.key === p.site);
              return (
                <ClickableRow key={p.key} panel={`pool:${p.key}`}>
                  <td className="sup">{p.name}</td>
                  <td className="r num">{l.people}</td>
                  <td className="r num">{aud(l.gross, 0)}</td>
                  <td className="r num">{aud(l.super, 0)}</td>
                  <td className="r num">{aud(l.gross * run.input.rules.payrollTaxRate, 0)}</td>
                  <td className="r num">{run.input.rules.workersCompRate == null ? <Pill tone="amber">not set</Pill> : aud(l.gross * run.input.rules.workersCompRate, 0)}</td>
                  <td className="r num">{num(l.hours, 1)}</td>
                  <td>
                    {p.kind === "LABOUR" &&
                      (s ? (
                        <EditableValue entity="site" id={s.key} field="labourUtil" spec={ENTITY_FIELDS.site.labourUtil} value={Number(s.labourUtil)} canEdit={admin} compact />
                      ) : (
                        <EditableValue entity="rule" id="rule" field="csrUtil" spec={ENTITY_FIELDS.rule.csrUtil} value={rules.csrUtil} canEdit={admin} compact />
                      ))}
                  </td>
                  <td className="r num">
                    <strong>{p.kind === "LABOUR" ? aud(p.rateT, 4) : "—"}</strong>
                  </td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
      </div>
      {run.notes.unlinkedEmployees.length > 0 && (
        <p className="callout amber" style={{ marginBottom: 0 }}>
          {run.notes.unlinkedEmployees.length} people in payroll aren&apos;t linked to Settings → Staff ({aud(run.notes.unlinkedEmployees.reduce((a, u) => a + u.gross, 0), 0)} gross, left out):{" "}
          {run.notes.unlinkedEmployees.slice(0, 8).map((u) => u.name).join(", ")}
          {run.notes.unlinkedEmployees.length > 8 ? "…" : ""}. <Link href="/settings?section=staff">Link them</Link>.
        </p>
      )}
    </Card>
  );
}

async function MinutesTable({ run, variants, admin }: { run: CostRun; variants: Variant[]; admin: boolean }) {
  const services = await prisma.service.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
  const sites = run.input.sites;
  return (
    <Card title="Services & standard minutes" sub="Cost per unit of every service at each site. Minutes are editable here (same value as Settings → Services & minutes). Click a service for its calculation.">
      {!services.length ? (
        <p className="empty">No services yet — import the charge code catalogue in Settings → Services & minutes.</p>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Per</th>
                <th>Minutes</th>
                {sites.flatMap((s) =>
                  variants.map((v) => (
                    <th key={s.key + v} className="r">
                      {s.name} · {v === "T" ? "TDABC" : "Full"}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <ClickableRow key={s.code} panel={`svc:${s.code}`}>
                  <td className="sup">
                    {s.name}
                    <div className="meta mono">{s.code}</div>
                  </td>
                  <td>{s.unit}</td>
                  <td>
                    <EditableValue entity="service" id={s.code} field="minutes" spec={ENTITY_FIELDS.service.minutes} value={s.minutes == null ? null : Number(s.minutes)} canEdit={admin} compact />
                    {s.minutesBasis === "ESTIMATE" && s.minutes != null && <Pill tone="amber">estimate</Pill>}
                  </td>
                  {sites.flatMap((st) =>
                    variants.map((v) => (
                      <td key={st.key + v} className="r num">
                        {aud(run.result.unit(s.code, v, st.key).total, 3)}
                      </td>
                    )),
                  )}
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function UnusedTable({ run }: { run: CostRun }) {
  const u = run.result.unused;
  return (
    <Card title="Unused capacity by resource" sub="Practical capacity paid for but not used (TDABC keeps it off client costs). Full absorption − TDABC = this.">
      {!u.rows.length ? (
        <p className="empty">No pool has a practical capacity this month (labour needs paid hours; space needs pallet positions; machines need a capacity in Settings → Cost pools).</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Resource</th>
              <th className="r">Cost</th>
              <th>Used</th>
              <th className="r">Unused</th>
            </tr>
          </thead>
          <tbody>
            {u.rows.map((p) => (
              <ClickableRow key={p.key} panel={`pool:${p.key}`}>
                <td className="sup">{p.name}</td>
                <td className="r num">{aud(p.cost, 0)}</td>
                <td>{p.usedPct != null && <UBar pct={p.usedPct} />}</td>
                <td className="r num">
                  <strong>{aud(p.unused, 0)}</strong>
                </td>
              </ClickableRow>
            ))}
            <tr className="tot">
              <td>Total</td>
              <td className="r num">{aud(u.rows.reduce((a, p) => a + p.cost, 0), 0)}</td>
              <td>{pc(u.pct)} unused</td>
              <td className="r num">{aud(u.total, 0)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </Card>
  );
}

async function CostToServe({ run, variants, vsel, q }: { run: CostRun; variants: Variant[]; vsel: string | null; q: (e: Record<string, string | null>) => string }) {
  const rules = await getRules();
  const floor = rules.marginFloor ?? 0.15;
  const cs = run.result.clients;
  const v: Variant = vsel === "F" ? "F" : "T";
  const withRev = cs.filter((c) => c.marginBasis === "xero");
  const rev = withRev.reduce((a, c) => a + (c.revenue ?? 0), 0);
  const cost = withRev.reduce((a, c) => a + (v === "T" ? c.costT : c.costF), 0);
  const under = cs.filter((c) => ((v === "T" ? c.marginT : c.marginF) ?? 1) < floor);
  const cpos = cs.map((c) => (v === "T" ? c.cpoT : c.cpoF)).filter((x): x is number => x != null);
  const below = cs.flatMap((c) => c.lines.filter((l) => l.rate != null && l.rate < (v === "T" ? l.unitT : l.unitF)).map((l) => ((v === "T" ? l.unitT : l.unitF) - (l.rate ?? 0)) * l.qty));
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="seg">
          {(["T", "F"] as Variant[]).map((x) => (
            <Link key={x} href={q({ v: x === "T" ? null : "F" })} className="segb" aria-pressed={v === x}>
              {VNAME[x]}
            </Link>
          ))}
        </span>
        <span className="meta">Margins use Xero revenue — processing, plus postage re-billed (with its carrier cost) — where the client is linked to Xero. * = not linked: margin on the services that have a rate only.</span>
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="l">Margin · all clients</div>
          <div className="v">{rev ? pc((rev - cost) / rev) : "—"}</div>
          <div className="s">{withRev.length ? `${withRev.length} clients with Xero revenue` : "needs clients linked to Xero + income accounts mapped"}</div>
        </div>
        <div className={"kpi" + (under.length ? " red" : "")}>
          <div className="l">Under the {pc(floor, 0)} floor</div>
          <div className="v">{under.length}</div>
          <div className="s">{under.slice(0, 3).map((c) => c.name).join(", ") || "none"}</div>
        </div>
        <div className="kpi">
          <div className="l">Cost per order range</div>
          <div className="v">{cpos.length ? `${aud(Math.min(...cpos))} – ${aud(Math.max(...cpos))}` : "—"}</div>
          <div className="s">cheapest – dearest client</div>
        </div>
        <div className={"kpi" + (below.length ? " red" : "")}>
          <div className="l">On below-cost lines</div>
          <div className="v">{aud(below.reduce((a, b) => a + b, 0), 0)}</div>
          <div className="s">{below.length} lines priced below cost</div>
        </div>
      </div>
      <Card title={`Clients · ${cs.length}`} sub="Click a client for its services, unit costs, rates and margins.">
        {!cs.length ? (
          <p className="empty">No client volumes this month — check tenants are linked to clients (Data sources → WMS).</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="r">Orders</th>
                  <th className="r">Revenue</th>
                  {variants.map((x) => (
                    <th key={x} className="r">
                      Cost · {x === "T" ? "TDABC" : "Full"}
                    </th>
                  ))}
                  {variants.map((x) => (
                    <th key={"m" + x} className="r">
                      Margin · {x === "T" ? "TDABC" : "Full"}
                    </th>
                  ))}
                  <th className="r">Cost / order</th>
                </tr>
              </thead>
              <tbody>
                {cs.map((c) => (
                  <ClickableRow key={c.id} panel={`cclient:${c.id}`}>
                    <td className="sup">{c.name}</td>
                    <td className="r num">{num(c.orders)}</td>
                    <td className="r num">{c.revenue != null ? aud(c.revenue, 0) : c.expected != null ? <span title="Not linked to Xero: rate × volume of the services that have a rate; margin is on those services only">{aud(c.expected, 0)}*</span> : "—"}</td>
                    {variants.map((x) => (
                      <td key={x} className="r num">
                        {aud(x === "T" ? c.costT : c.costF, 0)}
                      </td>
                    ))}
                    {variants.map((x) => (
                      <td key={"m" + x} className="r">
                        <MarginPill m={x === "T" ? c.marginT : c.marginF} floor={floor} />
                      </td>
                    ))}
                    <td className="r num">{aud(v === "T" ? c.cpoT : c.cpoF)}</td>
                  </ClickableRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function MarginPill({ m, floor }: { m: number | null; floor: number }) {
  if (m == null) return <span className="meta">—</span>;
  return <Pill tone={m < 0 ? "red" : m < floor ? "amber" : "green"}>{pc(m)}</Pill>;
}

async function PackagingAndSoftware({ admin }: { admin: boolean }) {
  const [mode, logiwa] = await Promise.all([prisma.setting.findUnique({ where: { key: "packagingMode" } }), loadLogiwaTracker()]);
  return (
    <div className="grid2">
      <Card title="Packaging cost" sub="Average per order now. Precise = each client's real cartons and fill from Logiwa pack scans.">
        <PackagingToggle mode={mode?.value === "PRECISE" ? "PRECISE" : "AVERAGE"} admin={admin} />
      </Card>
      <LogiwaCard t={logiwa} />
    </div>
  );
}

function LogiwaCard({ t }: { t: LogiwaTracker }) {
  const n0 = (x: number) => Math.round(x).toLocaleString("en-AU");
  const usedPct = t.allowance && t.usedLogiwa != null ? t.usedLogiwa / t.allowance : null;
  return (
    <Card title="Logiwa credits (step cost)" sub={`Plan ${n0(t.allowance)} credits a year · 1 credit per order up to ${t.linesPerCredit} unique lines · above the plan ${pc(t.overage)} of the plan price · year: ${t.year.label}`}>
      <div className="formula">
        Used on Logiwa this year:{" "}
        {t.usedLogiwa == null ? (
          <>
            <strong>no data yet</strong> <NotConnected source="logiwa" until="Logiwa isn't live" />
          </>
        ) : (
          <>
            <strong>{n0(t.usedLogiwa)}</strong> credits{usedPct != null ? ` (${pc(usedPct)} of the plan)` : ""}
          </>
        )}
        <br />
        {t.monthlyAllVolume != null ? (
          <>
            If all current volume ran on Logiwa: about <strong>{n0(t.monthlyAllVolume)}</strong> credits a month → <strong>{n0(t.projectedYear ?? 0)}</strong> a year
            {t.projectedOver ? (
              <>
                {" "}
                — <span className="delta-neg">{n0(t.projectedOver)} over the plan</span> (charged at {pc(t.overage)})
                {t.projectedOverCost != null ? (
                  <>
                    {" "}
                    ≈ <strong>{aud(t.projectedOverCost, 0)}</strong> a year extra
                  </>
                ) : (
                  <span className="meta"> — set the plan fee per year in Settings → Rules to see it in dollars</span>
                )}
              </>
            ) : (
              " — within the plan"
            )}
          </>
        ) : (
          "Projection needs WMS orders for the last 3 full months (Data sources → WMS)."
        )}
      </div>
      <p className="meta" style={{ marginBottom: 0 }}>For break-even, Logiwa is a step cost: fixed until the plan is used up (set its account to Step in Settings → Mapping).</p>
    </Card>
  );
}

function Warnings({ run, admin }: { run: CostRun; admin: boolean }) {
  const n = run.notes;
  const wcMissing = run.input.rules.workersCompRate == null;
  const items = [
    ...run.result.warnings.filter((w) => !(wcMissing && w.startsWith("Workers comp rate"))),
    ...(n.unknownTenants.length ? [`${n.unknownTenants.length} WMS tenants aren't linked to a client (${n.unknownTenants.slice(0, 5).map((t) => t.tenant).join(", ")}…) — their volumes are left out. Settings → Clients.`] : []),
    ...(n.unmappedCodes.length ? [`${n.unmappedCodes.length} WMS charge codes aren't mapped to a service (${n.unmappedCodes.slice(0, 5).map((t) => t.code).join(", ")}…) — left out. Settings → Cost pools & mapping.`] : []),
    ...(n.unmappedAccounts.length ? [`${n.unmappedAccounts.length} Xero expense accounts with amounts this month have no cost pool (${aud(n.unmappedAccounts.reduce((a, x) => a + x.amount, 0), 0)}) — left out. Settings → Cost pools & mapping.`] : []),
    ...(n.noIncomeMapping ? ["No Xero income accounts are marked as processing revenue yet — client revenue can't be read (Settings → Cost pools & mapping)."] : []),
  ];
  if (!items.length && !wcMissing) return null;
  return (
    <Card title="What's missing or estimated" tone="warn">
      <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        {wcMissing && (
          <li>
            Workers comp rate isn&apos;t set — left out of labour cost. Rate from the insurance policy (share of gross):{" "}
            <EditableValue entity="rule" id="rule" field="workersCompRate" spec={ENTITY_FIELDS.rule.workersCompRate} value={null} canEdit={admin} compact />{" "}
            <span className="meta">(the same value as Settings → Rules)</span>
          </li>
        )}
        {items.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </Card>
  );
}

function PartsTable({ parts, total }: { parts: Part[]; total: number }) {
  return (
    <div className="formula">
      {parts.map((p, i) => (
        <div key={i} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <span>{p.ref ? <Link href={`?panel=${p.ref.replace(/^pool:/, "pool:")}`}>{p.label}</Link> : p.label}</span>
          <span className="num">{aud(p.amount, 4)}</span>
        </div>
      ))}
      <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
        <strong>Total</strong>
        <strong className="num">{aud(total, 4)}</strong>
      </div>
    </div>
  );
}

function CostPanel({ run, kind, id }: { run: CostRun; kind: string; id: string }) {
  const r = run.result;
  if (kind === "pool") {
    const p = r.pools.find((x) => x.key === id);
    if (!p) return null;
    return (
      <Drawer label={p.name}>
        <DrawerHeader kicker={`Cost pool · ${p.kind === "LABOUR" ? "labour" : "overhead"} · ${monthLabel(run.month)}`} title={p.name} />
        <div className="tsec">
          <div className="tsec-h">Cost this month</div>
          <PartsTable parts={p.costParts} total={p.cost} />
        </div>
        <div className="tsec">
          <div className="tsec-h">How it is spread · per {p.unitLabel}</div>
          <div className="formula">
            {p.practical ? (
              <>
                TDABC: {aud(p.cost)} ÷ {num(p.practical)} practical {p.unitLabel}s = <strong>{aud(p.rateT, 4)}</strong>
                <br />
              </>
            ) : (
              <>
                No practical capacity → spread over what was used (TDABC = Full)
                <br />
              </>
            )}
            Full absorption: {aud(p.cost)} ÷ {num(p.used)} {p.unitLabel}s used = <strong>{aud(p.rateF, 4)}</strong>
            {p.practical ? (
              <>
                <br />
                Used {pc(p.usedPct)} · unused {aud(p.unused)}
              </>
            ) : null}
          </div>
        </div>
        <div className="tsec">
          <div className="tsec-h">Settings it uses</div>
          <p className="small">
            {p.kind === "LABOUR" ? "Payroll staff linked in Settings → Staff (pool and site), labour utilisation, super / payroll tax / workers comp rates (Settings → Rules)" : "Xero accounts mapped to this pool"}, driver and capacity in{" "}
            <Link href={`/settings?section=pools&panel=pool:${p.key}`}>Settings → Cost pools</Link>.
          </p>
        </div>
      </Drawer>
    );
  }
  if (kind === "svc") {
    const s = run.input.services.find((x) => x.code === id);
    if (!s) return null;
    return (
      <Drawer label={s.name}>
        <DrawerHeader kicker={`Service · ${s.code} · per ${s.unit}`} title={s.name} />
        {run.input.sites.map((st) =>
          (["T", "F"] as Variant[]).map((v) => {
            const u = r.unit(s.code, v, st.key);
            return (
              <div className="tsec" key={st.key + v}>
                <div className="tsec-h">
                  {st.name} · {VNAME[v]}
                </div>
                {u.parts.length ? <PartsTable parts={u.parts} total={u.total} /> : <p className="meta">No cost parts — set minutes / drivers in Settings → Services & minutes.</p>}
              </div>
            );
          }),
        )}
        <Link href={`/settings?section=services&panel=service:${s.code}`} className="lnk">
          Edit minutes and drivers
        </Link>
      </Drawer>
    );
  }
  if (kind === "cclient") {
    const c = r.clients.find((x) => x.id === id);
    if (!c) return null;
    return <ClientPanel c={c} month={run.month} />;
  }
  if (kind === "line") {
    const [cid, code] = id.split("|");
    const c = r.clients.find((x) => x.id === cid);
    const l = c?.lines.find((x) => x.code === code);
    if (!c || !l) return null;
    return (
      <Drawer label={l.name}>
        <DrawerHeader kicker={`${c.name} · ${monthLabel(run.month)}`} title={l.name} />
        <dl className="fl">
          <dt>Volume</dt>
          <dd className="num">
            {num(l.qty, 2)} × per {l.unit}
          </dd>
          <dt>Rate</dt>
          <dd className="num">{l.rate != null ? aud(l.rate, 4) : l.billable ? "not known yet (rates come from CLM, or Settings)" : "not billed"}</dd>
        </dl>
        {(["T", "F"] as Variant[]).map((v) => (
          <div className="tsec" key={v}>
            <div className="tsec-h">
              Unit cost · {VNAME[v]} · margin {pc(v === "T" ? l.marginPctT : l.marginPctF)}
            </div>
            <PartsTable parts={v === "T" ? l.partsT : l.partsF} total={v === "T" ? l.unitT : l.unitF} />
          </div>
        ))}
        <Link href={`?section=serve&panel=cclient:${c.id}`} className="lnk">
          ← {c.name}
        </Link>
      </Drawer>
    );
  }
  return null;
}

function ClientPanel({ c, month }: { c: ClientResult; month: string }) {
  return (
    <Drawer label={c.name}>
      <DrawerHeader kicker={`Cost to serve · ${monthLabel(month)}`} title={c.name} />
      <dl className="fl">
        <dt>Orders</dt>
        <dd className="num">{num(c.orders)}</dd>
        <dt>Revenue (Xero, processing)</dt>
        <dd className="num">{c.revenue != null ? aud(c.revenue) : c.expected != null ? `not linked to Xero — rated services ${aud(c.expected)}` : "not linked to Xero"}</dd>
        <dt>Cost · TDABC / Full</dt>
        <dd className="num">
          {aud(c.costT)} / {aud(c.costF)}
        </dd>
        <dt>Margin · TDABC / Full</dt>
        <dd className="num">
          {pc(c.marginT)} / {pc(c.marginF)}
          {c.marginBasis === "rated" && <span className="meta"> · rated services only</span>}
        </dd>
        <dt>Cost per order</dt>
        <dd className="num">
          {aud(c.cpoT)} / {aud(c.cpoF)}
        </dd>
      </dl>
      <div className="tsec">
        <div className="tsec-h">Services · click a line for its calculation</div>
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th className="r">Volume</th>
              <th className="r">Unit cost</th>
              <th className="r">Rate</th>
              <th className="r">Margin</th>
            </tr>
          </thead>
          <tbody>
            {c.lines.map((l) => (
              <ClickableRow key={l.code} panel={`line:${c.id}|${l.code}`}>
                <td>
                  {l.name}
                  {!l.billable && <div className="meta">not billed</div>}
                </td>
                <td className="r num">{num(l.qty, 1)}</td>
                <td className="r num">{aud(l.unitT, 3)}</td>
                <td className="r num">{l.rate != null ? aud(l.rate, 3) : "—"}</td>
                <td className="r">{l.marginPctT != null ? <Pill tone={l.marginPctT < 0 ? "red" : l.marginPctT < 0.15 ? "amber" : "green"}>{pc(l.marginPctT)}</Pill> : "—"}</td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>
      <Link href={`/settings?section=clients&panel=client:${c.id}`} className="lnk">
        Client settings (IDs, CMC share, weekly minimum)
      </Link>
    </Drawer>
  );
}
