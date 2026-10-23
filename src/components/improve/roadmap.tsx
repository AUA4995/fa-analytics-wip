import Link from "next/link";

export interface RoadItem {
  id: string;
  name: string;
  kind: "idea" | "initiative" | "step";
  start: Date | null;
  end: Date | null;
  /** 0–1 for initiatives */
  progress?: number;
  late?: boolean;
  href: string;
  sub?: string;
}

const DAY = 86400000;
export const ZOOMS: Array<[string, string, number, number]> = [
  ["week", "Week", -7, 28],
  ["month", "Month", -30, 120],
  ["quarter", "Quarter", -45, 270],
  ["year", "Year", -60, 365],
];

/** Calendar roadmap: ideas = diamond at the review date; initiatives = bars with progress; today line. */
export function Roadmap({ items, zoom, today }: { items: RoadItem[]; zoom: string; today: Date }) {
  const z = ZOOMS.find((x) => x[0] === zoom) ?? ZOOMS[2];
  const from = new Date(today.getTime() + z[2] * DAY);
  const to = new Date(today.getTime() + z[3] * DAY);
  const W = 900;
  const L = 230;
  const rowH = 30;
  const H = 30 + items.length * rowH;
  const x = (d: Date) => L + ((Math.min(Math.max(d.getTime(), from.getTime()), to.getTime()) - from.getTime()) / (to.getTime() - from.getTime())) * (W - L - 10);
  // Month (or week) grid lines
  const ticks: Date[] = [];
  if (zoom === "week") for (let t = new Date(from); t <= to; t = new Date(t.getTime() + 7 * DAY)) ticks.push(t);
  else for (let t = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)); t <= to; t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + (zoom === "year" ? 1 : 1), 1))) ticks.push(t);
  const lbl = (d: Date) => (zoom === "week" ? d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }) : d.toLocaleDateString("en-AU", { month: "short", year: zoom === "year" ? "2-digit" : undefined, timeZone: "UTC" }));
  if (!items.length) return <p className="empty">Nothing with dates yet — ideas need a review date, initiatives a start and due date.</p>;
  return (
    <div className="tw">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 640 }} className="chart roadmap" role="img" aria-label="Roadmap">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} x2={x(t)} y1={18} y2={H} stroke="var(--border)" />
            <text x={x(t) + 3} y={12} className="ax">
              {lbl(t)}
            </text>
          </g>
        ))}
        {items.map((it, i) => {
          const y = 24 + i * rowH;
          const visible = (it.end ?? it.start) && (it.end ?? it.start)!.getTime() >= from.getTime() && (it.start ?? it.end)!.getTime() <= to.getTime();
          return (
            <g key={it.id}>
              <a href={it.href}>
                <text x={4} y={y + 15} className={"rl" + (it.kind === "idea" ? " idea" : "")}>
                  {it.name.length > 30 ? it.name.slice(0, 29) + "…" : it.name}
                </text>
              </a>
              {it.sub && (
                <text x={4} y={y + 26} className="ax">
                  {it.sub}
                </text>
              )}
              {visible && it.kind === "idea" && it.start && <path d={`M${x(it.start)},${y + 4} l7,7 l-7,7 l-7,-7 z`} fill="var(--amber-line)" stroke="var(--amber)" />}
              {visible && it.kind !== "idea" && it.start && it.end && (
                <a href={it.href}>
                  <rect x={x(it.start)} y={y + 5} width={Math.max(4, x(it.end) - x(it.start))} height={14} rx={4} fill="var(--blue-light)" opacity={0.6}>
                    <title>{`${it.name}: ${it.start.toISOString().slice(0, 10)} → ${it.end.toISOString().slice(0, 10)}${it.progress != null ? ` · ${Math.round(it.progress * 100)}% done` : ""}`}</title>
                  </rect>
                  <rect x={x(it.start)} y={y + 5} width={Math.max(0, (x(it.end) - x(it.start)) * (it.progress ?? 0))} height={14} rx={4} fill={it.late ? "var(--red)" : "var(--blue)"} />
                </a>
              )}
              {!visible && (
                <text x={L + 4} y={y + 15} className="ax">
                  outside this view
                </text>
              )}
            </g>
          );
        })}
        <line x1={x(today)} x2={x(today)} y1={16} y2={H} stroke="var(--red)" strokeWidth={1.5} strokeDasharray="3 3" />
        <text x={x(today) + 3} y={H - 4} className="ax" fill="var(--red)">
          today
        </text>
      </svg>
    </div>
  );
}

/** Next 3 months as calendars: amber = idea review, blue = project step due. Click a day → the item. */
export function MonthCalendars({ marks, today }: { marks: Array<{ date: Date; kind: "review" | "step"; href: string; title: string }>; today: Date }) {
  const months = [0, 1, 2].map((k) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k, 1)));
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const by = new Map<string, typeof marks>();
  for (const m of marks) by.set(key(m.date), [...(by.get(key(m.date)) ?? []), m]);
  return (
    <div className="mcals">
      {months.map((m) => {
        const days = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
        const lead = (m.getUTCDay() + 6) % 7;
        return (
          <div key={key(m)} className="mcal">
            <div className="mh">{m.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })}</div>
            <div className="mg">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={i} className="dh">
                  {d}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={"b" + i} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const d = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), i + 1));
                const ms = by.get(key(d)) ?? [];
                const cls = "d" + (key(d) === key(today) ? " today" : "") + (ms.some((x) => x.kind === "review") ? " rv" : ms.length ? " st" : "");
                return ms.length ? (
                  <Link key={i} href={ms[0].href} className={cls} title={ms.map((x) => x.title).join("\n")} scroll={false}>
                    {i + 1}
                  </Link>
                ) : (
                  <span key={i} className={cls}>
                    {i + 1}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
