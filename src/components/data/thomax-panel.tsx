import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { prisma } from "@/lib/db";
import { ensureTables, getConnectionInfo, historyRemaining } from "@/lib/thomax/sync";
import { THOMAX_TABLES, tableDef } from "@/lib/thomax/tables";
import { ExploreOneButton, ThomaxButtons, ThomaxConnectionForm, ThomaxTableForm } from "./thomax";

const auTime = (d: Date | null | undefined) => (d ? d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");
const au = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : "—");
const n = (x: number) => x.toLocaleString("en-AU");

/** Data sources → WMS: the Thomax Query API copy (decision 11/11/2026: only Analytics connects to Thomax). */
export async function ThomaxPanel({ admin, owner, open }: { admin: boolean; owner: boolean; open?: string }) {
  const conn = await getConnectionInfo();
  if (conn) await ensureTables();
  if (conn && !admin) {
    // Users see that the copy exists; the login, tables and errors are for admins
    const rows = await prisma.thomaxRow.count();
    return (
      <Card title="Thomax (.wms) · Query API copy">
        <p className="small" style={{ margin: 0 }}>
          <Pill tone={conn.enabled ? "green" : "red"}>{conn.enabled ? "connected" : "paused"}</Pill> {n(rows)} rows copied. An admin manages this.
        </p>
      </Card>
    );
  }
  const [tables, lastRuns, remaining] = await Promise.all([
    prisma.thomaxTable.findMany({ orderBy: { name: "asc" } }),
    prisma.sourceRun.findMany({ where: { source: "THOMAX" }, orderBy: { startedAt: "desc" }, take: 5 }),
    conn ? historyRemaining() : Promise.resolve(0),
  ]);
  const order = new Map(THOMAX_TABLES.map((t, i) => [t.name, i]));
  tables.sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));
  const totalRows = tables.reduce((s, t) => s + t.rowCount, 0);
  const saved = tables.filter((t) => t.confirmedAt && t.enabled).length;
  const sel = open ? tables.find((t) => t.name === open) : undefined;
  const fields = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

  return (
    <>
      <Card
        title="Thomax (.wms) · Query API copy"
        sub="A full copy of every Thomax table, as Thomax returns it: history from 2021, then each night. Read-only towards Thomax. After Thomax ends (31/05/2027) this copy is the archive."
      >
        {!conn ? (
          owner ? (
            <>
              <p className="small" style={{ marginTop: 0 }}>
                <Pill tone="amber">not connected</Pill> Use a .wms user login (the same kind Power BI uses). A separate read-only user just for Analytics is best — ask Thomax support (support@thomax.com).
              </p>
              <ThomaxConnectionForm cluster="e" username="" historyFrom="2021-01-01" recheckDays={14} connected={false} />
            </>
          ) : (
            <p className="small" style={{ margin: 0 }}>
              <Pill tone="amber">not connected</Pill> The owner connects Thomax here.
            </p>
          )
        ) : (
          <>
            <p className="small" style={{ marginTop: 0 }}>
              {!conn.enabled ? <Pill tone="red">login refused — copying paused</Pill> : conn.lastTestOk === false ? <Pill tone="red">last test failed</Pill> : <Pill tone="green">connected</Pill>}{" "}
              {admin ? `${conn.username} @ ${conn.cluster}.dotwms.com · ` : ""}history from {au(conn.historyFrom)} · re-check {conn.recheckDays} days · <b>{n(totalRows)}</b> rows copied ·{" "}
              {!saved ? "no table saved yet — Explore, then check and save each table" : remaining ? `${n(remaining)} month windows of history still to load (runs 20:00–06:00)` : "history up to date"}
            </p>
            {remaining > 0 && (
              <p className="meta" style={{ marginTop: 0 }}>
                The history load and the nightly copy only run while the app is open and the computer is awake. On a laptop that is off at night, use <b>Load history now</b> — it then keeps loading during the day until it&apos;s done.
              </p>
            )}
            {admin && conn.lastTestAt && (
              <p className={conn.lastTestOk ? "meta" : "msg-err"} style={{ marginTop: 0 }}>
                Last test {auTime(conn.lastTestAt)}: {conn.lastTestOk ? "Thomax answered ✓" : (conn.lastError ?? "failed")}
              </p>
            )}
            {admin && <ThomaxButtons owner={owner} />}
            {owner && (
              <details style={{ marginTop: 10 }}>
                <summary className="lnk">Change login or settings</summary>
                <ThomaxConnectionForm cluster={conn.cluster} username={conn.username} historyFrom={conn.historyFrom.toISOString().slice(0, 10)} recheckDays={conn.recheckDays} connected />
              </details>
            )}
            {lastRuns.length > 0 && (
              <p className="meta" style={{ marginBottom: 0 }}>
                Last runs:{" "}
                {lastRuns.map((r) => `${r.label} ${auTime(r.startedAt)} ${r.status === "SUCCESS" ? "✓" : r.status === "RUNNING" ? "…" : "✗"}`).join(" · ")}
              </p>
            )}
          </>
        )}
      </Card>

      {conn && (
        <Card title="Tables" sub="Explore reads 5 rows per table to find its fields. Check the suggested settings and save each table — nothing is copied before that.">
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Table</th>
                  <th>What it is</th>
                  <th>Status</th>
                  <th className="r">Rows</th>
                  <th>History loaded to</th>
                  <th>Last sync</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((t) => {
                  const def = tableDef(t.name);
                  const status = !t.enabled ? (
                    <Pill tone="grey">off</Pill>
                  ) : t.lastError ? (
                    <Pill tone="red" title={t.lastError}>
                      problem
                    </Pill>
                  ) : !t.exploredAt ? (
                    <Pill tone="grey">not explored</Pill>
                  ) : !t.confirmedAt ? (
                    <Pill tone="amber">check & save</Pill>
                  ) : (
                    <Pill tone="green">copying</Pill>
                  );
                  return (
                    <tr key={t.name} aria-current={open === t.name ? "true" : undefined}>
                      <td>
                        <Link href={`/data?section=wms&t=${t.name}#thomax-table`} className="lnk">
                          {t.name}
                        </Link>
                      </td>
                      <td>{def?.label ?? "—"}</td>
                      <td>{status}</td>
                      <td className="r">{n(t.rowCount)}</td>
                      <td>{t.kind === "MASTER" ? "full each night" : au(t.historyDoneTo)}</td>
                      <td>{auTime(t.lastSyncAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {conn && sel && (
        <div id="thomax-table">
          <Card title={`${sel.name} · ${tableDef(sel.name)?.label ?? ""}`} sub={sel.exploredAt ? `Explored ${auTime(sel.exploredAt)} · ${fields(sel.fields).length ? `${fields(sel.fields).length} fields` : "no rows in the table yet"}${sel.confirmedAt ? ` · saved by ${sel.confirmedBy ?? "—"} ${auTime(sel.confirmedAt)}` : ""}` : "Not explored yet"}>
            {sel.lastError && <p className="msg-err" style={{ marginTop: 0 }}>{sel.lastError}</p>}
            {sel.droppedFields.length > 0 && (
              <p className="meta" style={{ marginTop: 0 }}>
                Not copied (they hold passwords, PINs or tokens): {sel.droppedFields.join(", ")}.
              </p>
            )}
            {admin && <ExploreOneButton table={sel.name} />}
            <div style={{ marginTop: 12 }}>
              <ThomaxTableForm
                key={sel.name}
                table={sel.name}
                fields={fields(sel.fields)}
                enabled={sel.enabled}
                kind={sel.kind}
                dateField={sel.dateField}
                keyFields={sel.keyFields}
                lookupFields={sel.lookupFields}
                confirmed={!!sel.confirmedAt}
                rowCount={sel.rowCount}
                owner={owner}
              />
            </div>
            {owner && Array.isArray(sel.sample) && sel.sample.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary className="lnk">Sample rows from Explore ({sel.sample.length})</summary>
                <div className="tw">
                  <table>
                    <thead>
                      <tr>
                        {fields(sel.fields).map((f) => (
                          <th key={f}>{f}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(sel.sample as Array<Record<string, unknown>>).map((r, i) => (
                        <tr key={i}>
                          {fields(sel.fields).map((f) => (
                            <td key={f}>{r[f] === null || r[f] === undefined ? "" : typeof r[f] === "object" ? JSON.stringify(r[f]) : String(r[f])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
