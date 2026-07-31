import { getTranslations } from "next-intl/server";

import { AppSidebar } from "../../components/shared/app-sidebar";
import { LocaleToggle } from "../../components/shared/locale-toggle";
import { LogoutButton } from "../../components/shared/logout-button";
import { ThemeToggle } from "../../components/shared/theme-toggle";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "../../components/ui/sidebar";
import { getMe } from "../../lib/api/users";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [me, t] = await Promise.all([
    getMe(),
    getTranslations("common"),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar email={me.email} />
      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
          <SidebarTrigger aria-label={t("toggleSidebar")} />
          <nav className="flex items-center gap-1" aria-label={t("appName")}>
            <LocaleToggle />
            <ThemeToggle />
            <LogoutButton />
          </nav>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 md:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
