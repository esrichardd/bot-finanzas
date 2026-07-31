"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { NAV } from "./nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";

function getNavKey(key: string) {
  return key.replace("nav.", "");
}

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const navT = useTranslations("nav");
  const commonT = useTranslations("common");

  return (
    <Sidebar
      collapsible="icon"
      description={commonT("navigationDescription")}
      label={commonT("navigation")}
    >
      <SidebarHeader className="p-4">
        <Link
          className="flex items-center gap-2 overflow-hidden font-serif text-lg"
          href="/dashboard"
        >
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {commonT("appName")}
          </span>
          <span
            aria-hidden
            className="hidden group-data-[collapsible=icon]:inline"
          >
            {commonT("appName").slice(0, 1)}
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel className="uppercase tracking-[0.12em]">
              {navT(getNavKey(group.labelKey))}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const label = navT(getNavKey(item.labelKey));
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        render={<Link href={item.href} />}
                        tooltip={label}
                      >
                        <Icon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <span
          className="truncate text-xs text-muted-foreground"
          title={email}
        >
          {email}
        </span>
      </SidebarFooter>
    </Sidebar>
  );
}
