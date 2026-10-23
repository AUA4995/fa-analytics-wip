import type { ReactNode } from "react";

export type PillTone = "red" | "amber" | "green" | "blue" | "grey" | "purple";

/** Status pill. red/amber/green are fixed status colours; blue follows the brand primary. */
export function Pill({ tone = "grey", children, title }: { tone?: PillTone; children: ReactNode; title?: string }) {
  return (
    <span className={`pill p-${tone}`} title={title}>
      {children}
    </span>
  );
}
