"use client";

import { Check } from "lucide-react";
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
type LocaleCode = (typeof locales)[number];

function SpainFlag() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-6 overflow-hidden rounded-[2px]"
      viewBox="0 0 24 16"
    >
      <rect fill="#AA151B" height="16" width="24" />
      <rect fill="#F1BF00" height="8" width="24" y="4" />
    </svg>
  );
}

function UnitedKingdomFlag() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-6 overflow-hidden rounded-[2px]"
      viewBox="0 0 24 16"
    >
      <rect fill="#012169" height="16" width="24" />
      <path d="M0 0L24 16M24 0L0 16" stroke="#FFF" strokeWidth="4" />
      <path d="M0 0L24 16M24 0L0 16" stroke="#C8102E" strokeWidth="2" />
      <path d="M12 0V16M0 8H24" stroke="#FFF" strokeWidth="6" />
      <path d="M12 0V16M0 8H24" stroke="#C8102E" strokeWidth="3" />
    </svg>
  );
}

function LocaleFlag({ locale }: { locale: LocaleCode }) {
  return locale === "es" ? <SpainFlag /> : <UnitedKingdomFlag />;
}

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
        <LocaleFlag locale={currentLocale as LocaleCode} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((locale) => (
          <DropdownMenuItem
            className="gap-2"
            key={locale}
            onClick={() => changeLocale(locale)}
          >
            <LocaleFlag locale={locale} />
            <span>{t(locale === "es" ? "spanish" : "english")}</span>
            {currentLocale === locale ? <Check className="ml-auto" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
