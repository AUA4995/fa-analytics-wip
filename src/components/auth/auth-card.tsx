import type { ReactNode } from "react";
import { getCompany, logoUrl } from "@/lib/company";

/**
 * Card for the signed-out pages (sign in, 2FA, email links, request access, approve/decline).
 * Works at phone width: full width with the page gutter, max 420px.
 */
export async function AuthCard({ title, sub, children, wide = false }: { title: string; sub?: ReactNode; children: ReactNode; wide?: boolean }) {
  const company = await getCompany();
  return (
    <div className={"mx-auto mt-6 w-full rounded-lg border border-border bg-card p-5 shadow-sm sm:mt-16 sm:p-6 " + (wide ? "max-w-xl" : "max-w-md")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded artwork */}
      <img src={logoUrl(company, "light")} alt={company.name} className="on-light mb-5 h-8 w-auto" />
      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded artwork */}
      <img src={logoUrl(company, "dark")} alt="" aria-hidden="true" className="on-dark mb-5 h-8 w-auto" />
      <h1 className="mb-1 text-lg font-semibold text-fa-charcoal">{title}</h1>
      <div className="mb-5 text-sm text-muted">{sub ?? `${company.name} · Analytics`}</div>
      {children}
    </div>
  );
}
