import { AuthCard } from "@/components/auth/auth-card";
import { FormError } from "@/components/auth/fields";
import { checkAuthToken, tokenProblemMessage } from "@/lib/auth/tokens";
import { getCompany } from "@/lib/company";
import { AccessDecisionForm } from "./decision-form";

const date = (d: Date, tz: string) => d.toLocaleDateString("en-AU", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" });

/** Shared by /access/approve and /access/decline (one link token covers both). */
export async function AccessRequestView({ token, decision }: { token: string; decision: "approve" | "decline" }) {
  const check = await checkAuthToken(token, ["ACCESS_APPROVE"]);
  const title = decision === "approve" ? "Approve access" : "Decline access";
  if (!check.ok || !check.token.accessRequest) {
    return (
      <AuthCard title={title}>
        <FormError>{tokenProblemMessage(check.ok ? "unknown" : check.reason, "approval")}</FormError>
        <p className="mt-4 text-sm text-muted">Pending requests are also in Settings → Company &amp; users.</p>
      </AuthCard>
    );
  }
  const req = check.token.accessRequest;
  const tz = (await getCompany()).timezone;
  if (req.status !== "PENDING") {
    return (
      <AuthCard title={title}>
        <FormError>
          This request has already been dealt with ({req.status === "APPROVED" ? "approved" : "declined"}
          {req.decidedAt ? ` on ${date(req.decidedAt, tz)}` : ""}).
        </FormError>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={title} sub="No sign-in needed — your two-step sign-in code confirms it's you.">
      <dl className="mb-5 grid gap-x-4 gap-y-0.5 rounded border border-border bg-surface p-3 text-sm sm:grid-cols-[max-content_1fr] sm:gap-y-1">
        <dt className="text-xs text-muted sm:text-sm">Name</dt>
        <dd className="m-0 mb-1.5 font-medium sm:mb-0">{req.name}</dd>
        <dt className="text-xs text-muted sm:text-sm">Email</dt>
        <dd className="m-0 mb-1.5 [overflow-wrap:anywhere] sm:mb-0">{req.email}</dd>
        <dt className="text-xs text-muted sm:text-sm">Reason</dt>
        <dd className="m-0 mb-1.5 sm:mb-0">{req.reason}</dd>
        <dt className="text-xs text-muted sm:text-sm">Asked on</dt>
        <dd className="m-0">{date(req.createdAt, tz)}</dd>
      </dl>
      <AccessDecisionForm token={token} decision={decision} firstName={req.name.split(" ")[0]} />
    </AuthCard>
  );
}
