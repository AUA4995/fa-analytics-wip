/**
 * Small server-rendered SVG charts (no chart library): sparkline, bars + line combo, waterfall, gauge, line vs target.
 * Colours come from the theme variables so they follow the brand and dark mode.
 */

const fmtK = (v: number) => {
  const a = Math.abs(v);
  return (v < 0 ? "-" : "") + (a >= 1e6 ? `$${(a / 1e6).toFixed(1)}m` : a >= 1e3 ? `$${Math.round(a / 1e3)}k` : `$${Math.round(a)}`);
};

/** About 12 evenly spaced axis labels. */
function showTick(i: number, n: number): boolean {
  const step = Math.ceil(n / 12);
  return i % step === 0;
}

export function Sparkline({ values, w = 120, h = 28, tone = "var(--blue)" }: { values: Array<number | null>; w?: number; h?: number; tone?: string }) {
  const v = values.map((x) => (x == null || !Number.isFinite(x) ? null : x));
  const nums = v.filter((x): x is number => x != null);
  if (nums.length < 2) return <span className="meta small">not enough data</span>;
  const mn = Math.min(...nums);
  const mx = Math.max(...nums);
  const y = (x: number) => h - 3 - ((x - mn) / (mx - mn || 1)) * (h - 6);
  const step = w / Math.max(1, v.length - 1);
  let d = "";
  v.forEach((x, i) => {
    if (x == null) return;
    d += `${d && v[i - 1] != null ? "L" : "M"}${(i * step).toFixed(1)},${y(x).toFixed(1)}`;
  });
  const lastI = v.map((x, i) => (x == null ? -1 : i)).filter((i) => i >= 0).pop()!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="12-month trend" className="spark">
      <path d={d} fill="none" stroke={tone} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastI * step} cy={y(v[lastI]!)} r={2.4} fill={tone} />
    </svg>
  );
}

export interface ComboPoint {
  label: string;
  bar: number | null;
  line: number | null;
  forecast?: boolean;
}
/** Bars (money, left axis) + line (%, right axis). Forecast bars are lighter and labelled in the legend. */
export function ComboChart({ data, barLabel, lineLabel, h = 230 }: { data: ComboPoint[]; barLabel: string; lineLabel: string; h?: number }) {
  const W = 760;
  const pad = { l: 52, r: 44, t: 12, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const bars = data.map((d) => d.bar ?? 0);
  const bmax = Math.max(1, ...bars);
  const lines = data.map((d) => d.line).filter((x): x is number => x != null);
  const lmin = Math.min(0, ...lines);
  const lmax = Math.max(0.01, ...lines);
  const bw = iw / data.length;
  const yb = (v: number) => pad.t + ih - (v / bmax) * ih;
  const yl = (v: number) => pad.t + ih - ((v - lmin) / (lmax - lmin)) * ih;
  let path = "";
  data.forEach((d, i) => {
    if (d.line == null || d.forecast) return;
    path += `${path ? "L" : "M"}${(pad.l + bw * i + bw / 2).toFixed(1)},${yl(d.line).toFixed(1)}`;
  });
  const ticks = [0, 0.5, 1].map((f) => bmax * f);
  const hasF = data.some((d) => d.forecast);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label={`${barLabel} and ${lineLabel} by month`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={yb(t)} y2={yb(t)} stroke="var(--border)" />
            <text x={pad.l - 6} y={yb(t) + 3} textAnchor="end" className="ax">
              {fmtK(t)}
            </text>
          </g>
        ))}
        {[lmin, lmax].map((t, i) => (
          <text key={i} x={W - pad.r + 6} y={yl(t) + 3} className="ax">
            {(t * 100).toFixed(0)}%
          </text>
        ))}
        {data.map((d, i) => (
          <g key={d.label}>
            {d.bar != null && <rect x={pad.l + bw * i + bw * 0.18} width={bw * 0.64} y={yb(d.bar)} height={Math.max(0, pad.t + ih - yb(d.bar))} rx={2} fill={d.forecast ? "var(--blue-light)" : "var(--blue)"} opacity={d.forecast ? 0.7 : 1}>
              <title>{`${d.label}: ${fmtK(d.bar)}${d.forecast ? " (forecast)" : ""}${d.line != null ? ` · ${(d.line * 100).toFixed(1)}%` : ""}`}</title>
            </rect>}
            {showTick(i, data.length) && (
              <text x={pad.l + bw * i + bw / 2} y={h - 10} textAnchor="middle" className="ax">
                {d.label}
              </text>
            )}
          </g>
        ))}
        {path && <path d={path} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />}
        {data.map((d, i) => (d.line != null && !d.forecast ? <circle key={i} cx={pad.l + bw * i + bw / 2} cy={yl(d.line)} r={2.6} fill="var(--card)" stroke="var(--ink)" strokeWidth={1.6} /> : null))}
      </svg>
      <figcaption className="legend">
        <span>
          <i className="sw" style={{ background: "var(--blue)" }} />
          {barLabel}
        </span>
        <span>
          <i className="sw line" />
          {lineLabel}
        </span>
        {hasF && (
          <span>
            <i className="sw" style={{ background: "var(--blue-light)" }} />
            Forecast (seasonal, ±8%)
          </span>
        )}
      </figcaption>
    </figure>
  );
}

export function Waterfall({ steps, h = 220, zero = true }: { steps: Array<{ label: string; value: number; kind: "start" | "end" | "step" | "sub" }>; h?: number; zero?: boolean }) {
  const W = 760;
  const pad = { l: 56, r: 10, t: 16, b: 40 };
  const iw = W - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  let run = 0;
  const bars = steps.map((s) => {
    if (s.kind !== "step") {
      run = s.value;
      return { ...s, from: 0, to: s.value };
    }
    const from = run;
    run += s.value;
    return { ...s, from, to: run };
  });
  const minV = Math.min(...bars.map((b) => (b.kind === "step" ? Math.min(b.from, b.to) : b.to)));
  const lo = zero || minV <= 0 ? Math.min(0, minV) : minV * 0.9;
  for (const b of bars) if (b.kind !== "step") b.from = lo;
  const hi = Math.max(1, ...bars.map((b) => Math.max(b.from, b.to)));
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const bw = iw / bars.length;
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label="Waterfall">
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        {bars.map((b, i) => {
          const top = y(Math.max(b.from, b.to));
          const hgt = Math.max(1, Math.abs(y(b.from) - y(b.to)));
          const fill = b.kind === "step" ? (b.value >= 0 ? "var(--green)" : "var(--red)") : "var(--ink)";
          return (
            <g key={i}>
              <rect x={pad.l + bw * i + bw * 0.15} width={bw * 0.7} y={top} height={hgt} rx={2} fill={fill} opacity={b.kind === "step" ? 0.85 : 1}>
                <title>{`${b.label}: ${fmtK(b.value)}`}</title>
              </rect>
              <text x={pad.l + bw * i + bw / 2} y={top - 4} textAnchor="middle" className="ax val">
                {b.kind === "step" && b.value > 0 ? "+" : ""}
                {fmtK(b.value)}
              </text>
              <text x={pad.l + bw * i + bw / 2} y={h - 22} textAnchor="middle" className="ax">
                {b.label.length > 16 ? b.label.slice(0, 15) + "…" : b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Semicircle gauge with the bank's threshold marked. */
export function Gauge({ label, value, display, min, max, mark, markLabel, tone, note }: { label: string; value: number | null; display: string; min: number; max: number; mark: number; markLabel: string; tone: "green" | "amber" | "red" | "grey"; note: string }) {
  const W = 200;
  const cx = 100;
  const cy = 92;
  const r = 72;
  const ang = (v: number) => Math.PI * (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min));
  const pt = (a: number, rr = r) => [cx + rr * Math.cos(a), cy - rr * Math.sin(a)];
  const arc = (a0: number, a1: number) => {
    const [x0, y0] = pt(a0);
    const [x1, y1] = pt(a1);
    return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`;
  };
  const col = { green: "var(--green)", amber: "var(--amber-line)", red: "var(--red)", grey: "var(--chart-grey)" }[tone];
  const [mx0, my0] = pt(ang(mark), r - 12);
  const [mx1, my1] = pt(ang(mark), r + 12);
  return (
    <div className="gauge">
      <svg viewBox={`0 -14 ${W} 126`} width="100%" role="img" aria-label={`${label}: ${display}`}>
        <path d={arc(Math.PI, 0)} fill="none" stroke="var(--surface)" strokeWidth={14} strokeLinecap="round" />
        {value != null && <path d={arc(Math.PI, ang(value))} fill="none" stroke={col} strokeWidth={14} strokeLinecap="round" />}
        <line x1={mx0} y1={my0} x2={mx1} y2={my1} stroke="var(--ink)" strokeWidth={2} />
        <text x={cx} y={cy - 8} textAnchor="middle" className="gv">
          {display}
        </text>
        <text x={mx1} y={my1 - 4} textAnchor="middle" className="ax">
          {markLabel}
        </text>
      </svg>
      <div className="gl">{label}</div>
      <div className="meta small">{note}</div>
    </div>
  );
}

/** Line over months with a dashed target line. */
export function TargetLine({ values, labels, target, fmt, h = 180 }: { values: Array<number | null>; labels: string[]; target?: number | null; fmt: (v: number) => string; h?: number }) {
  const W = 760;
  const pad = { l: 56, r: 28, t: 12, b: 26 };
  const nums = values.filter((x): x is number => x != null);
  if (nums.length < 2) return <p className="empty">Not enough months yet.</p>;
  const lo = Math.min(...nums, target ?? Infinity) * 0.95;
  const hi = Math.max(...nums, target ?? -Infinity) * 1.05 || 1;
  const iw = W - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const x = (i: number) => pad.l + (iw * i) / Math.max(1, values.length - 1);
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${d && values[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label="Trend against target">
        {[lo, (lo + hi) / 2, hi].map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="ax">
              {fmt(t)}
            </text>
          </g>
        ))}
        {target != null && <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="var(--amber)" strokeDasharray="5 4" strokeWidth={1.5} />}
        <path d={d} fill="none" stroke="var(--blue)" strokeWidth={2} />
        {values.map((v, i) =>
          v == null ? null : (
            <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill="var(--blue)">
              <title>{`${labels[i]}: ${fmt(v)}`}</title>
            </circle>
          ),
        )}
        {labels.map((l, i) => (showTick(i, labels.length) ? (
          <text key={i} x={x(i)} y={h - 8} textAnchor="middle" className="ax">
            {l}
          </text>
        ) : null))}
      </svg>
      {target != null && (
        <figcaption className="legend">
          <span>
            <i className="sw" style={{ background: "var(--blue)" }} />
            Actual
          </span>
          <span>
            <i className="sw dash" />
            Target {fmt(target)}
          </span>
        </figcaption>
      )}
    </figure>
  );
}
