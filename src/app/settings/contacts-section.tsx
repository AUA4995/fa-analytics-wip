import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { AddRecipient, DomainsEditor, RemoveRecipient } from "@/components/model/contacts";
import { prisma } from "@/lib/db";
import { internalDomains } from "@/lib/reports/recipients";

/** Settings → Contacts & recipients (brief §10). The only place report recipients come from. */
export async function ContactsSection() {
  const [recs, clients, domains, xc] = await Promise.all([
    prisma.recipient.findMany({ orderBy: [{ list: "asc" }, { name: "asc" }] }),
    prisma.client.findMany({ select: { id: true, name: true, xeroContactId: true }, orderBy: { name: "asc" } }),
    internalDomains(),
    prisma.xeroContact.findMany({ where: { email: { not: null }, isCustomer: true }, select: { xeroId: true, name: true, email: true } }),
  ]);
  const cname = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "—";
  const on = new Set(recs.map((r) => r.email.toLowerCase()));
  const sugg = xc
    .map((x) => ({ x, c: clients.find((c) => c.xeroContactId === x.xeroId) }))
    .filter((s): s is { x: typeof s.x; c: NonNullable<typeof s.c> } => !!s.c && !!s.x.email && !on.has(s.x.email.toLowerCase()));
  const table = (list: "INTERNAL" | "CLIENT" | "LENDER") => {
    const rows = recs.filter((r) => r.list === list);
    return !rows.length ? (
      <p className="empty">No one yet.</p>
    ) : (
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              {list === "CLIENT" && <th>Client</th>}
              {list === "LENDER" && <th>Role</th>}
              <th>Added by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="sup">{r.name}</td>
                <td>{r.email}</td>
                {list === "CLIENT" && <td>{cname(r.clientId)}</td>}
                {list === "LENDER" && <td>{r.role ?? "—"}</td>}
                <td className="small">{r.createdBy}</td>
                <td>
                  <RemoveRecipient id={r.id} email={r.email} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  return (
    <>
      <p className="callout small">Reports can only be emailed to people on these lists. Internal reports → Internal; Client-safe → that client&apos;s contacts only; External finance → Lenders & advisers, after the owner approves.</p>
      <Card title="Internal people & domains" sub="Anyone at these domains counts as internal. Add outside people (e.g. a contractor) by name.">
        <div className="tsec-h">Internal domains</div>
        <DomainsEditor initial={domains} />
        <div style={{ marginTop: 14 }}>{table("INTERNAL")}</div>
        <AddRecipient list="INTERNAL" />
      </Card>
      <Card title="Client contacts" sub="Who gets each client's Client-safe reports. One email belongs to one client.">
        {table("CLIENT")}
        <AddRecipient list="CLIENT" clients={clients.map((c) => [c.id, c.name])} />
      </Card>
      <Card title="Lenders & advisers" sub="Bank, accountant, auditor, broker. External finance reports only, and only after approval.">
        {table("LENDER")}
        <AddRecipient list="LENDER" />
      </Card>
      <Card title={`Suggestions from Xero · ${sugg.length}`} sub="Emails on the Xero contacts of linked clients. Nothing is added until you click.">
        {!sugg.length ? (
          <p className="empty">No suggestions — run the Xero sync, or link clients to Xero contacts in Clients.</p>
        ) : (
          <div className="tw">
            <table>
              <tbody>
                {sugg.map(({ x, c }) => (
                  <tr key={x.xeroId}>
                    <td className="sup">
                      {x.name} <Pill tone="blue">Xero</Pill>
                    </td>
                    <td>{x.email}</td>
                    <td>{c.name}</td>
                    <td>
                      <AddRecipient list="CLIENT" preset={{ name: x.name, email: x.email!, clientId: c.id }} />
                    </td>
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
