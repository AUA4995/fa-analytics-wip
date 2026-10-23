import { redirect } from "next/navigation";
import { getCurrentUser, getPendingLogin, userCount } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/paths";
import { AuthCard } from "@/components/auth/auth-card";
import { FormNotice } from "@/components/auth/fields";
import { LoginForm } from "./auth-forms";

export const dynamic = "force-dynamic";

const DONE: Record<string, string> = {
  reset: "Password changed — sign in with your new password.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : "/");
  if (await getCurrentUser()) redirect(next);
  // Password already accepted on this browser → straight to the 2FA step.
  const pending = await getPendingLogin();
  const q = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  if (pending) redirect(pending.user.totpEnabled ? `/login/verify${q}` : `/login/setup-2fa${q}`);
  if ((await userCount().catch(() => 1)) === 0) redirect("/setup");
  const done = typeof sp.done === "string" ? DONE[sp.done] : undefined;
  return (
    <AuthCard title="Sign in">
      {done && (
        <div className="mb-4">
          <FormNotice>{done}</FormNotice>
        </div>
      )}
      <LoginForm next={next} />
      <p className="mt-5 text-sm text-muted">
        New here? <a href="/request-access">Request access</a>
      </p>
    </AuthCard>
  );
}
