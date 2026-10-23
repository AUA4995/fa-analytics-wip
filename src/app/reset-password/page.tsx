import { AuthCard } from "@/components/auth/auth-card";
import { FormError } from "@/components/auth/fields";
import { checkAuthToken, tokenProblemMessage } from "@/lib/auth/tokens";
import { NewPasswordForm } from "../login/public-forms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set a new password" };

/** Reset link (2 hours) — also the owner recovery link, which resets two-step sign-in too. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const check = await checkAuthToken(token, ["RESET", "TWO_FACTOR_RESET"]);
  if (!check.ok || !check.token.user) {
    return (
      <AuthCard title="Set a new password">
        <FormError>{tokenProblemMessage(check.ok ? "unknown" : check.reason, "reset")}</FormError>
        <p className="mt-5 text-sm text-muted">
          <a href="/forgot-password">Send a new link</a> · <a href="/login">Back to sign in</a>
        </p>
      </AuthCard>
    );
  }
  const recovery = check.token.purpose === "TWO_FACTOR_RESET";
  return (
    <AuthCard
      title={recovery ? "Reset password and two-step sign-in" : "Set a new password"}
      sub={recovery ? `For ${check.token.user.email}. After this you'll set up two-step sign-in again.` : `For ${check.token.user.email}.`}
    >
      <NewPasswordForm token={token} kind="reset" submitLabel={recovery ? "Save and set up two-step sign-in" : "Save new password"} />
    </AuthCard>
  );
}
