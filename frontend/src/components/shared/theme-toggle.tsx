"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useTheme, type Theme } from "./theme-provider";

const themes: Theme[] = ["light", "dark", "system"];

export function ThemeToggle() {
  const t = useTranslations("common");
  const { resolvedTheme, setTheme, theme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button aria-label={t("theme")} size="icon" variant="ghost" />}
      >
        {resolvedTheme === "dark" ? <Moon /> : <Sun />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themes.map((value) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
            {value === "light" ? <Sun /> : value === "dark" ? <Moon /> : null}
            <span>{t(value)}</span>
            {theme === value ? <Check className="ml-auto" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
