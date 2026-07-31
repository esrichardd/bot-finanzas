import { AuthShell } from "../../../../components/shared/auth-shell";
import { LoginForm } from "../../../../features/auth/components/login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <AuthShell>
        <LoginForm />
      </AuthShell>
    </main>
  );
}
