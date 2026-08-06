"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "../../../lib/utils";

export const CATEGORY_EMOJIS = [
  "🏷️", "🛒", "🍽️", "🚗", "🚌", "⛽", "🏠", "💡", "❤️‍🩹", "💊",
  "🎬", "🎮", "🎓", "📚", "✈️", "🏖️", "🧾", "🏛️", "📦", "💰",
  "💵", "🐾", "👕", "🎁", "☕", "📱", "💻", "🔧", "🌱", "✨",
] as const;

export function EmojiPicker({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const t = useTranslations("categories");
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8" role="group" aria-label={t("emoji")}>
        {CATEGORY_EMOJIS.map((emoji) => (
          <button
            aria-label={t("selectEmoji", { emoji })}
            aria-pressed={value === emoji}
            className={cn(
              "relative flex size-10 items-center justify-center rounded-lg border text-xl transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
              value === emoji && "border-primary bg-primary/10 ring-2 ring-primary/30",
            )}
            disabled={disabled}
            key={emoji}
            onClick={() => onChange(emoji)}
            type="button"
          >
            {emoji}
            {value === emoji ? <Check className="absolute right-0.5 bottom-0.5 size-3 text-primary" /> : null}
          </button>
        ))}
      </div>
      <input name="emoji" type="hidden" value={disabled ? "" : value} />
    </div>
  );
}
