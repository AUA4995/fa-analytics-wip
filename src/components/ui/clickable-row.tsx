"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { withPanel } from "./panel";

/** Clicks on links, buttons and form fields inside a row keep doing their own thing. */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.("a, button, input, select, textarea, label, form, summary, [data-no-row]");
}

/** Table row that opens the details panel `?panel=<panel>` when clicked (or Enter). */
export function ClickableRow({ panel, className = "", children, title }: { panel: string; className?: string; children: ReactNode; title?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const open = () => router.push(withPanel(pathname, sp, panel), { scroll: false });
  return (
    <tr
      className={("clickable " + className).trim()}
      data-panel={panel}
      tabIndex={0}
      title={title}
      onClick={(e) => {
        if (!isInteractiveTarget(e.target)) open();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !isInteractiveTarget(e.target)) open();
      }}
    >
      {children}
    </tr>
  );
}
