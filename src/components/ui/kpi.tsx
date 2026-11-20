import Link from "next/link";
import type { ReactNode } from "react";

export type KpiTone = "normal" | "red" | "amber" | "green";

/** Row of summary cards. The first card is the dark lead card unless `lead={false}`. */
export function KpiRow({ children, lead = true }: { children: ReactNode; lead?: boolean }) {
  return <div className={"kpis" + (lead ? " lead-first" : "")}>{children}</div>;
}

/**
 * A summary card. With `href` it is a clickable card (same as Base cost and the Accounts Hub): clicking filters the
 * content below to what the card counts; `on` marks the card that is filtering now (click again to show everything).
 */
export function Kpi({ label, value, sub, tone = "normal", href, on = false }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: KpiTone; href?: string; on?: boolean }) {
  const cls = "kpi" + (tone !== "normal" ? " " + tone : "") + (href ? " clickable" : "") + (on ? " on" : "");
  const body = (
    <>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {sub && <div className="s">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className={cls} aria-pressed={on} scroll={false}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
