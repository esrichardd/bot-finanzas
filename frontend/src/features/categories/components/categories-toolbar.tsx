"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";

export type CategoryTab = "active" | "archived";
export type OwnershipFilter = "all" | "system" | "mine";

export function CategoriesToolbar({ tab, search, ownership, onTabChange, onSearchChange, onOwnershipChange, onClear }: {
  tab: CategoryTab;
  search: string;
  ownership: OwnershipFilter;
  onTabChange: (value: CategoryTab) => void;
  onSearchChange: (value: string) => void;
  onOwnershipChange: (value: OwnershipFilter) => void;
  onClear: () => void;
}) {
  const t = useTranslations("categories");
  const hasFilters = Boolean(search || ownership !== "all");
  return (
    <div className="space-y-4">
      <div aria-label={t("status")} className="flex gap-1 border-b" role="tablist">
        {(["active", "archived"] as const).map((item) => (
          <button
            aria-selected={tab === item}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            key={item}
            onClick={() => onTabChange(item)}
            role="tab"
            type="button"
          >
            {t(item)}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={t("searchPlaceholder")} className="h-9 pl-9" onChange={(event) => onSearchChange(event.target.value)} placeholder={t("searchPlaceholder")} value={search} />
        </div>
        {tab === "active" ? (
          <Select aria-label={t("ownership")} className="h-9 sm:w-48" onChange={(event) => onOwnershipChange(event.target.value as OwnershipFilter)} value={ownership}>
            <option value="all">{t("all")}</option>
            <option value="system">{t("systemOnly")}</option>
            <option value="mine">{t("mineOnly")}</option>
          </Select>
        ) : null}
      </div>
      {hasFilters ? <Button onClick={onClear} size="sm" type="button" variant="ghost"><X />{t("clearFilters")}</Button> : null}
    </div>
  );
}
