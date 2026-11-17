import Link from "next/link";
import { Sparkline, TargetLine } from "@/components/charts/charts";
import { Card } from "@/components/ui/card";
import { Drawer, DrawerHeader } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { NotConnected } from "@/components/ui/not-connected";
import { parsePanel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { parseSection } from "@/components/ui/sections";
import { WithSubNav } from "@/components/ui/sub-nav";
import { requireUser } from "@/lib/auth/session";
import { monthLabel } from "@/lib/finance/load";
import { computeKpis, type KpiData, type Site } from "@/lib/kpi/compute";
import { GROUPS, KPIS, fmtKpi, kpiStatus, type KpiDef, type KpiGroup, type KpiStatus } from "@/lib/kpi/defs";

export const dynamic = "force-dynamic";
export const metadata = { title: "KPI" };

const SITES: Array<[Site, string]> = [
  ["all", "Both sites"],
  ["smi", "Smithfield"],
  ["par", "Parramatta"],
];
const STATUS_LABEL: Record<KpiStatus, string> = { green: "On target", amber: "Close", red: "Off target", none: "No target / no data" };

interface Row {
  k: KpiDef;
  v: number | null;
  prev: number | null;
  target: number | null;
  status: KpiStatus;
  series: Array<number | null>;
}

/** KPI (brief §9): tiles with a status stripe, value vs target, 12-month trend; site filter; click → details. */
export default async function KpiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const section = parseSection("kpi", sp.section);
  const site = (["all", "smi", "par"].includes(one("site") ?? "") ? one("site") : "all") as Site;
  const card = one("card") ?? null;
  const d = await computeKpis(site);
  const rows: Row[] = KPIS.map((k) => {
    const s = d.values[k.id] ?? [];
    const v = s.at(-1) ?? null;
    const target = d.targets[k.id];
    return { k, v, prev: s.at(-2) ?? null, target, status: k.needs ? "none" : kpiStatus(v, target, k.better), series: s };
  });
  const q = (o: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries({ section: section === "overview" ? null : section, site: site === "all" ? null : site, card, ...o }).filter(([, v]) => v) as Array<[string, string]>);
    const s = p.toString();
    return s ? `/kpi?${s}` : "/kpi";
  };
  const panel = parsePanel(sp.panel);
  const open = panel?.kind === "kpi" ? rows.find((r) => r.k.id === panel.id) : null;
  const latest = d.months.at(-1)!;
  return (
    <WithSubNav page="kpi" current={section}>
      <PageHeader
        title="KPI"
        subtitle={`${monthLabel(latest)} · status against the targets in Settings → Rules. Click a tile for the trend, the split and the formula.`}
        actions={
          <div className="seg">
            {SITES.map(([k, l]) => (
              <Link key={k} href={q({ site: k === "all" ? null : k, panel: null })} aria-pressed={site === k} scroll={false}>
                {l}
              </Link>
            ))}
          </div>
        }
      />
      {section === "people" && (
        <p className="meta" style={{ margin: "0 0 10px" }}>
          <NotConnected source="siena" />
        </p>
      )}
      {section === "overview" ? <Overview rows={rows} card={card} q={q} /> : <Tiles rows={rows.filter((r) => r.k.group === section)} q={q} site={site} />}
      {open && <KpiPanel r={open} d={d} site={site} />}
    </WithSubNav>
  );
}

function Tile({ r, q, site }: { r: Row; q: (o: Record<string, string | null>) => string; site: Site }) {
  const delta = r.v != null && r.prev != null ? r.v - r.prev : null;
  const good = delta == null ? null : (delta >= 0) === (r.k.better === "up");
  return (
    <Link href={q({ panel: `kpi:${r.k.id}` })} scroll={false} className={`ktile st-${r.status}`}>
      <div className="l">
        {r.k.label}
        {site !== "all" && !r.k.bySite && !r.k.needs && <span className="meta"> · company</span>}
      </div>
      {r.k.needs ? (
        <>
          <div className="v muted">needs data</div>
          <div className="s">{r.k.needs}</div>
        </>
      ) : (
        <>
          <div className="v">{fmtKpi(r.v, r.k.unit, r.k.dp)}</div>
          <div className="s">
            target {r.target == null ? "not set" : fmtKpi(r.target, r.k.unit, r.k.dp)}
            {delta != null && (
              <span className={good ? "delta-pos" : "delta-neg"}>
                {" "}
                · {delta >= 0 ? "▲" : "▼"} {fmtKpi(Math.abs(delta), r.k.unit, r.k.dp)} vs last month
              </span>
            )}
          </div>
          <Sparkline values={r.series} w={150} h={26} />
        </>
      )}
    </Link>
  );
}

function Tiles({ rows, q, site }: { rows: Row[]; q: (o: Record<string, string | null>) => string; site: Site }) {
  return (
    <div className="ktiles">
      {rows.map((r) => (
        <Tile key={r.k.id} r={r} q={q} site={site} />
      ))}
    </div>
  );
}

function Overview({ rows, card, q }: { rows: Row[]; card: string | null; q: (o: Record<string, string | null>) => string }) {
  const by = (s: KpiStatus) => rows.filter((r) => r.status === s);
  const scored = rows.filter((r) => r.status !== "none");
  const score = scored.length ? (by("green").length + by("amber").length * 0.5) / scored.length : null;
  const tile = (k: string, l: string, v: string, s: string, tone = "") => (
    <Link href={q({ card: card === k ? null : k })} className={"kpi clickable " + tone + (card === k ? " on" : "")} aria-pressed={card === k} scroll={false}>
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className="s">{s}</div>
    </Link>
  );
  return (
    <>
      <div className="kpis tabtiles ovtiles">
        {tile("green", "On target", String(by("green").length), "within 3% of target or better", "green")}
        {tile("amber", "Close", String(by("amber").length), "3–10% off target")}
        {tile("red", "Off target", String(by("red").length), "more than 10% off", by("red").length ? "red" : "")}
        {tile("score", "Score", score == null ? "—" : `${Math.round(score * 100)}%`, `${scored.length} of ${rows.length} KPIs scored · ${rows.filter((r) => r.k.needs).length} need data`)}
      </div>
      {card && card !== "score" ? (
        <Card title={STATUS_LABEL[card as KpiStatus] ?? "KPIs"}>{by(card as KpiStatus).length ? <Tiles rows={by(card as KpiStatus)} q={q} site="all" /> : <p className="empty">None.</p>}</Card>
      ) : card === "score" ? (
        <Card title="Not scored yet" sub="No target set, or the data source isn't connected yet.">
          <Tiles rows={by("none")} q={q} site="all" />
        </Card>
      ) : (
        <>
          <Card title="Scorecard" sub="Click a group to see its KPIs.">
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th className="r">On target</th>
                    <th className="r">Close</th>
                    <th className="r">Off target</th>
                    <th className="r">Not scored</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map(([g, l]) => {
                    const gr = rows.filter((r) => r.k.group === g);
                    const c = (s: KpiStatus) => gr.filter((r) => r.status === s).length;
                    return (
                      <tr key={g}>
                        <td className="sup">
                          <Link href={q({ section: g, card: null })} className="lnk">
                            {l}
                          </Link>
                        </td>
                        <td className="r">{c("green") || "—"}</td>
                        <td className="r">{c("amber") || "—"}</td>
                        <td className="r">{c("red") || "—"}</td>
                        <td className="r meta">{c("none") || "—"}</td>
                        <td>
                          <span className="scorebar">
                            {(["green", "amber", "red", "none"] as KpiStatus[]).map((s) => (
                              <i key={s} className={`sb-${s}`} style={{ flex: c(s) }} title={`${STATUS_LABEL[s]}: ${c(s)}`} />
                            ))}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={`What's red · ${by("red").length}`} tone={by("red").length ? "alert" : "normal"}>
            {!by("red").length ? (
              <p className="empty">Nothing off target.</p>
            ) : (
              <div className="tw">
                <table>
                  <tbody>
                    {by("red").map((r) => (
                      <tr key={r.k.id}>
                        <td className="sup">
                          <Link href={q({ panel: `kpi:${r.k.id}` })} scroll={false} className="lnk">
                            {r.k.label}
                          </Link>
                        </td>
                        <td>{GROUPS.find(([g]) => g === r.k.group)?.[1]}</td>
                        <td className="r num delta-neg">{fmtKpi(r.v, r.k.unit, r.k.dp)}</td>
                        <td className="r meta">target {fmtKpi(r.target, r.k.unit, r.k.dp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function KpiPanel({ r, d, site }: { r: Row; d: KpiData; site: Site }) {
  const k = r.k;
  const f = (v: number | null | undefined) => fmtKpi(v, k.unit, k.dp);
  const sv = d.sites[k.id];
  const cl = d.clients[k.id];
  return (
    <Drawer label={k.label}>
      <DrawerHeader kicker={`${GROUPS.find(([g]) => g === (k.group as KpiGroup))?.[1]} · ${k.needs ? "needs data source" : r.status !== "none" ? STATUS_LABEL[r.status] : r.target == null ? "no target set" : "no data this month"}`} title={k.label} />
      {k.needs ? (
        <p className="callout amber">Not measured yet — needs {k.needs}. The target ({f(r.target)}) is kept in Settings → Rules for when it arrives.</p>
      ) : (
        <>
          <div className="row" style={{ gap: 18, margin: "6px 0 10px" }}>
            <div>
              <div className="meta small">{monthLabel(d.months.at(-1)!)}</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{f(r.v)}</div>
            </div>
            <div>
              <div className="meta small">Target</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{r.target == null ? "not set" : f(r.target)}</div>
            </div>
            {r.status !== "none" && <Pill tone={r.status === "green" ? "green" : r.status === "red" ? "red" : "grey"}>{STATUS_LABEL[r.status]}</Pill>}
          </div>
          <TargetLine values={r.series} labels={d.months.map(monthLabel)} target={r.target} fmt={f} />
          {sv && (
            <div className="tsec">
              <div className="tsec-h">By site</div>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th className="r">{monthLabel(d.months.at(-1)!)}</th>
                      <th className="r">Last month</th>
                      <th>12 months</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["smi", "par"] as const).map((s) => (
                      <tr key={s} className={site === s ? "hl" : ""}>
                        <td className="sup">{s === "smi" ? "Smithfield" : "Parramatta"}</td>
                        <td className="r num">{f(sv[s].at(-1))}</td>
                        <td className="r num">{f(sv[s].at(-2))}</td>
                        <td>
                          <Sparkline values={sv[s]} w={120} h={22} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {cl && cl.length > 0 && (
            <div className="tsec">
              <div className="tsec-h">By client · {monthLabel(d.months.at(-1)!)}</div>
              <div className="tw">
                <table>
                  <tbody>
                    {cl.slice(0, 15).map((c) => (
                      <tr key={c.name}>
                        <td className="sup">{c.name}</td>
                        <td className="r num">{f(c.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      <div className="tsec">
        <div className="tsec-h">Formula and source</div>
        <div className="formula">
          {k.formula}
          <br />
          Source: {k.source} · {k.better === "up" ? "higher" : "lower"} is better · target in <Link href="/settings?section=rules">Settings → Rules → KPI targets</Link>
        </div>
      </div>
    </Drawer>
  );
}
