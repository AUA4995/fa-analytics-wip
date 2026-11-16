import { ThemePicker } from "@/components/settings/theme-picker";
import { parseTheme } from "@/lib/theme";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { parseSection } from "@/components/ui/sections";
import { WithSubNav } from "@/components/ui/sub-nav";
import { DEFAULT_LOGOS, FA_BRAND, getCompany, logoUrl } from "@/lib/company";
import { brandColours } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { CompanyForm } from "./company-form";
import { BrandingForm } from "./branding-form";
import { XeroCard } from "./xero-card";
import { FrontCard } from "./front-card";
import { isFrontConfigured } from "@/lib/front/client";
import { XERO_SCOPES, isXeroConfigured } from "@/lib/xero/config";
import { getConnection } from "@/lib/xero/auth";
import { ownerName as getOwnerName, requireUser } from "@/lib/auth/session";
import { isAdminRole, isOwnerRole, roleRank } from "@/lib/auth/roles";
import { getAccessDomain } from "@/lib/auth/domain";
import { getConnectionStatuses } from "@/lib/integrations/status";
import { AccessDomainForm, AccessRequestsList, MyAccount, UsersCard } from "./users-card";
import { parsePanel } from "@/components/ui/panel";
import { ensureModelDefaults } from "@/lib/model/defaults";
import { ContactsSection } from "./contacts-section";
import { ClientsSection, ModelPanel, PoolsSection, RulesSection, ServicesSection, StaffSection, SuppliersSection, TicketTypesSection } from "./model-sections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

/** Sections that arrive in later chunks (brief §14). */
const LATER: Record<string, string> = {};

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const me = await requireUser();
  const sp = await searchParams;
  const company = await getCompany();
  const myRow = company.dbOk ? await prisma.user.findUnique({ where: { id: me.id }, select: { totpEnabledAt: true, backupCodes: true, theme: true } }) : null;
  const myAccount = (
    <Card title="My account" sub={`${me.name} · ${me.email}`}>
      <MyAccount twoFactor={{ enabledAt: myRow?.totpEnabledAt?.toISOString() ?? null, backupLeft: myRow?.backupCodes.length ?? 0, tz: company.timezone }} />
    </Card>
  );
  const appearance = (
    <Card title="Appearance" sub="Light or dark look. Only changes it for you.">
      <ThemePicker initial={parseTheme(myRow?.theme)} />
    </Card>
  );
  if (!isAdminRole(me.role)) {
    return (
      <div className="page">
        <PageHeader title="Account" subtitle={`${me.name} · ${me.email}`} />
        {myAccount}
        {appearance}
        <p className="meta">Company and connection settings are managed by an admin.</p>
      </div>
    );
  }
  const isOwner = isOwnerRole(me.role);
  const ownerName = await getOwnerName();
  const section = parseSection("settings", sp.section);

  let body: React.ReactNode = null;
  if (section === "company") {
    const [conn, statuses, channelSetting, channelsSetting] = company.dbOk
      ? await Promise.all([
          getConnection(),
          getConnectionStatuses(),
          prisma.setting.findUnique({ where: { key: "frontSendChannelId" } }),
          prisma.setting.findUnique({ where: { key: "frontChannels" } }),
        ])
      : [null, [], null, null];
    const xs = statuses.find((x) => x.key === "xero");
    const granted = new Set((conn?.scopes ?? "").split(/\s+/));
    const flashKind = sp.xero === "connected" || sp.xero === "error" ? sp.xero : null;
    body = (
      <>
        <Card title="Company">
          <CompanyForm company={company} />
        </Card>
        <Card title="Xero" sub="Accounting and payroll, read-only. Owner connects.">
          <XeroCard
            configured={isXeroConfigured() && !!process.env.TOKEN_ENCRYPTION_KEY}
            connected={!!conn}
            tenantName={conn?.tenantName}
            lastSyncAt={conn?.lastSyncAt?.toISOString() ?? null}
            flash={flashKind ? { kind: flashKind, message: typeof sp.message === "string" ? sp.message : "" } : null}
            canConnect={isOwner}
            ownerName={ownerName}
            missingScopes={conn ? XERO_SCOPES.filter((s) => s.includes(".") && !granted.has(s)) : []}
            status={
              xs && xs.state !== "disconnected"
                ? { state: xs.state === "error" ? "error" : "connected", headline: xs.headline, detail: xs.detail }
                : { state: conn ? "connected" : "disconnected", headline: conn ? "Connected" : `Not connected${isOwner ? "" : ` — ask ${ownerName} to connect`}` }
            }
          />
        </Card>
        <Card title="Front · sending emails">
          <FrontCard
            configured={isFrontConfigured()}
            isOwner={isOwner}
            ownerName={ownerName}
            channelId={typeof channelSetting?.value === "string" ? channelSetting.value : null}
            channels={Array.isArray(channelsSetting?.value) ? (channelsSetting.value as Array<{ id: string; name: string; address: string }>) : []}
          />
        </Card>
      </>
    );
  } else if (section === "users") {
    const users = (await prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] })).sort((a, b) => roleRank(b) - roleRank(a));
    const [accessRequests, accessDomain] = company.dbOk
      ? await Promise.all([prisma.accessRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }), getAccessDomain()])
      : [[], ""];
    body = (
      <>
        <Card title="Users" sub={`${ownerName} is the owner and can't be changed or removed here.`}>
          <UsersCard
            me={{ id: me.id, role: me.role, primary: me.primary }}
            ownerName={ownerName}
            tz={company.timezone}
            users={users.map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role,
              extraOwner: u.extraOwner,
              active: u.active,
              lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
              invited: !u.passwordSetAt,
              twoFactor: !!u.totpEnabledAt,
            }))}
          />
        </Card>
        <Card title="Access requests" sub={`People who asked for access on the sign-in page (only @${accessDomain} emails).`}>
          <AccessRequestsList
            isOwner={isOwner}
            ownerName={ownerName}
            tz={company.timezone}
            requests={accessRequests.map((r) => ({ id: r.id, name: r.name, email: r.email, reason: r.reason, createdAt: r.createdAt.toISOString() }))}
          />
        </Card>
      </>
    );
  } else if (section === "security") {
    const accessDomain = company.dbOk ? await getAccessDomain() : "";
    body = (
      <>
        {myAccount}
        <Card title="Sign-in rules" sub="Same as the Accounts Hub: 8-hour session on a trusted device, then password + 2FA; reset links valid 2 hours; repeated wrong attempts are locked for a while.">
          <AccessDomainForm domain={accessDomain} />
        </Card>
      </>
    );
  } else if (section === "branding") {
    body = (
      <>
        {appearance}
        <Card title="Branding" sub="Logos and colours used across the app and in emails. Colours preview live while you edit; Save applies them for everyone.">
          <BrandingForm
            colours={brandColours(company)}
            logos={{ dark: logoUrl(company, "dark"), light: logoUrl(company, "light"), mark: logoUrl(company, "mark") }}
            uploaded={{ dark: company.hasLogoDark, light: company.hasLogoLight, mark: company.hasLogoMark }}
            defaults={{ ...FA_BRAND, logos: { dark: DEFAULT_LOGOS.dark, light: DEFAULT_LOGOS.light, mark: DEFAULT_LOGOS.mark } }}
          />
        </Card>
      </>
    );
  } else if (["rules", "clients", "suppliers", "staff", "services", "tickets", "pools"].includes(section)) {
    if (company.dbOk) await ensureModelDefaults(prisma);
    const site = typeof sp.site === "string" && ["smi", "par"].includes(sp.site) ? sp.site : "all";
    body =
      section === "rules" ? <RulesSection canEdit /> :
      section === "clients" ? <ClientsSection canEdit /> :
      section === "suppliers" ? <SuppliersSection canEdit /> :
      section === "staff" ? <StaffSection canEdit site={site} /> :
      section === "services" ? <ServicesSection canEdit /> :
      section === "tickets" ? <TicketTypesSection canEdit /> :
      <PoolsSection canEdit />;
  } else if (section === "contacts") {
    body = <ContactsSection />;
  } else {
    body = <EmptyState title="Not built yet">{LATER[section] ?? "Built in a later chunk."}</EmptyState>;
  }
  const panel = parsePanel(sp.panel);

  return (
    <WithSubNav page="settings" current={section}>
      <PageHeader title="Settings" subtitle={`Admins and the owner (${ownerName}).`} />
      {body}
      {panel && <ModelPanel panel={panel} canEdit />}
    </WithSubNav>
  );
}
