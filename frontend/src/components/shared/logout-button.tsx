"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { authClient } from "../../lib/auth";
import { Button } from "../ui/button";

export function LogoutButton() {
  const router = useRouter();
  const t = useTranslations("common");

  async function logout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      aria-label={t("logout")}
      onClick={logout}
      size="icon"
      variant="ghost"
    >
      <LogOut />
    </Button>
  );
}
