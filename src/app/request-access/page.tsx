import { AuthCard } from "@/components/auth/auth-card";
import { getAccessDomain } from "@/lib/auth/domain";
import { RequestAccessForm } from "../login/public-forms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Request access" };

export default async function RequestAccessPage() {
  const domain = await getAccessDomain();
  return (
    <AuthCard title="Request access" sub="The owner gets your request by email and can approve it from their phone.">
      <RequestAccessForm domain={domain} />
      <p className="mt-5 text-sm text-muted">
        Already have an account? <a href="/login">Sign in</a>
      </p>
    </AuthCard>
  );
}
