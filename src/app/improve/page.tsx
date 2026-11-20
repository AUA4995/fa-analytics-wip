import { PageTabs, pickTab } from "@/components/ui/page-tabs";
import Link from "next/link";
import { AddCategory, CalcEditor, CommentBox, FieldEdit, NewIdeaForm, Participants, StageButtons, StepsEditor } from "@/components/improve/forms";
import { MonthCalendars, Roadmap, ZOOMS, type RoadItem } from "@/components/improve/roadmap";
import { LogsButton } from "@/components/model/editable";
import { Card } from "@/components/ui/card";
import { Drawer, DrawerHeader } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { parsePanel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { parseSection } from "@/components/ui/sections";
import { WithSubNav } from "@/components/ui/sub-nav";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CHANGES, SAVING_TYPES, STAGES, calcSaving, isInitiative, stepState, type CalcBlock } from "@/lib/improve/calc";
import { ensureCategories } from "@/lib/improve/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Improvements & savings" };

const aud = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }));
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const au = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : "—");
const stageLabel = (s: string) => STAGES.find((x) => x[0] === s)?.[1] ?? s;
const STAGE_TONE: Record<string, "blue" | "green" | "red" | "grey"> = { IDEA: "blue", PARKED: "grey", REJECTED: "grey", APPROVED: "blue", IN_PROGRESS: "blue", DONE: "green", VERIFIED: "green" };

type Imp = Awaited<ReturnType<typeof load>>[number];
async function load() {
  return prisma.improvement.findMany({ include: { steps: { orderBy: { sortOrder: "asc" } }, comments: { orderBy: { at: "desc" } } }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
}
const saving = (i: Imp) => (i.measuredMonthly != null ? Number(i.measuredMonthly) : i.estMonthly != null ? Number(i.estMonthly) : null);

/** Improvements & savings (brief §9a): one record from idea to verified initiative. */
export default async function ImprovePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  await ensureCategories();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const section = parseSection("improve", sp.section);
  const [items, cats, users, staff, suppliers] = await Promise.all([
    load(),
    prisma.improveCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.staff.findMany({ where: { endDate: null }, select: { name: true, position: true }, orderBy: { name: "asc" } }),
    prisma.xeroContact.findMany({ where: { isSupplier: true }, select: { xeroId: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const cat = one("cat") ?? null;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const catName = (k: string) => cats.find((c) => c.key === k)?.name ?? k;
  const q = (o: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries({ section: section === "overview" ? null : section, cat, zoom: one("zoom") ?? null, focus: one("focus") ?? null, card: one("card") ?? null, tab: one("tab") ?? null, ...o }).filter(([, v]) => v) as Array<[string, string]>);
    const s = p.toString();
    return s ? `/improve?${s}` : "/improve";
  };
  const href = (i: Imp) => q({ section: isInitiative(i.stage) ? "initiatives" : "ideas", panel: `imp:${i.id}`, card: null });
  const panel = parsePanel(sp.panel);
  const open = panel?.kind === "imp" ? items.find((i) => i.id === panel.id) : null;
  const inCat = (i: Imp) => !cat || i.category === cat;
  const catChips = (
    <div className="seg" style={{ marginBottom: 12 }}>
      <Link href={q({ cat: null })} aria-pressed={!cat}>
        All
      </Link>
      {cats.map((c) => (
        <Link key={c.key} href={q({ cat: c.key })} aria-pressed={cat === c.key}>
          {c.name} · {items.filter((i) => i.category === c.key && (section === "ideas" ? !isInitiative(i.stage) : section === "initiatives" ? isInitiative(i.stage) : true)).length}
        </Link>
      ))}
    </div>
  );
  return (
    <WithSubNav page="improve" current={section}>
      <PageHeader
        title="Improvements & savings"
        subtitle={section === "overview" ? "Savings = cost no longer spent (not leakage). Ideas are estimated; initiatives are measured before and after, then verified with real data." : section === "ideas" ? "Proposed, not approved yet — estimated saving only. Approve moves an idea to Initiatives and opens its project." : "Approved and being done, in priority order (1 = do first). Measured before / after; verified after 1–3 months of data."}
        actions={
          <Link className="btn primary" href={q({ section: "ideas", new: "1", panel: null })}>
            + New idea
          </Link>
        }
      />
      {one("new") === "1" && (
        <Card title="New idea" tone="hl" sub="A few choices, then the calculation is proposed from them. Nothing is final until you confirm it in the idea's panel.">
          <NewIdeaForm cats={cats} users={users.map((u) => u.name)} suppliers={suppliers.map((s) => [s.xeroId, s.name])} />
        </Card>
      )}
      {section === "overview" && <Overview items={items} today={today} q={q} href={href} card={one("card") ?? null} tab={one("tab") ?? undefined} zoom={one("zoom") ?? "quarter"} focus={one("focus") ?? null} cats={cats} cat={cat} catChips={catChips} inCat={inCat} />}
      {section === "ideas" && (
        <>
          <PageTabs label="Ideas" tabs={[{ key: "ideas", label: "Ideas", count: items.filter((i) => !isInitiative(i.stage) && inCat(i)).length }, { key: "categories", label: "Categories" }]} current={one("tab") === "categories" ? "categories" : "ideas"} href={(k) => q({ tab: k === "ideas" ? null : k })} />
          {one("tab") !== "categories" && (
            <>
              {catChips}
              <ItemTable items={items.filter((i) => !isInitiative(i.stage) && inCat(i))} kind="idea" href={href} catName={catName} today={today} />
            </>
          )}
          {one("tab") === "categories" && (
            <Card title="Categories" sub="Many items per category; add categories here.">
              <AddCategory />
            </Card>
          )}
        </>
      )}
      {section === "initiatives" && (
        <>
          {catChips}
          <ItemTable items={items.filter((i) => isInitiative(i.stage) && inCat(i)).sort((a, b) => Number(["DONE", "VERIFIED"].includes(a.stage)) - Number(["DONE", "VERIFIED"].includes(b.stage)) || (a.priority ?? 99) - (b.priority ?? 99))} kind="initiative" href={href} catName={catName} today={today} />
        </>
      )}
      {open && <ImpPanel i={open} catName={catName} users={users.map((u) => u.name)} staff={staff.map((s) => s.name)} today={today} q={q} />}
    </WithSubNav>
  );
}

function ItemTable({ items, kind, href, catName, today }: { items: Imp[]; kind: "idea" | "initiative"; href: (i: Imp) => string; catName: (k: string) => string; today: Date }) {
  if (!items.length) return <p className="empty">{kind === "idea" ? "No ideas yet — “+ New idea” starts one." : "No initiatives yet — approve an idea to start one."}</p>;
  return (
    <Card>
      <div className="tw">
        <table>
          <thead>
            <tr>
              {kind === "initiative" && <th className="r">#</th>}
              <th>{kind === "idea" ? "Idea" : "Initiative"}</th>
              <th>Category</th>
              <th className="r">{kind === "idea" ? "Est. / month" : "Saving / month"}</th>
              {kind === "idea" ? (
                <>
                  <th>Reviewer</th>
                  <th>Review by</th>
                  <th>Horizon</th>
                </>
              ) : (
                <>
                  <th>Owner</th>
                  <th>Progress</th>
                  <th>Due</th>
                </>
              )}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const done = i.steps.filter((s) => s.status === "DONE").length;
              const late = i.steps.some((s) => stepState(s, today) === "late");
              const reviewLate = kind === "idea" && i.stage === "IDEA" && i.reviewDue && i.reviewDue < today;
              return (
                <tr key={i.id} className="clickable">
                  {kind === "initiative" && <td className="r">{i.priority ?? "—"}</td>}
                  <td className="sup">
                    <Link href={href(i)} scroll={false} className="lnk">
                      {i.name}
                    </Link>
                    {i.description && <div className="meta small">{i.description}</div>}
                  </td>
                  <td className="small">
                    {catName(i.category)}
                    {i.sub ? ` → ${i.sub}` : ""}
                    {i.detail ? ` → ${i.detail}` : ""}
                  </td>
                  <td className="r num">
                    {aud(saving(i))}
                    {i.measuredMonthly != null && <div className="meta small">measured</div>}
                  </td>
                  {kind === "idea" ? (
                    <>
                      <td>{i.reviewer ?? "—"}</td>
                      <td className={reviewLate ? "msg-err" : ""}>{au(i.reviewDue)}</td>
                      <td>{i.horizon === "LONG" ? "Long term" : "Short term"}</td>
                    </>
                  ) : (
                    <>
                      <td>{i.owner ?? "—"}</td>
                      <td>
                        <span className="pbar">
                          <i style={{ width: `${i.steps.length ? (done / i.steps.length) * 100 : 0}%`, background: late ? "var(--red)" : undefined }} />
                        </span>{" "}
                        <span className="small">
                          {done}/{i.steps.length}
                          {late && <span className="msg-err"> · late</span>}
                        </span>
                      </td>
                      <td>{au(i.dueDate)}</td>
                    </>
                  )}
                  <td>
                    <Pill tone={STAGE_TONE[i.stage]}>{stageLabel(i.stage)}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const OVERVIEW_TABS = [
  { key: "week", label: "This week" },
  { key: "timeline", label: "Timeline" },
  { key: "short", label: "Next 3 months" },
  { key: "long", label: "Next 12 months" },
];

function Overview({ items, today, q, href, card, tab: rawTab, zoom, focus, cats, cat, catChips, inCat }: { items: Imp[]; today: Date; q: (o: Record<string, string | null>) => string; href: (i: Imp) => string; card: string | null; tab?: string; zoom: string; focus: string | null; cats: Array<{ key: string; name: string }>; cat: string | null; catChips: React.ReactNode; inCat: (i: Imp) => boolean }) {
  const delivered = items.filter((i) => ["DONE", "VERIFIED"].includes(i.stage) && i.measuredMonthly != null);
  const deliveredYr = delivered.reduce((a, i) => a + Number(i.measuredMonthly) * 12, 0);
  const prog = items.filter((i) => ["APPROVED", "IN_PROGRESS"].includes(i.stage));
  const lateProg = prog.filter((i) => i.steps.some((s) => stepState(s, today) === "late"));
  const waiting = items.filter((i) => i.stage === "IDEA");
  const verified = items.filter((i) => i.stage === "VERIFIED");
  // Focusing an initiative (click in the timeline) opens the Timeline tab
  const tab = focus && !rawTab ? "timeline" : pickTab(rawTab, OVERVIEW_TABS);
  const tile = (k: string, l: string, v: string, s: string, tone = "") => (
    <Link href={q({ card: card === k ? null : k })} className={"kpi clickable " + tone + (card === k ? " on" : "")} aria-pressed={card === k} scroll={false}>
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className="s">{s}</div>
    </Link>
  );
  const weekEnd = new Date(today.getTime() + 7 * 86400000);
  const week = [
    ...waiting.filter((i) => i.reviewDue && i.reviewDue <= weekEnd).map((i) => ({ href: href(i), cls: "rv" + (i.reviewDue! < today ? " late" : ""), text: `Review: ${i.name}`, when: i.reviewDue! })),
    ...prog.flatMap((i) => i.steps.filter((s) => s.status !== "DONE" && s.due && s.due <= weekEnd).map((s) => ({ href: href(i), cls: "st" + (stepState(s, today) === "late" ? " late" : ""), text: `${s.name} · ${i.name}${s.owner ? ` (${s.owner})` : ""}`, when: s.due! }))),
  ].sort((a, b) => a.when.getTime() - b.when.getTime());
  const focused = focus ? items.find((i) => i.id === focus) : null;
  const road: RoadItem[] = focused
    ? focused.steps.map((s) => ({ id: s.id, name: s.name, kind: "step", start: s.start, end: s.due, progress: s.status === "DONE" ? 1 : s.status === "IN_PROGRESS" ? 0.5 : 0, late: stepState(s, today) === "late", href: href(focused), sub: s.owner ?? undefined }))
    : items
        .filter((i) => inCat(i) && !["REJECTED", "PARKED"].includes(i.stage))
        .map((i) =>
          isInitiative(i.stage)
            ? { id: i.id, name: i.name, kind: "initiative" as const, start: i.startDate, end: i.dueDate, progress: i.steps.length ? i.steps.filter((s) => s.status === "DONE").length / i.steps.length : 0, late: i.steps.some((s) => stepState(s, today) === "late"), href: q({ focus: i.id }) }
            : { id: i.id, name: i.name, kind: "idea" as const, start: i.reviewDue, end: i.reviewDue, href: href(i) },
        );
  const marks = [
    ...waiting.filter((i) => i.reviewDue).map((i) => ({ date: i.reviewDue!, kind: "review" as const, href: href(i), title: `Review: ${i.name}` })),
    ...prog.flatMap((i) => i.steps.filter((s) => s.due && s.status !== "DONE").map((s) => ({ date: s.due!, kind: "step" as const, href: href(i), title: `${s.name} · ${i.name}` }))),
  ];
  const quarters = [0, 1, 2, 3].map((k) => {
    const f = new Date(Date.UTC(today.getUTCFullYear(), Math.floor(today.getUTCMonth() / 3) * 3 + k * 3, 1));
    return { f, t: new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 3, 1)) };
  });
  const when = (i: Imp) => (isInitiative(i.stage) ? i.dueDate : i.reviewDue);
  const list = (rows: Imp[]) => <ItemTable items={rows} kind={rows.some((i) => isInitiative(i.stage)) ? "initiative" : "idea"} href={href} catName={(k) => cats.find((c) => c.key === k)?.name ?? k} today={today} />;
  return (
    <>
      <div className="kpis tabtiles ovtiles">
        {tile("delivered", "Savings delivered", aud(deliveredYr), `a year · ${delivered.length} measured`, "green")}
        {tile("progress", "Initiatives in progress", String(prog.length), lateProg.length ? `${lateProg.length} late` : "none late", lateProg.length ? "red" : "")}
        {tile("waiting", "Ideas waiting for review", String(waiting.length), `${waiting.filter((i) => i.reviewDue && i.reviewDue < today).length} past the review date`)}
        {tile("verified", "Verified", String(verified.length), aud(verified.reduce((a, i) => a + Number(i.measuredMonthly ?? 0) * 12, 0)) + " a year")}
      </div>
      {card === "delivered" && list(delivered)}
      {card === "progress" && list(prog)}
      {card === "waiting" && list(waiting)}
      {card === "verified" && list(verified)}
      {!card && (
        <>
          <PageTabs label="Improvements overview" tabs={OVERVIEW_TABS} current={tab} href={(k) => q({ tab: k })} />
          {tab === "week" && (
          <Card title="This week" sub="Idea reviews (amber) and project steps (blue) due in the next 7 days, and anything late (red).">
            {week.length ? (
              <div className="weekstrip">
                {week.map((w, k) => (
                  <Link key={k} href={w.href} className={w.cls} scroll={false}>
                    <span className="meta small">{au(w.when)}</span> {w.text}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="empty">Nothing due this week.</p>
            )}
          </Card>
          )}
          {tab === "timeline" && (
          <Card title={focused ? `Timeline · ${focused.name}` : "Timeline"} sub={focused ? "The project's steps. Edit them in the project panel." : "Ideas = diamond at the review date; initiatives = bars with progress. Click an initiative to zoom into its steps."}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              {focused ? (
                <Link href={q({ focus: null })} className="lnk">
                  ← All items
                </Link>
              ) : (
                <div className="seg">
                  <Link href={q({ cat: null })} aria-pressed={!cat}>
                    All
                  </Link>
                  {cats.map((c) => (
                    <Link key={c.key} href={q({ cat: c.key })} aria-pressed={cat === c.key}>
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
              <div className="seg">
                {ZOOMS.map(([k, l]) => (
                  <Link key={k} href={q({ zoom: k === "quarter" ? null : k })} aria-pressed={zoom === k} scroll={false}>
                    {l}
                  </Link>
                ))}
              </div>
            </div>
            <Roadmap items={road} zoom={zoom} today={today} />
          </Card>
          )}
          {tab === "short" && (
          <Card title="Short-term plan · next 3 months" sub="Amber = idea review · blue = step due. Click a day for the item.">
            <MonthCalendars marks={marks} today={today} />
          </Card>
          )}
          {tab === "long" && (
          <Card title="Long-term plan · next 12 months" sub="By quarter: ideas by review date, initiatives by due date.">
            <div className="quarters">
              {quarters.map(({ f, t }) => {
                const rows = items.filter((i) => !["REJECTED"].includes(i.stage) && when(i) && when(i)! >= f && when(i)! < t);
                return (
                  <div key={iso(f)} className="q">
                    <h4>
                      {f.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })}–{new Date(t.getTime() - 86400000).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" })}
                    </h4>
                    {rows.length ? (
                      rows.map((i) => (
                        <Link key={i.id} href={href(i)} scroll={false}>
                          {isInitiative(i.stage) ? "▬" : "◆"} {i.name} <span className="meta">{aud(saving(i))}/mo</span>
                        </Link>
                      ))
                    ) : (
                      <span className="meta small">Nothing planned.</span>
                    )}
                  </div>
                );
              })}
            </div>
            {items.some((i) => i.horizon === "LONG" && !when(i)) && <p className="meta">Long-term ideas without a date: {items.filter((i) => i.horizon === "LONG" && !when(i)).map((i) => i.name).join(", ")}</p>}
          </Card>
          )}
        </>
      )}
    </>
  );
}

function ImpPanel({ i, catName, users, staff, today, q }: { i: Imp; catName: (k: string) => string; users: string[]; staff: string[]; today: Date; q: (o: Record<string, string | null>) => string }) {
  const blocks = (i.calc as unknown as CalcBlock[]) ?? [];
  const r = calcSaving(blocks);
  const m = (i.mapping ?? {}) as { prefillBasis?: string; site?: string };
  const init = isInitiative(i.stage);
  const userOpts: Array<[string, string]> = [["", "—"], ...users.map((u) => [u, u] as [string, string])];
  return (
    <Drawer label={i.name}>
      <DrawerHeader kicker={`${init ? "Initiative" : "Idea"} · ${catName(i.category)}${i.sub ? ` → ${i.sub}` : ""}${i.detail ? ` → ${i.detail}` : ""} · ${stageLabel(i.stage)}`} title={i.name} />
      <StageButtons id={i.id} stage={i.stage} canVerify={i.measuredMonthly != null && i.monthsConfirmed >= 1} />
      <div className="tsec">
        <div className="tsec-h">Saving</div>
        <div className="kpis">
          <div className="kpi">
            <div className="l">Estimated</div>
            <div className="v" style={{ fontSize: 18 }}>
              {aud(r.monthly)}/mo
            </div>
            <div className="s">{aud(r.monthly != null ? r.monthly * 12 : null)} a year</div>
          </div>
          <div className={"kpi" + (i.measuredMonthly != null ? " green" : "")}>
            <div className="l">Measured</div>
            <div className="v" style={{ fontSize: 18 }}>
              {i.measuredMonthly != null ? `${aud(Number(i.measuredMonthly))}/mo` : "—"}
            </div>
            <div className="s">{i.monthsConfirmed ? `${i.monthsConfirmed} month${i.monthsConfirmed > 1 ? "s" : ""} of data` : "after the change"}</div>
          </div>
          <div className="kpi">
            <div className="l">Payback</div>
            <div className="v" style={{ fontSize: 18 }}>
              {r.paybackMonths != null ? `${r.paybackMonths.toFixed(1)} mo` : "—"}
            </div>
            <div className="s">{r.investment ? `on ${aud(r.investment)}` : "no investment"}</div>
          </div>
        </div>
        <dl className="fl" style={{ marginTop: 10 }}>
          <dt>Saving type</dt>
          <dd>
            <FieldEdit id={i.id} field="savingType" value={i.savingType} type="select" options={SAVING_TYPES.map(([k, l]) => [k, l])} />
          </dd>
          {init && (
            <>
              <dt>Measured saving / month $</dt>
              <dd>
                <FieldEdit id={i.id} field="measuredMonthly" value={i.measuredMonthly != null ? String(Number(i.measuredMonthly)) : ""} type="number" placeholder="after − baseline" width={120} />
              </dd>
              <dt>Months of data confirming it</dt>
              <dd>
                <FieldEdit id={i.id} field="monthsConfirmed" value={String(i.monthsConfirmed)} type="select" options={[["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"]]} />
              </dd>
            </>
          )}
        </dl>
      </div>
      <div className="tsec">
        <div className="tsec-h">Calculation · what changes: {i.changes.map((c) => CHANGES.find((x) => x[0] === c)?.[1] ?? c).join(", ") || "—"}</div>
        <CalcEditor key={JSON.stringify(blocks)} id={i.id} blocks={blocks} basis={m.prefillBasis} />
      </div>
      <div className="tsec">
        <div className="tsec-h">Details</div>
        <dl className="fl">
          <dt>Name</dt>
          <dd>
            <FieldEdit id={i.id} field="name" value={i.name} width={280} />
          </dd>
          <dt>Description</dt>
          <dd>
            <FieldEdit id={i.id} field="description" value={i.description ?? ""} width={320} />
          </dd>
          {!init ? (
            <>
              <dt>Reviewer</dt>
              <dd>
                <FieldEdit id={i.id} field="reviewer" value={i.reviewer ?? ""} type="select" options={userOpts} />
              </dd>
              <dt>Review by</dt>
              <dd>
                <FieldEdit id={i.id} field="reviewDue" value={iso(i.reviewDue)} type="date" />
                {i.stage === "IDEA" && i.reviewDue && i.reviewDue < today && <span className="msg-err small"> past due</span>}
              </dd>
              <dt>Horizon</dt>
              <dd>
                <FieldEdit id={i.id} field="horizon" value={i.horizon} type="select" options={[["SHORT", "Short term"], ["LONG", "Long term"]]} />
              </dd>
            </>
          ) : (
            <>
              <dt>Priority (1 = first)</dt>
              <dd>
                <FieldEdit id={i.id} field="priority" value={i.priority != null ? String(i.priority) : ""} type="number" width={70} />
              </dd>
              <dt>Owner</dt>
              <dd>
                <FieldEdit id={i.id} field="owner" value={i.owner ?? ""} type="select" options={userOpts} />
              </dd>
              <dt>Start · due</dt>
              <dd>
                <FieldEdit id={i.id} field="startDate" value={iso(i.startDate)} type="date" /> <FieldEdit id={i.id} field="dueDate" value={iso(i.dueDate)} type="date" />
              </dd>
            </>
          )}
        </dl>
      </div>
      {init && (
        <>
          <div className="tsec">
            <div className="tsec-h">
              Project steps{" "}
              <Link href={q({ section: "overview", focus: i.id, panel: null, card: null })} className="lnk">
                Show on timeline
              </Link>
            </div>
            <StepsEditor id={i.id} owners={[...new Set([...users, ...i.participants])]} steps={i.steps.map((s) => ({ id: s.id, name: s.name, start: iso(s.start), due: iso(s.due), owner: s.owner ?? "", status: s.status, state: stepState(s, today), kind: s.kind }))} />
          </div>
          <div className="tsec">
            <div className="tsec-h">People</div>
            <Participants id={i.id} people={i.participants} staff={staff} />
          </div>
        </>
      )}
      <div className="tsec">
        <div className="tsec-h">Updates & comments</div>
        <CommentBox id={i.id} />
        {i.comments.map((c) => (
          <p key={c.id} className="small" style={{ margin: "8px 0 0" }}>
            <strong>{c.by}</strong> <span className="meta">{c.at.toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            <br />
            {c.text}
          </p>
        ))}
      </div>
      <p className="meta small">
        Created by {i.createdBy} on {au(i.createdAt)} · <LogsButton entity="improve" id={i.id} count={0} />
      </p>
    </Drawer>
  );
}
