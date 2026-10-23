import { AuthCard } from "@/components/auth/auth-card";
import { FormError } from "@/components/auth/fields";
import { checkAuthToken, tokenProblemMessage } from "@/lib/auth/tokens";
import { NewPasswordForm } from "../login/public-forms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set your password" };

/** Invitation link (7 days): set a password, then set up two-step sign-in. */
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const check = await checkAuthToken(token, ["INVITE"]);
  if (!check.ok || !check.token.user) {
    return (
      <AuthCard title="Set your password">
        <FormError>{tokenProblemMessage(check.ok ? "unknown" : check.reason, "invitation")}</FormError>
        <p className="mt-5 text-sm text-muted">Ask the person who added you to send a new invitation. · <a href="/login">Sign in</a></p>
      </AuthCard>
    );
  }
  const u = check.token.user;
  return (
    <AuthCard title={`Welcome, ${u.name.split(" ")[0]}`} sub={`Set a password for ${u.email}. Next you'll set up two-step sign-in with an authenticator app.`}>
      <NewPasswordForm token={token} kind="invite" submitLabel="Set password and continue" />
    </AuthCard>
  );
}
