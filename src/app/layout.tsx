import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { getCompany, logoUrl } from "@/lib/company";
import { brandCss } from "@/lib/brand";
import { AppShell } from "@/components/shell/app-shell";
import { IdleWarning } from "@/components/shell/idle-warning";
import { getCurrentUser, IDLE_MINUTES } from "@/lib/auth/session";
import { isAdminRole, roleLabel } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { navCounts } from "@/lib/shell/counts";
import { themeAttr } from "@/lib/theme";
import { logout } from "./login/actions";
import "./globals.css";
import "./analytics.css";

// Company name/logo/colours come from the database and must always be current.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompany();
  return {
    title: { default: `${company.shortName} Analytics`, template: `%s · ${company.shortName} Analytics` },
    description: "Cost to serve, leakage, savings, rate reviews, reports, KPI and finance.",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const company = await getCompany();
  const user = await getCurrentUser();

  let pinned = true;
  let theme: "light" | "dark" | undefined;
  let counts: Promise<Awaited<ReturnType<typeof navCounts>>> | Record<string, never> = {};
  if (user && company.dbOk) {
    const pref = await prisma.user.findUnique({ where: { id: user.id }, select: { menuPinned: true, theme: true } }).catch(() => null);
    pinned = pref?.menuPinned ?? true;
    theme = themeAttr(pref?.theme);
    // Menu badges stream in after the frame (Batch 2 item 12) — never hold up the page.
    counts = navCounts().catch(() => ({}));
  }

  return (
    // No data-theme = follow the device (light/dark); set only when the person chose one in Settings.
    <html lang="en-AU" className="h-full antialiased" data-theme={theme}>
      <head>
        {/* Brand tokens from Settings → Branding (server-rendered, so no colour flash on load) */}
        <style id="brand-tokens" dangerouslySetInnerHTML={{ __html: brandCss(company) }} />
      </head>
      <body className="min-h-full">
        {!company.dbOk && (
          <div className="banner">
            Database not reachable — check <code className="mono">DATABASE_URL</code> in <code className="mono">.env</code> and that PostgreSQL is running.
          </div>
        )}
        {user ? (
          <AppShell
            initialPinned={pinned}
            user={{ name: user.name, roleLabel: roleLabel(user.role), isAdmin: isAdminRole(user.role) }}
            companyName={company.name}
            logos={{ light: logoUrl(company, "light"), dark: logoUrl(company, "dark"), mark: logoUrl(company, "mark") }}
            counts={counts}
            signOut={logout}
          >
            {children}
            <IdleWarning idleMinutes={IDLE_MINUTES} />
          </AppShell>
        ) : (
          <main className="main">{children}</main>
        )}
      </body>
    </html>
  );
}
