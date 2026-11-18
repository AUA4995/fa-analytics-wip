import Link from "next/link";
import { NotConnected } from "@/components/ui/not-connected";
import { EmptyState } from "@/components/ui/card";
import { Card } from "@/components/ui/card";
import { Drawer, DrawerHeader } from "@/components/ui/drawer";
import { parsePanel } from "@/components/ui/panel";
import { Workbench, type WbLine } from "@/components/work/workbench";
import { LogsButton } from "@/components/model/editable";
import { prisma } from "@/lib/db";
import { availableMonths, buildInput, loadCostRun } from "@/lib/cost/load";
import { getRules } from "@/lib/model/store";
import { TYPES } from "@/lib/rates/review";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Cost & margin → Rate workbench (batch 4, 16/11/2026). The rate review calendar and the stages board moved to CLM,
 * which owns contracts, renewal dates and negotiation stages; the workbench stays here because it works from cost
 * and margin. Reviews started here (or from Leakage → Under-pricing) keep their proposed rates.
 */
export async function RateWorkbench({ sp, me }: { sp: SP; me: string }) {
  const clients = await prisma.client.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { name: "asc" } });
  const panel = parsePanel(sp.panel);
  const cn = (id: string) => clients.find((c) => c.id === id)?.shortName || clients.find((c) => c.id === id)?.name || "?";
  return (
    <>
      {one(sp.moved) && <p className="meta">The rate review calendar and the stages board now live in CLM — Analytics keeps the workbench (costs, margins and the effect of new rates).</p>}
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <NotConnected source="clm" until="review dates and stages are kept in CLM; proposed rates are saved here" />
      </div>
      <WorkbenchSection clients={clients} clientId={one(sp.client) ?? clients[0]?.id ?? null} reviewId={one(sp.review) ?? null} />
      {panel?.kind === "review" && <ReviewPanel id={panel.id} cn={cn} me={me} />}
    </>
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
          <Link key={x.id} href={`/cost?section=workbench&client=${x.id}`} className={"btn" + (x.id === clientId ? " on" : "")} scroll={false}>
            {x.shortName || x.name}
          </Link>
        ))}
      </div>
      <Card title={`${c?.name} · ${review ? `review: ${TYPES[review.type][0]}` : "no review open — saving starts one"}`} sub={`Costs from ${run.month} (TDABC, ${run.input.sites.find((s) => s.key === siteKey)?.name ?? siteKey}); volumes = average of ${months.join(", ")}.`}>
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
  return (
    <Drawer label="Rate review">
      <DrawerHeader kicker={TYPES[r.type][0]} title={cn(r.clientId)} />
      {/* Stage, owner and due date live in the CLM's rate review calendar (decision 16/11) — not edited here */}
      <p className="meta">Stage, owner and due date are tracked in the CLM (rate review calendar). Analytics keeps only the proposed rates.</p>
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
        <Link href={`/cost?section=workbench&client=${r.clientId}&review=${r.id}`} className="lnk">
          Open in the workbench
        </Link>
      </div>
      <LogsButton entity="review" id={r.id} count={0} />
    </Drawer>
  );
}
