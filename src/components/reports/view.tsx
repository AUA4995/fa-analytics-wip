import { Card } from "@/components/ui/card";
import type { Block, BuiltReport, Cell } from "@/lib/reports/build";

const val = (c: Cell) => (typeof c === "string" ? c : c.v);

/** Renders report blocks on screen — the same blocks the PDF is made from. */
export function ReportView({ rep, kpiLinks }: { rep: BuiltReport; kpiLinks?: Array<{ href: string; on: boolean } | null> }) {
  return (
    <>
      {rep.blocks.map((b, i) => (
        <BlockView key={i} b={b} kpiLinks={b.kind === "kpis" && i === rep.blocks.findIndex((x) => x.kind === "kpis") ? kpiLinks : undefined} />
      ))}
    </>
  );
}

function BlockView({ b, kpiLinks }: { b: Block; kpiLinks?: Array<{ href: string; on: boolean } | null> }) {
  if (b.kind === "kpis")
    return (
      <div className="kpis ovtiles">
        {b.items.map((k, i) => {
          const link = kpiLinks?.[i];
          const inner = (
            <>
              <div className="l">{k.label}</div>
              <div className="v">{k.value}</div>
              {k.sub && <div className="s">{k.sub}</div>}
            </>
          );
          return link ? (
            <a key={i} href={link.href} className={"kpi clickable" + (k.tone ? " " + k.tone : "") + (link.on ? " on" : "")} aria-current={link.on ? "true" : undefined}>
              {inner}
            </a>
          ) : (
            <div key={i} className={"kpi" + (k.tone ? " " + k.tone : "")}>
              {inner}
            </div>
          );
        })}
      </div>
    );
  if (b.kind === "note") return <p className={b.tone === "warn" ? "callout amber" : "meta"}>{b.text}</p>;
  if (b.kind === "bars") {
    const mx = Math.max(1, ...b.rows.map((r) => r.value));
    return (
      <Card title={b.title} sub={b.sub}>
        {!b.rows.some((r) => r.value) ? (
          <p className="empty">No orders for this period yet.</p>
        ) : (
          b.rows.map((r, i) => (
            <div key={i} className="catbar">
              <span className="small">{r.label}</span>
              <span className="track">
                <i style={{ width: `${(r.value / mx) * 100}%`, background: r.forecast ? "var(--blue-light)" : undefined }} />
              </span>
              <span className="num small">{r.display}</span>
            </div>
          ))
        )}
      </Card>
    );
  }
  const right = new Set(b.right ?? []);
  const cell = (c: Cell, i: number, bold = false) => (
    <td key={i} className={(right.has(i) ? "r num" : i === 0 ? "sup" : "") + (typeof c !== "string" && c.tone ? (c.tone === "pos" ? " delta-pos" : " delta-neg") : "")}>
      {typeof c !== "string" && c.s ? (
        <span className="nb">
          <strong>{c.v}</strong>
          <small>{c.s}</small>
        </span>
      ) : bold ? (
        <strong>{val(c)}</strong>
      ) : (
        val(c)
      )}
    </td>
  );
  return (
    <Card title={b.title} sub={b.sub}>
      {!b.rows.length ? (
        <p className="empty">Nothing for this period — load WMS orders in Data sources.</p>
      ) : (
        <div className="tw">
          <table className="wk">
            <thead>
              <tr>
                {b.head.map((h, i) => (
                  <th key={i} className={right.has(i) ? "r" : ""}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => cell(c, j))}</tr>
              ))}
              {b.total && <tr className="tot">{b.total.map((c, j) => cell(c, j, true))}</tr>}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
