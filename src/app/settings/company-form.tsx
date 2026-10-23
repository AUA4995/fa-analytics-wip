"use client";

import { savedKey, useSavedForm } from "@/components/ui/saved-form";
import type { CompanyInfo } from "@/lib/company";
import { saveCompany, type CompanyActionState } from "./actions";

const initial: CompanyActionState = { ok: false, message: "" };

export function CompanyForm({ company }: { company: CompanyInfo }) {
  // No React form reset; re-mounts with the saved values after Save (Batch 2 item 4).
  const { state, onSubmit, pending } = useSavedForm(saveCompany, initial);
  const err = (field: string) => state.errors?.[field];

  return (
    <form onSubmit={onSubmit} key={savedKey([company.name, company.shortName, company.accountHolderName, company.accountHolderEmail, company.timezone])} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" error={err("name")}>
          <input name="name" defaultValue={company.name} required className={inputCls} />
        </Field>
        <Field label="Short name (used in titles and email subjects)" error={err("shortName")}>
          <input name="shortName" defaultValue={company.shortName} required maxLength={20} className={inputCls} />
        </Field>
        <Field label="Timezone" hint="IANA name, e.g. Australia/Sydney" error={err("timezone")}>
          <input name="timezone" defaultValue={company.timezone} className={inputCls} required />
        </Field>
      </div>

      <p className="meta" style={{ margin: 0 }}>
        Logos and colours: see <a href="/settings?section=branding">Branding</a>.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn primary"
        >
          {pending ? "Saving…" : "Save company settings"}
        </button>
        {state.message && (
          <span className={"text-sm " + (state.ok ? "text-green-700" : "text-red-700")} role="status">
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded border border-border bg-card px-3 py-2 text-sm text-fa-charcoal outline-none focus:border-fa-blue focus:ring-2 focus:ring-fa-blue-light";

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-fa-grey-dark">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}
