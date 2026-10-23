"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { withPanel } from "./panel";

/**
 * Right-side details panel. Open when the page has `?panel=kind:id` and renders <Drawer> with server-built content.
 * Closes on Esc, on the backdrop, or with the Close button (removes `panel` from the URL).
 */
export function Drawer({ children, label = "Details" }: { children: ReactNode; label?: string }) {
  const close = useCloseDrawer();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <>
      <div className="scrim" onClick={close} aria-hidden />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label} ref={ref} tabIndex={-1}>
        {children}
      </aside>
    </>
  );
}

export function useCloseDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return useCallback(() => {
    // "back" only belongs to the panel being closed (e.g. a ticket opened from a client panel)
    const q = new URLSearchParams(sp.toString());
    q.delete("back");
    router.replace(withPanel(pathname, q, null), { scroll: false });
  }, [router, pathname, sp]);
}

/** Drawer title row: small type line, big title (optionally a link), Close button. */
export function DrawerHeader({ kicker, title, href }: { kicker?: ReactNode; title: ReactNode; href?: string }) {
  const close = useCloseDrawer();
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {kicker && <div className="meta">{kicker}</div>}
        <h3>
          {href ? (
            <a href={href} target="_blank" rel="noreferrer" title="Open the contact in Xero">
              {title}
            </a>
          ) : (
            title
          )}
        </h3>
      </div>
      <button type="button" className="btn" onClick={close}>
        Close
      </button>
    </div>
  );
}

/** A titled block inside the drawer. */
export function DrawerSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="tsec">
      <div className="tsec-h">{title}</div>
      {children}
    </div>
  );
}
