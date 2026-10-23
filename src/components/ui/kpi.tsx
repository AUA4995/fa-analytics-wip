import type { ReactNode } from "react";

export type KpiTone = "normal" | "red" | "amber" | "green";

/** Row of summary cards. The first card is the dark lead card unless `lead={false}`. */
export function KpiRow({ children, lead = true }: { children: ReactNode; lead?: boolean }) {
  return <div className={"kpis" + (lead ? " lead-first" : "")}>{children}</div>;
}

export function Kpi({ label, value, sub, tone = "normal" }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: KpiTone }) {
  return (
    <div className={"kpi" + (tone !== "normal" ? " " + tone : "")}>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}
