import Link from "next/link";
import { NotConnected } from "@/components/ui/not-connected";
import { Card, EmptyState } from "@/components/ui/card";
import { Drawer, DrawerHeader } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { parsePanel } from "@/components/ui/panel";
import { parseSection } from "@/components/ui/sections";
import { WithSubNav } from "@/components/ui/sub-nav";
import { Workbench, type WbLine } from "@/components/work/workbench";
import { ReviewEditor, NewReview } from "@/components/work/review-editor";
import { LogsButton } from "@/components/model/editable";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { availableMonths, buildInput, loadCostRun } from "@/lib/cost/load";
import { getRules } from "@/lib/model/store";
import { STAGES, TYPES } from "@/lib/rates/review";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rate review" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const au = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : "—");

/** Rate review (brief §8): calendar of reviews, reviews in progress by stage, and the workbench. */
export default async function RatesPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const sp = await searchParams;
  const section = parseSection("rates", one(sp.section));
  const clients = await prisma.client.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { name: "asc" } });
  const reviews = await prisma.rateReview.findMany({ where: { closed: false }, orderBy: { createdAt: "asc" } });
  const panel = parsePanel(sp.panel);
  const cn = (id: string) => clients.find((c) => c.id === id)?.shortName || clients.find((c) => c.id === id)?.name || "?";
  return (
    <WithSubNav page="rates" current={section}>
      <PageHeader title={section === "calendar" ? "Rate review calendar" : section === "progress" ? "Reviews in progress" : "Rate review · workbench"} subtitle={section === "calendar" ? "When each client's rates are reviewed in the next 12 months. Dates come from CLM once connected; until then from Settings → Clients (renewal) and the reviews started here." : section === "progress" ? "Every open review and its stage. Click a card to change stage, owner or due date." : "Costs are TDABC. Set new rates; CLM builds the schedule of rates for the amendment."} actions={<NewReview clients={clients.map((c) => ({ id: c.id, name: c.shortName || c.name }))} />} />
      {section === "calendar" && <Calendar clients={clients} reviews={reviews} />}
      {section === "progress" && <Progress reviews={reviews} cn={cn} />}
      {section === "workbench" && <WorkbenchSection clients={clients} clientId={one(sp.client) ?? clients[0]?.id ?? null} reviewId={one(sp.review) ?? null} />}
      {panel?.kind === "review" && <ReviewPanel id={panel.id} cn={cn} me={me.name} />}
    </WithSubNav>
  );
}

function Calendar({ clients, reviews }: { clients: Awaited<ReturnType<typeof prisma.client.findMany>>; reviews: Awaited<ReturnType<typeof prisma.rateReview.findMany>> }) {
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)));
  const idx = (d: Date) => (d.getUTCFullYear() - months[0].getUTCFullYear()) * 12 + d.getUTCMonth() - months[0].getUTCMonth();
  const rows = clients.map((c) => {
    const ev: Array<{ k: number; type: keyof typeof TYPES; label: string; id?: string }> = [];
    if (c.renewalDate) {
      const i = idx(c.renewalDate);
      if (i >= 0 && i < 12) ev.push({ k: i, type: "RENEWAL", label: `Renewal ${au(c.renewalDate)}` });
      // CPI on the contract anniversary in the years before renewal
      for (let y = -1; y <= 1; y++) {
        const a = new Date(Date.UTC(months[0].getUTCFullYear() + y, c.renewalDate.getUTCMonth(), c.renewalDate.getUTCDate()));
        const j = idx(a);
        if (j >= 0 && j < 12 && a < c.renewalDate) ev.push({ k: j, type: "CPI", label: `CPI on the anniversary ${au(a)}` });
      }
    }
    for (const m of months) if (m.getUTCMonth() === 6) ev.push({ k: idx(m), type: "CARRIER", label: "AusPost July increase → postage rates (Dyspatch SELL cards)" });
    for (const r of reviews.filter((x) => x.clientId === c.id && x.due)) {
      const i = idx(r.due!);
      if (i >= 0 && i < 12) ev.push({ k: i, type: r.type, label: `${TYPES[r.type][0]} · due ${au(r.due)} · ${STAGES[r.stage]}`, id: r.id });
    }
    return { c, ev };
  });
  if (!clients.length) return <EmptyState title="No clients yet">Add clients in Settings → Clients.</EmptyState>;
  return (
    <>
      <div className="row small" style={{ marginBottom: 8 }}>
        {Object.values(TYPES).map(([l, col]) => (
          <span key={l}>
            <i className="mc" style={{ background: col }} /> {l}
          </span>
        ))}
        <NotConnected source="clm" until="reviews started here and renewal dates in Settings → Clients" />
      </div>
      <Card>
        <div className="tw">
          <table className="rrcal">
            <thead>
              <tr>
                <th>Client</th>
                {months.map((m) => (
                  <th key={m.toISOString()}>{m.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" }) + (m.getUTCMonth() === 0 || m === months[0] ? ` ${String(m.getUTCFullYear()).slice(2)}` : "")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, ev }) => (
                <tr key={c.id}>
                  <td className="sup">
                    {c.shortName || c.name}
                    <div className="meta">{c.renewalDate ? `renews ${au(c.renewalDate)}` : <Link href={`/settings?section=clients&panel=client:${c.id}`}>add renewal date</Link>}</div>
                  </td>
                  {months.map((m, k) => (
                    <td key={k}>
                      {ev
                        .filter((e) => e.k === k)
                        .map((e, i) =>
                          e.id ? (
                            <Link key={i} href={`/rates?panel=review:${e.id}`} className="rrdot" style={{ background: TYPES[e.type][1] }} title={e.label} aria-label={e.label} scroll={false} />
                          ) : (
                            <span key={i} className="rrdot" style={{ background: TYPES[e.type][1], opacity: e.type === "CARRIER" ? 0.45 : 1 }} title={e.label} />
                          ),
                        )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="meta">Hover a dot for what it is; dots for started reviews open them. Ad-hoc reviews start from Leakage → Under-pricing.</p>
      </Card>
    </>
  );
}

function Progress({ reviews, cn }: { reviews: Awaited<ReturnType<typeof prisma.rateReview.findMany>>; cn: (id: string) => string }) {
  return (
    <div className="kanban">
      {STAGES.map((st, k) => (
        <div key={st} className="kcol">
          <div className="kh">
            {st} <span className="meta">{reviews.filter((r) => r.stage === k).length}</span>
          </div>
          {reviews
            .filter((r) => r.stage === k)
            .map((r) => (
              <Link key={r.id} href={`/rates?section=progress&panel=review:${r.id}`} className="kcard" scroll={false}>
                <strong>{cn(r.clientId)}</strong>
                <span className="pill" style={{ background: TYPES[r.type][1] + "22", color: TYPES[r.type][1], whiteSpace: "normal" }}>
                  {TYPES[r.type][0]}
                </span>
                <span className="meta">
                  {r.owner ?? "—"} · due {au(r.due)}
                </span>
              </Link>
            ))}
        </div>
      ))}
    </div>
  );
}

async function WorkbenchSection({ clients, clientId, reviewId }: { clients: Awaited<ReturnType<typeof prisma.client.findMany>>; clientId: string | null; reviewId: string | null }) {
  if (!clientId) return <EmptyState title="No clients yet">Add clients in Settings → Clients.</EmptyState>;
  const run = await loadCostRun();
  const rules = await getRules();
  const months = (await availableMonths()).slice(0, 3);
  const vol = new Map<string, number>();
  for (const m of months) {
    const { input } = await buildInput(m);
    for (const v of input.clients.find((c) => c.id === clientId)?.volumes ?? []) vol.set(v.serviceCode, (vol.get(v.serviceCode) ?? 0) + v.qty / months.length);
  }
  const [services, rates] = await Promise.all([prisma.service.findMany({ where: { billable: true, active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }), prisma.clientRate.findMany({ where: { clientId } })]);
  const c = clients.find((x) => x.id === clientId);
  const siteKey = c?.sites[0] ?? run.input.sites[0]?.key ?? "smi";
  const lines: WbLine[] = services.map((s) => ({ code: s.code, name: s.name, unit: s.unit, rate: rates.find((r) => r.serviceCode === s.code) ? Number(rates.find((r) => r.serviceCode === s.code)!.rate) : null, cost: run.result.unit(s.code, "T", siteKey).total, avg3: vol.get(s.code) ?? 0 })).filter((l) => l.rate != null || l.avg3 > 0);
  const review = reviewId ? await prisma.rateReview.findUnique({ where: { id: reviewId } }) : await prisma.rateReview.findFirst({ where: { clientId, closed: false }, orderBy: { createdAt: "desc" } });
  const csr = run.result.pools.find((p) => p.kind === "LABOUR" && !p.site);
  const tickets = await prisma.frontTicketMonth.findMany({ where: { clientId }, orderBy: { month: "desc" }, take: 3 });
  const acc = csr?.rateT && tickets.length ? (tickets.reduce((a, t) => a + t.tickets, 0) / tickets.length) * 10 * csr.rateT : null;
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="small">Client</span>
        {clients.slice(0, 40).map((x) => (
          <Link key={x.id} href={`/rates?section=workbench&client=${x.id}`} className={"btn" + (x.id === clientId ? " on" : "")} scroll={false}>
            {x.shortName || x.name}
          </Link>
        ))}
      </div>
      <Card title={`${c?.name} · ${review ? `review: ${TYPES[review.type][0]}, ${STAGES[review.stage]}` : "no review open — saving starts one"}`} sub={`Costs from ${run.month} (TDABC, ${run.input.sites.find((s) => s.key === siteKey)?.name ?? siteKey}); volumes = average of ${months.join(", ")}.`}>
        {!lines.length ? (
          <p className="empty">No rated services or volumes for this client yet.</p>
        ) : (
          <Workbench clientId={clientId} lines={lines} reviewId={review?.id ?? null} saved={(review?.newRates ?? {}) as Record<string, number>} floor={rules.marginFloor ?? 0.15} ticketsCost={acc} />
        )}
        <p className="meta" style={{ marginBottom: 0 }}>Account management = average Front tickets a month × 10 min × CSR cost per minute (rule E — minutes by ticket type — still open).</p>
      </Card>
    </>
  );
}

async function ReviewPanel({ id, cn }: { id: string; cn: (id: string) => string; me: string }) {
  const r = await prisma.rateReview.findUnique({ where: { id } });
  if (!r) return null;
  const users = await prisma.user.findMany({ where: { active: true }, select: { name: true } });
  return (
    <Drawer label="Rate review">
      <DrawerHeader kicker={TYPES[r.type][0]} title={cn(r.clientId)} />
      <ReviewEditor id={r.id} stage={r.stage} owner={r.owner ?? ""} due={r.due ? r.due.toISOString().slice(0, 10) : ""} note={r.note ?? ""} stages={STAGES} people={users.map((u) => u.name)} />
      <div className="tsec">
        <div className="tsec-h">Proposed rates</div>
        {Object.keys(r.newRates as object).length ? (
          <table>
            <tbody>
              {Object.entries(r.newRates as Record<string, number>).map(([k, v]) => (
                <tr key={k}>
                  <td className="mono small">{k}</td>
                  <td className="r num">${v.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="meta">None yet.</p>
        )}
        <Link href={`/rates?section=workbench&client=${r.clientId}&review=${r.id}`} className="lnk">
          Open in the workbench
        </Link>
      </div>
      <div className="tsec">
        <div className="tsec-h">Stages</div>
        <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
          {STAGES.map((s, k) => (
            <li key={s} style={{ fontWeight: k === r.stage ? 700 : 400, color: k < r.stage ? "var(--green)" : undefined }}>
              {s}
              {k === r.stage ? " · now" : ""}
            </li>
          ))}
        </ol>
      </div>
      <LogsButton entity="review" id={r.id} count={0} />
    </Drawer>
  );
}
