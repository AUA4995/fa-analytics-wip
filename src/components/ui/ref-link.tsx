import type { ReactNode } from "react";
import { linkifyRefs, type RefContext } from "./refs";

/** The one reference-link style: blue, dotted underline, no arrow. Opens Front/Xero in a new tab; app pages ("/…") in place. */
export function RefLink({ href, title, children }: { href: string; title?: string; children: ReactNode }) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <a className="ref" href={href} title={title}>
        {children}
      </a>
    );
  }
  return (
    <a className="ref" href={href} title={title} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/** Plain text with every ticket / invoice / credit note / known bill number turned into a RefLink. */
export function Linkify({ text, ctx }: { text: string | null | undefined; ctx?: RefContext }) {
  return (
    <>
      {linkifyRefs(text, ctx).map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <RefLink key={i} href={p.url} title={p.title}>
            {p.text}
          </RefLink>
        ),
      )}
    </>
  );
}
