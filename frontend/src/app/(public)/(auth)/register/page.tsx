import { AuthShell } from "../../../../components/shared/auth-shell";
import { RegisterForm } from "../../../../features/auth/components/register-form";

export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <AuthShell>
        <RegisterForm />
      </AuthShell>
    </main>
  );
}
