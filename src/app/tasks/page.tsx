import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { parseSection } from "@/components/ui/sections";
import { WithSubNav } from "@/components/ui/sub-nav";
import { NoticeActions, TaskButtons } from "@/components/work/buttons";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks" };

const au = (d: Date | null) => (d ? d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const days = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86400000);

/** Tasks (brief §13): what's new after syncs, then open / snoozed / done follow-ups. Resolve checks the source. */
export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const section = parseSection("tasks", (await searchParams).section);
  const now = new Date();
  const where =
    section === "open"
      ? { OR: [{ status: "OPEN" as const }, { status: "SNOOZED" as const, snoozedUntil: { lt: now } }] }
      : section === "snoozed"
        ? { status: "SNOOZED" as const, snoozedUntil: { gte: now } }
        : { status: "DONE" as const, doneAt: { gte: new Date(now.getTime() - 30 * 86400000) } };
  const [tasks, notices, clients] = await Promise.all([
    prisma.task.findMany({ where, orderBy: section === "done" ? { doneAt: "desc" } : [{ priority: "asc" }, { createdAt: "asc" }], take: 300 }),
    section === "open" ? prisma.notification.findMany({ where: { state: "NEW" }, orderBy: { createdAt: "desc" }, take: 100 }) : Promise.resolve([]),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const cname = (id: string | null) => clients.find((c) => c.id === id)?.name;
  return (
    <WithSubNav page="tasks" current={section}>
      <PageHeader title="Tasks" subtitle={section === "open" ? "What's new after the syncs, and every follow-up to do by hand. Resolve checks the source where it can; a failed check snoozes the task for 24 hours." : section === "snoozed" ? "Snoozed — re-checked after each sync and closed by themselves when the check passes." : "Done in the last 30 days."} />
      {notices.length > 0 && (
        <Card title={`New since the last sync · ${notices.length}`} tone="hl" sub="Add to Analytics fills in what the source knows; you complete the rest. Saving is never blocked — missing steps become tasks.">
          <div className="tw">
            <table>
              <tbody>
                {notices.map((n) => (
                  <tr key={n.id}>
                    <td style={{ width: 120 }}>
                      <Pill tone="blue">{n.kind === "NEW_STAFF" ? "staff" : n.kind === "NEW_CLIENT" ? "client" : n.kind === "NEW_TENANT" ? "WMS tenant" : "new"}</Pill>
                    </td>
                    <td className="sup">
                      {n.title}
                      {n.detail && <div className="meta">{n.detail}</div>}
                    </td>
                    <td style={{ minWidth: 300 }}>
                      <NoticeActions id={n.id} kind={n.kind} clients={clients} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card title={`${section === "open" ? "Open" : section === "snoozed" ? "Snoozed" : "Done"} · ${tasks.length}`}>
        {!tasks.length ? (
          <p className="empty">Nothing here.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Where</th>
                  <th>Owner</th>
                  <th>{section === "done" ? "Done" : "Age"}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td className="sup">
                      {t.priority === "High" && <Pill tone="red">high</Pill>} {t.title}
                      {cname(t.clientId) && <div className="meta">{cname(t.clientId)}</div>}
                      {t.detail && <div className="meta">{t.detail}</div>}
                      {t.lastCheck && <div className={t.status === "DONE" ? "msg-ok" : "msg-err"}>{t.lastCheck}</div>}
                    </td>
                    <td>
                      {t.link ? (
                        <Link href={t.link} target={t.link.startsWith("http") ? "_blank" : undefined} className="lnk">
                          {t.where ?? "Open"}
                        </Link>
                      ) : (
                        (t.where ?? "—")
                      )}
                    </td>
                    <td>{t.owner ?? "—"}</td>
                    <td className="small">{section === "done" ? `${au(t.doneAt)} · ${t.doneBy ?? ""}` : section === "snoozed" ? `until ${au(t.snoozedUntil)}` : `${days(t.createdAt)} d`}</td>
                    <td>
                      <TaskButtons id={t.id} hasCheck={!!t.verify} status={t.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </WithSubNav>
  );
}
