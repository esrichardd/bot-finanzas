"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "../../../lib/utils";

export const CATEGORY_COLORS = [
  "#1D9E75", "#D85A30", "#378ADD", "#7F77DD", "#639922", "#D4537E",
  "#EF9F27", "#534AB7", "#0F6E56", "#888780", "#993C1D", "#5F5E5A",
  "#3B6D11",
] as const;

export function ColorPicker({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const t = useTranslations("categories");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("color")}>
        {CATEGORY_COLORS.map((color) => (
          <button
            aria-label={t("selectColor", { color })}
            aria-pressed={value.toUpperCase() === color}
            className={cn(
              "relative size-10 rounded-full border-2 border-background shadow-sm outline-none ring-1 ring-border transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              value.toUpperCase() === color && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
            disabled={disabled}
            key={color}
            onClick={() => onChange(color)}
            style={{ backgroundColor: color }}
            type="button"
          >
            {value.toUpperCase() === color ? <Check className="mx-auto size-4 text-white drop-shadow" /> : null}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground" htmlFor="custom-category-color">
          {t("customColor")}
          <input
            aria-label={t("customColor")}
            className="size-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            id="custom-category-color"
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#378ADD"}
          />
        </label>
      </div>
      <input name="color" type="hidden" value={disabled ? "" : value} />
    </div>
  );
}
