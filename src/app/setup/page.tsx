import { redirect } from "next/navigation";
import { getCompany, logoUrl } from "@/lib/company";
import { userCount } from "@/lib/auth/session";
import { SetupForm } from "../login/auth-forms";

export const dynamic = "force-dynamic";

/** First-run screen — only reachable while no users exist. */
export default async function SetupPage() {
  if ((await userCount()) > 0) redirect("/login");
  const company = await getCompany();
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded artwork */}
      <img src={logoUrl(company, "light")} alt={company.name} className="on-light mb-5 h-8 w-auto" />
      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded artwork */}
      <img src={logoUrl(company, "dark")} alt="" aria-hidden="true" className="on-dark mb-5 h-8 w-auto" />
      <h1 className="mb-1 text-lg font-semibold text-fa-charcoal">Create the owner account</h1>
      <p className="mb-5 text-sm text-muted">
        First run — no users exist yet. This account is the owner: it connects Xero, Front and AI and adds admins and users
        (e.g. David) in Settings → Company &amp; users. Next you&apos;ll set up two-step sign-in with an authenticator app.
      </p>
      <SetupForm />
    </div>
  );
}
