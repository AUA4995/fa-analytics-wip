import type { ReactNode } from "react";

export type CardTone = "normal" | "hl" | "warn" | "alert";

/** White card, 14px radius. `title` renders the small upper-case heading; `sub` the grey explainer under it. */
export function Card({
  title,
  sub,
  tone = "normal",
  className = "",
  id,
  style,
  children,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  tone?: CardTone;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}) {
  return (
    <section id={id} style={style} className={["card", tone !== "normal" ? tone : "", className].filter(Boolean).join(" ")}>
      {title && <h2>{title}</h2>}
      {sub && <p className="sub">{sub}</p>}
      {children}
    </section>
  );
}

/** Empty state for sections that need data from a later round (never fake data). */
export function EmptyState({ title, children = "Built in the next step." }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <Card title={title}>
      <p className="empty" style={{ margin: 0 }}>
        {children}
      </p>
    </Card>
  );
}

/** Small "AI" chip shown next to AI-derived headings. */
export function AiChip() {
  return <span className="ai">AI</span>;
}
