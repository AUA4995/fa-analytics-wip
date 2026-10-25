import { redirect } from "next/navigation";
import { getCurrentUser, getPendingLogin, IDLE_MINUTES } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/paths";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyCodeForm } from "../two-factor-forms";

export const dynamic = "force-dynamic";

/** Login step 2 (Batch 2 item 32). Needs the half-done sign-in from step 1. */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : "/");
  if (await getCurrentUser()) redirect(next);
  const pending = await getPendingLogin();
  if (!pending) redirect("/login");
  if (!pending.user.totpEnabled) redirect(`/login/setup-2fa${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}`);
  return (
    <AuthCard title={pending.idleLocked ? "Welcome back" : "Two-step sign-in"} sub={pending.idleLocked ? `Signed out after ${IDLE_MINUTES} minutes without activity. Enter your code to continue as ${pending.user.email}.` : `Signing in as ${pending.user.email}`}>
      <VerifyCodeForm next={next} />
    </AuthCard>
  );
}
