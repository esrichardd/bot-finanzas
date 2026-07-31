import { useTranslations } from "next-intl";

import { LocaleToggle } from "./locale-toggle";
import { LogoutButton } from "./logout-button";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
  const t = useTranslations("common");

  return (
    <header className="flex items-center justify-between border-b bg-background px-6 py-4">
      <span className="font-semibold">{t("appName")}</span>
      <nav className="flex items-center gap-1" aria-label={t("appName")}>
        <LocaleToggle />
        <ThemeToggle />
        <LogoutButton />
      </nav>
    </header>
  );
}
