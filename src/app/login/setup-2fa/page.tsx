import { redirect } from "next/navigation";
import { getCurrentUser, getPendingLogin } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/paths";
import { getCompany } from "@/lib/company";
import { getOrCreateEnrolmentSecret } from "@/lib/auth/two-factor";
import { groupKey, otpauthUri } from "@/lib/auth/totp";
import { encodeQr, qrSvgPath } from "@/lib/auth/qr";
import { AuthCard } from "@/components/auth/auth-card";
import { SetupTwoFactorForm } from "../two-factor-forms";

export const dynamic = "force-dynamic";

/**
 * Two-step sign-in set-up (Batch 2 item 32): first sign-in after the release, after an invite, or after the owner
 * reset someone's 2FA. Same secret on reload until confirmed.
 */
export default async function SetupTwoFactorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : "/");
  const company = await getCompany();
  const props = { next, qrPath: "", qrDim: 0, secretGrouped: "", uri: "", done: false };

  const pending = await getPendingLogin();
  if (!pending) {
    if (await getCurrentUser()) redirect(next);
    redirect("/login");
  } else if (pending.enrolledNow) {
    // Confirmed on this session; the backup codes are on screen (or the page was reloaded) — "Continue" finishes.
    props.done = true;
  } else if (pending.user.totpEnabled) {
    redirect(`/login/verify${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}`);
  } else {
    const secret = await getOrCreateEnrolmentSecret(pending.user.id);
    const uri = otpauthUri({ secret, account: pending.user.email, issuer: `${company.shortName} Analytics` });
    const qr = encodeQr(uri);
    Object.assign(props, { qrPath: qrSvgPath(qr, 4), qrDim: qr.size + 8, secretGrouped: groupKey(secret), uri });
  }

  return (
    <AuthCard title="Set up two-step sign-in" sub={pending ? `Everyone signs in with a password and a code from their phone. Account: ${pending.user.email}` : undefined}>
      <SetupTwoFactorForm {...props} />
    </AuthCard>
  );
}
