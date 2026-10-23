import Link from "next/link";
import { Card, EmptyState } from "@/components/ui/card";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Drawer, DrawerHeader } from "@/components/ui/drawer";
import { Pill } from "@/components/ui/pill";
import { type PanelRef } from "@/components/ui/panel";
import { AddForm } from "@/components/model/add-form";
import { CsvImport } from "@/components/model/csv-import";
import { EditableValue, LogsButton } from "@/components/model/editable";
import { FieldList, plain } from "@/components/model/field-list";
import { AllocationMatrix } from "@/components/model/allocation-matrix";
import { DeleteButton } from "@/components/model/delete-button";
import { prisma } from "@/lib/db";
import { formatFieldValue } from "@/lib/model/fields";
import { ENTITY_FIELDS, POOL_DRIVERS, RULES, SITE_OPTIONS, STAFF_SITE_OPTIONS } from "@/lib/model/specs";
import { getRules, logCounts } from "@/lib/model/store";
import { IMPORT_COLUMNS } from "@/lib/model/csv";

/**
 * Settings → Rules · Clients · Suppliers · Staff & allocation · Services & minutes · Cost pools & mapping (chunk 2).
 * Every value is editable in place with its own Logs; rows open a details panel (?panel=kind:id) with all fields.
 */

const fv = (entity: string, field: string, v: unknown) => formatFieldValue(ENTITY_FIELDS[entity][field], plain(v));
const cols = (e: keyof typeof IMPORT_COLUMNS) => IMPORT_COLUMNS[e].map(([h]) => h.split("|")[0]).join(", ");

export async function RulesSection({ canEdit }: { canEdit: boolean }) {
  const [rules, sites] = await Promise.all([getRules(), prisma.site.findMany({ orderBy: { sortOrder: "asc" } })]);
  const counts = { ...(await logCounts("rule", ["rule"])), ...(await logCounts("site", sites.map((s) => s.key))) };
  const ruleCounts = Object.fromEntries(Object.keys(RULES).map((k) => [`rule|${k}`, counts[`rule|${k}`] ?? 0]));
  return (
    <>
      <Card title="Company rules" sub="Used everywhere: leakage checks, rate review, labour cost, B2B / B2C split. Click a value to change it; Logs shows every change.">
        <FieldList entity="rule" id="rule" row={rules} counts={ruleCounts} canEdit={canEdit} />
      </Card>
      <Card title="Sites" sub="Separate cost pools per site. Utilisation is an estimate until measured from the WMS; edit here or in any details panel — it's the same value.">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>Labour utilisation</th>
                <th>Space utilisation</th>
                <th>Pallet positions</th>
                <th>Owned</th>
                <th>Notional rent / month</th>
                <th>WMS codes</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <ClickableRow key={s.key} panel={`site:${s.key}`}>
                  <td className="sup">{s.name}</td>
                  {(["labourUtil", "spaceUtil", "palletPositions", "owned", "notionalRent", "wmsCodes"] as const).map((f) => (
                    <td key={f}>
                      <EditableValue entity="site" id={s.key} field={f} spec={ENTITY_FIELDS.site[f]} value={plain(s[f])} logCount={counts[`${s.key}|${f}`] ?? 0} canEdit={canEdit} compact />
                    </td>
                  ))}
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
        {rules.workersCompRate == null && <p className="callout amber" style={{ marginBottom: 0 }}>Workers comp rate is not set — labour cost leaves it out until it is (shown as a warning on Labour).</p>}
      </Card>
    </>
  );
}

export async function ClientsSection({ canEdit }: { canEdit: boolean }) {
  const clients = await prisma.client.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] });
  return (
    <Card title={`Clients · ${clients.length}`} sub="IDs link the same client across Xero, Dyspatch, the WMS and Front. Click a client for all its settings.">
      <div className="row" style={{ marginBottom: 10 }}>
        {canEdit && (
          <AddForm
            entity="client"
            label="Add client"
            fields={[
              { name: "name", label: "Name", width: 220 },
              { name: "shortName", label: "Short name", width: 120 },
              { name: "sites", label: "Sites", type: "multi", options: SITE_OPTIONS },
            ]}
          />
        )}
        {canEdit && <CsvImport entity="client" columns={cols("client")} />}
        <span className="meta">Clients new in Xero, Dyspatch or the WMS will appear as notifications once Data sources are connected.</span>
      </div>
      {!clients.length ? (
        <p className="empty">No clients yet. Add them, import a CSV, or wait for the Xero / WMS sync.</p>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Type</th>
                <th>Sites</th>
                <th>Xero</th>
                <th>Dyspatch / WMS tenant</th>
                <th className="r">Weekly minimum</th>
                <th className="r">CMC share</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <ClickableRow key={c.id} panel={`client:${c.id}`}>
                  <td className="sup">
                    {c.name}
                    {c.shortName && <div className="meta">{c.shortName}</div>}
                  </td>
                  <td>
                    <Pill tone={c.status === "ACTIVE" ? "green" : "grey"}>{fv("client", "status", c.status)}</Pill>
                  </td>
                  <td>{c.type}</td>
                  <td>{c.sites.map((s) => (s === "smi" ? "Smithfield" : s === "par" ? "Parramatta" : s)).join(", ") || "—"}</td>
                  <td>{c.xeroContactId ? <Pill tone="blue">linked</Pill> : <span className="meta">—</span>}</td>
                  <td className="mono small">{c.dyspatchCustomerId ?? "—"}</td>
                  <td className="r num">{fv("client", "weeklyMinimum", c.weeklyMinimum)}</td>
                  <td className="r num">{fv("client", "cmcShare", c.cmcShare)}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export async function SuppliersSection({ canEdit }: { canEdit: boolean }) {
  const [suppliers, pools] = await Promise.all([prisma.supplier.findMany({ orderBy: { name: "asc" } }), prisma.costPool.findMany({ orderBy: { sortOrder: "asc" } })]);
  const poolName = (k: string | null) => pools.find((p) => p.key === k)?.name ?? (k ? k : "—");
  return (
    <Card title={`Suppliers · ${suppliers.length}`} sub="Which cost pool each supplier's bills go to, fixed or variable (for break-even), and whether it's passed through to a client (left out of FA cost).">
      <div className="row" style={{ marginBottom: 10 }}>
        {canEdit && (
          <AddForm
            entity="supplier"
            label="Add supplier"
            fields={[
              { name: "name", label: "Name", width: 220 },
              { name: "poolKey", label: "Cost pool", type: "select", options: [["", "—"], ...pools.map((p) => [p.key, p.name] as const)] },
            ]}
          />
        )}
        <span className="meta">Suppliers with bills in Xero are suggested once Xero is synced (Data sources).</span>
      </div>
      {!suppliers.length ? (
        <p className="empty">No suppliers yet.</p>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Cost pool</th>
                <th>Site</th>
                <th>Fixed / variable</th>
                <th>Rebilled</th>
                <th className="r">Expected / month</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <ClickableRow key={s.id} panel={`supplier:${s.id}`}>
                  <td className="sup">{s.name}</td>
                  <td>{poolName(s.poolKey)}</td>
                  <td>{fv("supplier", "site", s.site)}</td>
                  <td>{fv("supplier", "behaviour", s.behaviour)}</td>
                  <td>{s.rebilled ? <Pill tone="amber">passed through</Pill> : "—"}</td>
                  <td className="r num">{fv("supplier", "expectedMonthly", s.expectedMonthly)}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export async function StaffSection({ canEdit, site }: { canEdit: boolean; site: string }) {
  const [staff, clients, allocs] = await Promise.all([
    prisma.staff.findMany({ orderBy: [{ pool: "asc" }, { name: "asc" }] }),
    prisma.client.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true, sites: true } }),
    prisma.staffAllocation.findMany(),
  ]);
  const inSite = (s: string) => site === "all" || s === site || s === "both";
  const st = staff.filter((s) => inSite(s.site));
  const cl = clients.filter((c) => site === "all" || c.sites.includes(site) || !c.sites.length);
  return (
    <>
      <Card title={`Staff · ${staff.length}`} sub="Site, pool, type and the codes each person uses in the three WMS (Thomax, 3PLWMS, Logiwa). Click a person for all fields.">
        <div className="row" style={{ marginBottom: 10 }}>
          {canEdit && (
            <AddForm
              entity="staff"
              label="Add staff member"
              fields={[
                { name: "name", label: "Name", width: 200 },
                { name: "site", label: "Site", type: "select", options: STAFF_SITE_OPTIONS },
                { name: "pool", label: "Pool", type: "select", options: ENTITY_FIELDS.staff.pool.options },
                { name: "position", label: "Position", width: 160 },
              ]}
            />
          )}
          {canEdit && <CsvImport entity="staff" columns={cols("staff")} />}
        </div>
        {!staff.length ? (
          <p className="empty">No staff yet. Add people, import a CSV, or wait for the Xero Payroll sync (new employees arrive as notifications).</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Site</th>
                  <th>Pool</th>
                  <th>Type</th>
                  <th>Xero Payroll</th>
                  <th>Thomax</th>
                  <th>3PLWMS</th>
                  <th>Logiwa</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <ClickableRow key={s.id} panel={`staff:${s.id}`}>
                    <td className="sup">
                      {s.name}
                      {s.position && <div className="meta">{s.position}</div>}
                    </td>
                    <td>{fv("staff", "site", s.site)}</td>
                    <td>{fv("staff", "pool", s.pool)}</td>
                    <td>{fv("staff", "type", s.type)}</td>
                    <td>{s.xeroEmployeeId ? <Pill tone="blue">linked</Pill> : <Pill tone="amber">not linked</Pill>}</td>
                    <td className="mono small">{s.thomaxCode ?? "—"}</td>
                    <td className="mono small">{s.p3lCode ?? "—"}</td>
                    <td className="mono small">{s.logiwaCode ?? "—"}</td>
                  </ClickableRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Allocation to clients" sub="Share of each person's time per client (%). Floor staff come from the WMS automatically once connected (blue cells); type a number to set or override. Total per person can't go over 100%.">
        <div className="row" style={{ marginBottom: 10 }}>
          {[
            ["all", "Both sites"],
            ["smi", "Smithfield"],
            ["par", "Parramatta"],
          ].map(([k, l]) => (
            <Link key={k} href={`/settings?section=staff&site=${k}`} className={"btn" + (site === k ? " on" : "")} scroll={false}>
              {l}
            </Link>
          ))}
          <span className="meta">The site filter narrows both the people and the clients.</span>
        </div>
        {!st.length || !cl.length ? (
          <p className="empty">Add staff and clients first.</p>
        ) : (
          <AllocationMatrix
            canEdit={canEdit}
            staff={st.map((s) => ({ id: s.id, name: s.name, pool: s.pool }))}
            clients={cl.map((c) => ({ id: c.id, name: c.shortName || c.name }))}
            cells={allocs.map((a) => ({ staffId: a.staffId, clientId: a.clientId, pct: Number(a.pct), source: a.source }))}
          />
        )}
      </Card>
    </>
  );
}

export async function ServicesSection({ canEdit }: { canEdit: boolean }) {
  const services = await prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
  const counts = await logCounts("service", services.map((s) => s.code));
  return (
    <Card title={`Services & standard minutes · ${services.length}`} sub="The standard charge codes and the minutes each takes. Minutes × cost per minute = labour cost per unit (TDABC). Marked Estimate until a time study or WMS times replace them.">
      <div className="row" style={{ marginBottom: 10 }}>
        {canEdit && (
          <AddForm
            entity="service"
            label="Add service"
            fields={[
              { name: "code", label: "Code", placeholder: "PCK-UNIT", width: 120 },
              { name: "name", label: "Name", width: 220 },
              { name: "unit", label: "Per", placeholder: "unit", width: 100 },
            ]}
          />
        )}
        {canEdit && <CsvImport entity="service" columns={cols("service")} example={"code,name,unit,minutes,basis,labour,billable\nPCK-UNIT,Pick per unit,unit,0.25,ESTIMATE,floor,yes"} />}
        <span className="meta">Import FA_Charge_Code_Catalogue_v1 (44 codes) here as CSV.</span>
      </div>
      {!services.length ? (
        <EmptyState title="No services yet">Import the FA charge code catalogue (CSV) or add services one by one. Nothing is made up here.</EmptyState>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Service</th>
                <th>Per</th>
                <th>Labour</th>
                <th>Minutes</th>
                <th>Basis</th>
                <th>Overheads per unit</th>
                <th>Billed</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <ClickableRow key={s.code} panel={`service:${s.code}`} className={s.active ? "" : "muted"}>
                  <td className="mono small">{s.code}</td>
                  <td className="sup">{s.name}</td>
                  <td>{s.unit}</td>
                  <td>{fv("service", "poolKind", s.poolKind)}</td>
                  <td>
                    <EditableValue entity="service" id={s.code} field="minutes" spec={ENTITY_FIELDS.service.minutes} value={plain(s.minutes)} logCount={counts[`${s.code}|minutes`] ?? 0} canEdit={canEdit} compact />
                  </td>
                  <td>
                    <Pill tone={s.minutesBasis === "ESTIMATE" ? "amber" : "blue"}>{fv("service", "minutesBasis", s.minutesBasis)}</Pill>
                  </td>
                  <td className="small">{fv("service", "overheads", s.overheads)}</td>
                  <td>{s.billable ? "Yes" : <span className="meta">No</span>}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export async function PoolsSection({ canEdit }: { canEdit: boolean }) {
  const [pools, xmap, wmap, services] = await Promise.all([
    prisma.costPool.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { accounts: true } } } }),
    prisma.xeroAccountMap.findMany({ orderBy: { accountCode: "asc" } }),
    prisma.wmsCodeMap.findMany({ orderBy: [{ source: "asc" }, { wmsCode: "asc" }] }),
    prisma.service.findMany({ select: { code: true, name: true } }),
  ]);
  const poolOpts = [["", "—"], ...pools.map((p) => [p.key, p.name] as const)] as const;
  return (
    <>
      <Card title="Cost pools" sub="Where costs are collected and how each pool is spread: labour pools by activity minutes (per site), overheads by their driver.">
        {canEdit && (
          <div style={{ marginBottom: 10 }}>
            <AddForm
              entity="pool"
              label="Add cost pool"
              fields={[
                { name: "key", label: "Key", placeholder: "storage_cold", width: 130 },
                { name: "name", label: "Name", width: 200 },
                { name: "kind", label: "Kind", type: "select", options: [["OVERHEAD", "Overhead"], ["LABOUR", "Labour"]] },
                { name: "driver", label: "Spread by", type: "select", options: POOL_DRIVERS },
                { name: "site", label: "Site", type: "select", options: [["", "Shared"], ...SITE_OPTIONS] },
              ]}
            />
          </div>
        )}
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Pool</th>
                <th>Kind</th>
                <th>Site</th>
                <th>Spread by</th>
                <th className="r">Xero accounts</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((p) => (
                <ClickableRow key={p.key} panel={`pool:${p.key}`} className={p.active ? "" : "muted"}>
                  <td className="sup">
                    {p.name}
                    <div className="meta mono">{p.key}</div>
                  </td>
                  <td>{p.kind === "LABOUR" ? "Labour" : "Overhead"}</td>
                  <td>{fv("pool", "site", p.site)}</td>
                  <td>{fv("pool", "driver", p.driver)}</td>
                  <td className="r num">{p._count.accounts || <span className="meta">0</span>}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={`Xero account → cost pool · ${xmap.length}`} sub="Every Xero expense account maps to one pool, or is left out (not an operating cost, or passed through to clients). Accounts appear here after the Xero sync; unmapped ones become a task.">
        <div className="row" style={{ marginBottom: 10 }}>
          {canEdit && (
            <AddForm
              entity="xeromap"
              label="Map an account"
              fields={[
                { name: "accountCode", label: "Account code", width: 100 },
                { name: "accountName", label: "Name", width: 200 },
                { name: "poolKey", label: "Pool", type: "select", options: poolOpts },
                { name: "treatment", label: "Treatment", type: "select", options: ENTITY_FIELDS.xeromap.treatment.options },
              ]}
            />
          )}
          {canEdit && <CsvImport entity="xeromap" columns={cols("xeromap")} />}
        </div>
        {!xmap.length ? (
          <p className="empty">No accounts mapped yet.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Pool</th>
                  <th>Treatment</th>
                </tr>
              </thead>
              <tbody>
                {xmap.map((m) => (
                  <ClickableRow key={m.accountCode} panel={`xeromap:${m.accountCode}`}>
                    <td className="mono small">{m.accountCode}</td>
                    <td className="sup">{m.accountName ?? "—"}</td>
                    <td>{pools.find((p) => p.key === m.poolKey)?.name ?? (m.poolKey || <Pill tone="amber">no pool</Pill>)}</td>
                    <td>{fv("xeromap", "treatment", m.treatment)}</td>
                  </ClickableRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title={`WMS charge codes → standard codes · ${wmap.length}`} sub="Old and per-carrier / per-artist WMS codes collapse to the standard service codes (a code describes a service, not a carrier, SKU or artist). Tenant empty = applies to every client.">
        <div className="row" style={{ marginBottom: 10 }}>
          {canEdit && (
            <AddForm
              entity="wmsmap"
              label="Map a WMS code"
              fields={[
                { name: "source", label: "WMS", type: "select", options: [["THOMAX", "Thomax"], ["P3L", "3PLWMS"], ["LOGIWA", "Logiwa"]] },
                { name: "tenant", label: "Tenant (optional)", width: 110 },
                { name: "wmsCode", label: "WMS code", width: 200 },
                { name: "serviceCode", label: "Standard code", type: "select", options: services.map((s) => [s.code, `${s.code} · ${s.name}`] as const) },
              ]}
            />
          )}
          {canEdit && <CsvImport entity="wmsmap" columns={cols("wmsmap")} />}
        </div>
        {!wmap.length ? (
          <p className="empty">No WMS codes mapped yet.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>WMS</th>
                  <th>Tenant</th>
                  <th>WMS code</th>
                  <th>Standard code</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {wmap.map((m) => (
                  <tr key={m.id}>
                    <td>{m.source === "P3L" ? "3PLWMS" : m.source === "THOMAX" ? "Thomax" : "Logiwa"}</td>
                    <td className="mono small">{m.tenant || <span className="meta">all</span>}</td>
                    <td className="mono small">{m.wmsCode}</td>
                    <td>
                      <EditableValue entity="wmsmap" id={m.id} field="serviceCode" spec={ENTITY_FIELDS.wmsmap.serviceCode} value={m.serviceCode} canEdit={canEdit} compact />
                    </td>
                    <td>{canEdit && <DeleteButton entity="wmsmap" id={m.id} label="Remove" />}</td>
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

/** Details panel for any Settings record: every field editable with Logs, plus the record's full history. */
export async function ModelPanel({ panel, canEdit }: { panel: PanelRef; canEdit: boolean }) {
  const { kind, id } = panel;
  let title = "";
  let kicker = "";
  let row: Record<string, unknown> | null = null;
  let extra: React.ReactNode = null;
  let fields: string[] | undefined;
  if (kind === "site") {
    const r = await prisma.site.findUnique({ where: { key: id } });
    row = r as never;
    title = r?.name ?? id;
    kicker = "Site";
  } else if (kind === "client") {
    const r = await prisma.client.findUnique({ where: { id }, include: { allocations: { include: { staff: true } } } });
    row = r as never;
    title = r?.name ?? "";
    kicker = "Client";
    const [svcs, rts] = await Promise.all([prisma.service.findMany({ where: { billable: true, active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }), prisma.clientRate.findMany({ where: { clientId: id } })]);
    const rc = await logCounts("rate", svcs.map((s) => `${id}|${s.code}`));
    if (r)
      extra = (
        <>
        <div className="tsec">
          <div className="tsec-h">Rates · until CLM is connected (then read from CLM)</div>
          {!svcs.length ? (
            <p className="meta">Add services first (Settings → Services & minutes).</p>
          ) : (
            <table>
              <tbody>
                {svcs.map((s) => {
                  const rt = rts.find((x) => x.serviceCode === s.code);
                  return (
                    <tr key={s.code}>
                      <td>
                        {s.name}
                        <div className="meta mono">
                          {s.code} · per {s.unit}
                        </div>
                      </td>
                      <td className="r">
                        <EditableValue entity="rate" id={`${id}|${s.code}`} field="rate" spec={ENTITY_FIELDS.rate.rate} value={rt ? Number(rt.rate) : null} logCount={rc[`${id}|${s.code}|rate`] ?? 0} canEdit={canEdit} compact />
                      </td>
                      <td className="meta small">{rt?.source === "CLM" ? "from CLM" : rt ? "entered here" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="tsec">
          <div className="tsec-h">Staff working on this client</div>
          {r.allocations.length ? (
            <table>
              <tbody>
                {r.allocations.map((a) => (
                  <tr key={a.staffId}>
                    <td>{a.staff.name}</td>
                    <td className="r num">{Number(a.pct)}%</td>
                    <td className="meta">{a.source === "WMS" ? "from WMS" : "manual"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="meta">None yet.</p>
          )}
          <Link href="/settings?section=staff" className="lnk">
            Edit in the allocation matrix
          </Link>
        </div>
        </>
      );
  } else if (kind === "supplier") {
    const r = await prisma.supplier.findUnique({ where: { id } });
    row = r as never;
    title = r?.name ?? "";
    kicker = "Supplier";
    if (r && canEdit) extra = <DeleteButton entity="supplier" id={r.id} label="Remove supplier" />;
  } else if (kind === "staff") {
    const r = await prisma.staff.findUnique({ where: { id }, include: { allocations: { include: { client: true } } } });
    row = r as never;
    title = r?.name ?? "";
    kicker = "Staff member";
    if (r)
      extra = (
        <div className="tsec">
          <div className="tsec-h">
            Clients · {r.allocations.reduce((a, x) => a + Number(x.pct), 0)}% allocated · <LogsButton entity="allocation" id={`${r.id}|*`} count={0} />
          </div>
          {r.allocations.length ? (
            <table>
              <tbody>
                {r.allocations.map((a) => (
                  <tr key={a.clientId}>
                    <td>{a.client.name}</td>
                    <td className="r num">{Number(a.pct)}%</td>
                    <td className="meta">{a.source === "WMS" ? "from WMS" : "manual"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="meta">No clients yet.</p>
          )}
        </div>
      );
  } else if (kind === "service") {
    const r = await prisma.service.findUnique({ where: { code: id } });
    row = r as never;
    title = r ? `${r.name}` : id;
    kicker = `Service · ${id}`;
    if (r) {
      const maps = await prisma.wmsCodeMap.findMany({ where: { serviceCode: id } });
      extra = (
        <>
          <div className="tsec">
            <div className="tsec-h">WMS codes that map here · {maps.length}</div>
            {maps.length ? <p className="small mono">{maps.map((m) => `${m.source === "P3L" ? "3PLWMS" : m.source}: ${m.wmsCode}${m.tenant ? ` (${m.tenant})` : ""}`).join(" · ")}</p> : <p className="meta">None yet.</p>}
          </div>
          {canEdit && !maps.length && <DeleteButton entity="service" id={id} label="Remove service" />}
        </>
      );
    }
  } else if (kind === "pool") {
    const r = await prisma.costPool.findUnique({ where: { key: id }, include: { accounts: true } });
    row = r as never;
    title = r?.name ?? id;
    kicker = `Cost pool · ${id} · ${r?.kind === "LABOUR" ? "labour" : "overhead"}`;
    if (r)
      extra = (
        <div className="tsec">
          <div className="tsec-h">Xero accounts in this pool · {r.accounts.length}</div>
          {r.accounts.length ? <p className="small">{r.accounts.map((a) => `${a.accountCode} ${a.accountName ?? ""}`).join(" · ")}</p> : <p className="meta">None mapped yet (Cost pools & mapping → Xero account → cost pool).</p>}
          {r.description && <p className="small">{r.description}</p>}
        </div>
      );
  } else if (kind === "xeromap") {
    const r = await prisma.xeroAccountMap.findUnique({ where: { accountCode: id } });
    row = r as never;
    title = `${id} ${r?.accountName ?? ""}`;
    kicker = "Xero account";
    if (r && canEdit) extra = <DeleteButton entity="xeromap" id={id} label="Remove mapping" />;
  } else return null;

  if (!row) {
    return (
      <Drawer>
        <DrawerHeader title="Not found" />
        <p className="meta">It may have been removed.</p>
      </Drawer>
    );
  }
  const counts = await logCounts(kind, [id]);
  return (
    <Drawer label={kicker}>
      <DrawerHeader kicker={kicker} title={title} />
      <FieldList entity={kind} id={id} row={row} fields={fields} counts={counts} canEdit={canEdit} />
      {extra}
      <div className="tsec">
        <div className="tsec-h">History</div>
        <LogsButton entity={kind} id={id} count={Object.values(counts).reduce((a, b) => a + b, 0)} />
      </div>
    </Drawer>
  );
}
