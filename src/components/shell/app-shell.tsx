"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, use, useState, useTransition, type ReactNode } from "react";
import { setMenuPinned } from "@/lib/actions/shell";
import { BOTTOM_MENU, MAIN_MENU, PAGES, crumbFor, pageForPath, parseSection, type PageKey } from "@/components/ui/sections";
import { BellIcon, MenuIcon, PageIcon, PinIcon, SignOutIcon } from "./icons";
import { initials } from "./initials";
import "./shell.css";

export interface ShellProps {
  initialPinned: boolean;
  user: { name: string; roleLabel: string; isAdmin: boolean };
  companyName: string;
  /** light = logo for light backgrounds, dark = logo for dark backgrounds (shown in dark mode) */
  logos: { light: string; dark: string; mark: string };
  /** Count badges per menu item (hidden when 0/undefined). A promise streams in after the frame renders (Batch 2 item 12). */
  counts: Partial<Record<PageKey, number>> | Promise<Partial<Record<PageKey, number>>>;
  signOut: () => Promise<void>;
  children: ReactNode;
}

/** FA apps layout (same as the Accounts Hub): left menu with pin / icon rail / hover peek, white top bar, page area. */
export function AppShell({ initialPinned, user, companyName, logos, counts, signOut, children }: ShellProps) {
  const [pinned, setPinned] = useState(initialPinned);
  const [, start] = useTransition();
  const pathname = usePathname();
  const current = pageForPath(pathname);
  // The slide-out / hover menu is open for the page it was opened on; navigating closes it.
  const [peekPath, setPeekPath] = useState<string | null>(null);
  const peek = peekPath === pathname;
  const setPeek = (v: boolean | ((p: boolean) => boolean)) => setPeekPath((cur) => ((typeof v === "function" ? v(cur === pathname) : v) ? pathname : null));

  const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    setPeek(false);
    start(async () => {
      await setMenuPinned(next);
    });
  };

  const label = (k: PageKey) => (k === "settings" && !user.isAdmin ? "Account" : PAGES[k].label);
  const item = (k: PageKey) => (
    <Link key={k} href={PAGES[k].href} title={label(k)} aria-current={current === k ? "page" : undefined}>
      <PageIcon page={k} />
      <span>{label(k)}</span>
      <Suspense fallback={null}>
        <CountBadge counts={counts} k={k} />
      </Suspense>
    </Link>
  );

  return (
    <div
      className={"app" + (pinned ? " pinned" : "") + (peek ? " peek" : "")}
      onClickCapture={(e) => {
        if (peek && !(e.target as HTMLElement).closest(".side, .menu-btn")) setPeek(false);
      }}
    >
      <aside
        className="side"
        aria-label="Main menu"
        onMouseEnter={() => !pinned && !isPhone() && setPeek(true)}
        onMouseLeave={() => !pinned && !isPhone() && setPeek(false)}
      >
        <div className="side-top">
          {/* Light-background logo in the light look, dark-background logo in the dark look (globals.css .on-light / .on-dark) */}
          <span className="logo-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded or bundled SVG artwork */}
            <img className="on-light" src={logos.light} alt={companyName} />
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded or bundled SVG artwork */}
            <img className="on-dark" src={logos.dark} alt="" aria-hidden="true" />
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded or bundled SVG artwork */}
          <img className="logo-mark" src={logos.mark} alt={companyName} />
          <button
            type="button"
            className="pin"
            onClick={togglePin}
            aria-pressed={pinned}
            title={pinned ? "Collapse the menu to icons (hover to open it)" : "Keep the menu open"}
          >
            <PinIcon />
          </button>
        </div>
        <div className="side-app">Analytics</div>
        <nav className="side-nav">{MAIN_MENU.map(item)}</nav>
        <div className="side-spacer" />
        <div className="side-bottom">
          <nav className="side-nav">{BOTTOM_MENU.map(item)}</nav>
          <div className="user">
            <span className="avatar" title={user.name}>
              {initials(user.name)}
            </span>
            <span className="who">
              <strong>{user.name}</strong>
              <span>{user.roleLabel}</span>
            </span>
            <form action={signOut}>
              <button type="submit" className="pin" title="Sign out" aria-label="Sign out">
                <SignOutIcon />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="mainwrap">
        <header className="topbar">
          <button type="button" className="menu-btn" aria-label="Show menu" onClick={() => setPeek((p) => !p)}>
            <MenuIcon />
          </button>
          <Suspense fallback={<span className="crumb">{current ? label(current) : ""}</span>}>
            <Crumb page={current} pageLabel={current ? label(current) : ""} noSections={current === "settings" && !user.isAdmin} />
          </Suspense>
          <span className="right">
            <details className="notif">
              <summary aria-label="Notifications (coming soon)" title="Notifications (coming soon)">
                <BellIcon />
              </summary>
              <div className="notif-pop" role="dialog" aria-label="Notifications">
                <b>Notifications — coming soon</b>
                <p>Urgent things Analytics notices (for example something serious from the Accounts Hub) will show here. Not designed yet — to discuss with Asal. Until then: Tasks → “New since the last sync”.</p>
              </div>
            </details>
            <span className="co">{companyName}</span>
          </span>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}

function Crumb({ page, pageLabel, noSections }: { page: PageKey | null; pageLabel: string; noSections?: boolean }) {
  const sp = useSearchParams();
  if (!page) return <span className="crumb" />;
  const [a, b] = noSections ? [pageLabel] : crumbFor(page, parseSection(page, sp.get("section")), { pageLabel });
  return (
    <span className="crumb">
      {a}
      {b && <span> / {b}</span>}
    </span>
  );
}

function CountBadge({ counts, k }: { counts: ShellProps["counts"]; k: PageKey }) {
  const c = counts instanceof Promise ? use(counts) : counts;
  const n = c[k];
  return n ? <span className="count">{n}</span> : null;
}
