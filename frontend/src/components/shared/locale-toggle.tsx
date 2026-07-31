"use client";

import { Check, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { setLocale } from "../../features/auth/actions";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const locales = ["es", "en"] as const;

export function LocaleToggle() {
  const currentLocale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");

  async function changeLocale(locale: (typeof locales)[number]) {
    await setLocale(locale);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label={t("language")} size="icon" variant="ghost" />
        }
      >
        <Languages />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((locale) => (
          <DropdownMenuItem key={locale} onClick={() => changeLocale(locale)}>
            <span>{t(locale === "es" ? "spanish" : "english")}</span>
            {currentLocale === locale ? <Check className="ml-auto" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
