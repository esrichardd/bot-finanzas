import { LocaleToggle } from "../../../components/shared/locale-toggle";
import { ThemeToggle } from "../../../components/shared/theme-toggle";

export default function PublicAuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <div className="flex justify-end gap-1 px-4 py-4 sm:px-6">
        <LocaleToggle />
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
