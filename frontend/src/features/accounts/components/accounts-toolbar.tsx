"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import type { Currency } from "../../../lib/api/accounts";
import type { AccountViewModel } from "../queries";

export type AccountTab = "active" | "archived";
export type TypeFilter = "all" | "bank" | "cash" | "crypto";
export type SortOption = "name" | "balance-asc" | "balance-desc";

export function AccountsToolbar({
  tab,
  search,
  type,
  currency,
  institution,
  sort,
  currencies,
  accounts,
  onTabChange,
  onSearchChange,
  onTypeChange,
  onCurrencyChange,
  onInstitutionChange,
  onSortChange,
  onClear,
}: {
  tab: AccountTab;
  search: string;
  type: TypeFilter;
  currency: string;
  institution: string;
  sort: SortOption;
  currencies: Currency[];
  accounts: AccountViewModel[];
  onTabChange: (tab: AccountTab) => void;
  onSearchChange: (value: string) => void;
  onTypeChange: (value: TypeFilter) => void;
  onCurrencyChange: (value: string) => void;
  onInstitutionChange: (value: string) => void;
  onSortChange: (value: SortOption) => void;
  onClear: () => void;
}) {
  const t = useTranslations("accounts");
  const institutions = [...new Set(accounts.map((account) => account.institution).filter((value): value is string => Boolean(value)))].sort();
  const hasFilters = Boolean(search || type !== "all" || currency !== "all" || institution !== "all" || sort !== "name");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b" role="tablist" aria-label={t("accountStatus")}>
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={t("searchPlaceholder")} className="pl-9" onChange={(event) => onSearchChange(event.target.value)} placeholder={t("searchPlaceholder")} value={search} />
        </div>
        <Select aria-label={t("type")} onChange={(event) => onTypeChange(event.target.value as TypeFilter)} value={type}>
          <option value="all">{t("allTypes")}</option>
          <option value="bank">{t("bank")}</option>
          <option value="cash">{t("cash")}</option>
          <option value="crypto">{t("crypto")}</option>
        </Select>
        <Select aria-label={t("currency")} onChange={(event) => onCurrencyChange(event.target.value)} value={currency}>
          <option value="all">{t("allCurrencies")}</option>
          {currencies.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}
        </Select>
        <Select aria-label={t("institution")} onChange={(event) => onInstitutionChange(event.target.value)} value={institution}>
          <option value="all">{t("allInstitutions")}</option>
          {institutions.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select aria-label={t("sortLabel")} className="w-auto min-w-48" onChange={(event) => onSortChange(event.target.value as SortOption)} value={sort}>
          <option value="name">{t("sortName")}</option>
          <option value="balance-asc">{t("sortBalanceAsc")}</option>
          <option value="balance-desc">{t("sortBalanceDesc")}</option>
        </Select>
        {hasFilters ? <Button onClick={onClear} size="sm" type="button" variant="ghost"><X />{t("clearFilters")}</Button> : null}
      </div>
    </div>
  );
}
