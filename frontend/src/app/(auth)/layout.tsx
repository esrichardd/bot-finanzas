import { LocaleToggle } from "../../components/shared/locale-toggle";
import { ThemeToggle } from "../../components/shared/theme-toggle";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="flex justify-end gap-1 px-6 py-4">
        <LocaleToggle />
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
