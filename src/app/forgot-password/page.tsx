import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "../login/public-forms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot your password?" sub="Enter your email and we'll send you a link to set a new one.">
      <ForgotPasswordForm />
      <p className="mt-5 text-sm text-muted">
        <a href="/login">Back to sign in</a>
      </p>
    </AuthCard>
  );
}
