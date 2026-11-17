import Link from "next/link";
import { Card, EmptyState } from "@/components/ui/card";
import { Drawer, DrawerHeader } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { parsePanel } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { ForecastToggle, NewReportForm, SharePanel } from "@/components/reports/controls";
import { ReportView } from "@/components/reports/view";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { TEMPLATES, buildReport } from "@/lib/reports/build";
import type { WorkloadFilter } from "@/lib/reports/data";
import { allowedFor } from "@/lib/reports/recipients";
import { plainError } from "@/lib/plain-error";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

const CLS: Record<string, [string, "blue" | "green" | "red" | "grey"]> = { INTERNAL: ["Internal", "grey"], CLIENT_SAFE: ["Client-safe", "green"], EXTERNAL: ["External finance", "red"] };
const SCHED: Record<string, string> = { OFF: "not scheduled", WEEKLY: "weekly · Monday", MONTHLY: "monthly · 1st business day", QUARTERLY: "quarterly · 5th business day" };
const MODE: Record<string, string> = { DRY_RUN: "dry run", DRAFT: "Front draft", AUTO: "auto-send" };
const FILTERS: WorkloadFilter[] = ["all", "single", "b2c", "b2b"];
const au = (d: Date) => d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Reports (brief §9): saved reports, the same view on screen and in the PDF, sent through Front. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const [reports, clients] = await Promise.all([
    prisma.report.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { sends: { orderBy: { at: "desc" }, take: 8 } } }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const showNew = one("new") === "1" || !reports.length;
  const cur = showNew ? null : (reports.find((r) => r.id === one("r")) ?? reports[0]);
  const f = (FILTERS.includes(one("f") as WorkloadFilter) ? one("f") : "all") as WorkloadFilter;
  const built = cur ? await buildReport(cur, { filter: f }) : null;
  const panel = parsePanel(sp.panel);
  const href = (q: Record<string, string>) => "/reports?" + new URLSearchParams({ ...(cur ? { r: cur.id } : {}), ...q }).toString();
  const kpiLinks = cur?.template === "workload" ? FILTERS.map((k) => ({ href: href({ f: k }), on: f === k })) : undefined;
  const cname = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Saved reports. What you see here is exactly what goes into the PDF. Emails go out through Front; every send is checked first."
        actions={
          <>
            {cur && (
              <Link className="btn primary" href={href({ f, panel: `share:${cur.id}` })} scroll={false}>
                Email / PDF
              </Link>
            )}
            <Link className="btn" href="/reports?new=1">
              + New report
            </Link>
          </>
        }
      />
      {reports.length > 0 && (
        <nav className="replist" aria-label="Saved reports">
          {reports.map((r) => (
            <Link key={r.id} href={`/reports?r=${r.id}`} aria-current={r.id === cur?.id}>
              <span>
                {r.name} <Pill tone={CLS[r.cls]?.[1] ?? "grey"}>{CLS[r.cls]?.[0] ?? r.cls}</Pill>
              </span>
              <small>
                {SCHED[r.schedule]}
                {r.schedule !== "OFF" && ` · ${r.sendTime} · ${MODE[r.mode]}`}
              </small>
            </Link>
          ))}
        </nav>
      )}
      {showNew && (
        <Card title="New report" sub="Pick a template and period. Client-safe reports cover one client and never show costs, margins or other clients.">
          <NewReportForm templates={Object.entries(TEMPLATES).map(([k, t]) => [k, t.label])} clients={clients.map((c) => [c.id, c.name])} initialTemplate={TEMPLATES[one("template") ?? ""] ? one("template") : undefined} />
          {!reports.length && <p className="meta">No saved reports yet — save one to see it here.</p>}
        </Card>
      )}
      {cur && built && (
        <>
          <Card
            title={built.title}
            sub={built.subtitle}
            tone="hl"
          >
            <div className="row small">
              {cur.cls === "CLIENT_SAFE" && <span className="meta">For {cname(cur.clientId)} only</span>}
              {["trends", "quarterly", "volumes", "finance", "yearly"].includes(cur.template) && <ForecastToggle id={cur.id} on={cur.forecast} />}
            </div>
            {cur.template === "workload" && <p className="meta">Click a card to filter the tables (all · single-SKU · B2C · B2B).</p>}
          </Card>
          <ReportView rep={built} kpiLinks={kpiLinks} />
          {cur.sends.length > 0 && (
            <Card title="Last sends">
              <div className="tw">
                <table>
                  <tbody>
                    {cur.sends.map((s) => (
                      <tr key={s.id}>
                        <td className="small">{au(s.at)}</td>
                        <td>{MODE[s.mode] ?? s.mode}</td>
                        <td className="small">{s.to.join(", ") || "—"}</td>
                        <td>{s.ok ? <Pill tone="green">sent</Pill> : <Pill tone="red">blocked</Pill>}</td>
                        <td className="small">{s.error ? plainError(s.error, { log: false }) : s.by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
      {!cur && !showNew && <EmptyState title="Nothing here">Pick a report.</EmptyState>}
      {panel?.kind === "share" && cur && panel.id === cur.id && (
        <Drawer label="Email / PDF">
          <DrawerHeader kicker={`${CLS[cur.cls]?.[0]} · ${TEMPLATES[cur.template]?.label ?? cur.template}`} title={cur.name} />
          <SharePanel
            r={{ id: cur.id, cls: cur.cls, mode: cur.mode, schedule: cur.schedule, sendTime: cur.sendTime, recipients: cur.recipients, costing: cur.costing, approvedAt: cur.approvedAt?.toISOString() ?? null, approvedBy: cur.approvedBy }}
            allowed={await allowedFor(cur)}
            isOwner={user.role === "OWNER"}
          />
        </Drawer>
      )}
    </>
  );
}
