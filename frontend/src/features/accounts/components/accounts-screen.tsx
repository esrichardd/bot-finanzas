"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import type { Currency } from "../../../lib/api/accounts";
import type { AccountViewModel } from "../queries";
import { AccountsToolbar, type AccountTab, type SortOption, type TypeFilter } from "./accounts-toolbar";
import { AccountsList } from "./accounts-list";
import { AdjustBalanceDialog } from "./adjust-balance-dialog";
import { ArchiveAccountDialog } from "./archive-account-dialog";
import { CreateAccountDialog } from "./create-account-dialog";
import { EditAccountDialog } from "./edit-account-dialog";

function normalize(value: string, locale: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase(locale).trim();
}

type FeedbackKey = "createSuccess" | "updateSuccess" | "adjustSuccess" | "archiveSuccess" | "restoreSuccess";

export function AccountsScreen({ data, title, subtitle }: { data: { active: AccountViewModel[]; archived: AccountViewModel[]; currencies: Currency[] }; title: string; subtitle: string }) {
  const t = useTranslations("accounts");
  const [tab, setTab] = useState<AccountTab>("active");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [currency, setCurrency] = useState("all");
  const [institution, setInstitution] = useState("all");
  const [sort, setSort] = useState<SortOption>("name");
  const [selectedAccount, setSelectedAccount] = useState<AccountViewModel | null>(null);
  const [dialog, setDialog] = useState<"edit" | "adjust" | "archive" | null>(null);
  const [feedbackKey, setFeedbackKey] = useState<FeedbackKey | null>(null);
  const previousArchivedIds = useRef<Set<string> | null>(null);
  const locale = useLocale();
  const source = tab === "active" ? data.active : data.archived;
  useEffect(() => {
    const currentArchivedIds = new Set(data.archived.map((account) => account.id));
    const previousIds = previousArchivedIds.current;
    if (previousIds && [...previousIds].some((id) => !currentArchivedIds.has(id))) {
      setFeedbackKey("restoreSuccess");
    }
    previousArchivedIds.current = currentArchivedIds;
  }, [data.archived]);
  const visible = useMemo(() => {
    const query = normalize(search, locale);
    return source
      .filter((account) => !query || normalize(`${account.name} ${account.institution ?? ""}`, locale).includes(query))
      .filter((account) => type === "all" || account.type === type)
      .filter((account) => currency === "all" || account.currencyCode === currency)
      .filter((account) => institution === "all" || account.institution === institution)
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, locale) : sort === "balance-asc" ? a.balance - b.balance : b.balance - a.balance);
  }, [currency, institution, locale, search, sort, source, type]);

  function openDialog(kind: "edit" | "adjust" | "archive", account: AccountViewModel) {
    setSelectedAccount(account);
    setDialog(kind);
    setFeedbackKey(null);
  }
  function showFeedback(key: FeedbackKey) { setFeedbackKey(key); }
  function clearFilters() {
    setSearch(""); setType("all"); setCurrency("all"); setInstitution("all"); setSort("name");
  }
  const hasNoAccounts = tab === "active" ? data.active.length === 0 : data.archived.length === 0;
  return (
    <section className="mx-auto max-w-6xl space-y-8 py-4 md:py-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2"><p className="text-sm text-muted-foreground">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-normal tracking-tight md:text-5xl">{title}</h1><p className="max-w-xl text-muted-foreground">{subtitle}</p></div>
        <CreateAccountDialog currencies={data.currencies} onSuccess={() => showFeedback("createSuccess")} />
      </div>
      {feedbackKey ? <p aria-live="polite" className="text-sm text-primary" role="status">{t(feedbackKey)}</p> : null}
      <AccountsToolbar accounts={source} currencies={data.currencies} institution={institution} onClear={clearFilters} onCurrencyChange={setCurrency} onInstitutionChange={setInstitution} onSearchChange={setSearch} onSortChange={setSort} onTabChange={setTab} onTypeChange={setType} search={search} sort={sort} tab={tab} type={type} currency={currency} />
      {hasNoAccounts ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center">
          <h2 className="font-serif text-2xl">{tab === "active" ? t("emptyTitle") : t("emptyArchivedTitle")}</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">{tab === "active" ? t("emptyDescription") : t("emptyArchivedDescription")}</p>
          {tab === "active" ? <div className="mt-6"><CreateAccountDialog currencies={data.currencies} onSuccess={() => showFeedback("createSuccess")} /></div> : null}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center">
          <h2 className="font-serif text-2xl">{t("noResultsTitle")}</h2>
          <p className="mt-2 text-muted-foreground">{t("noResultsDescription")}</p>
          <Button className="mt-5" onClick={clearFilters} variant="outline">{t("clearFilters")}</Button>
        </div>
      ) : (
        <AccountsList accounts={visible} archived={tab === "archived"} onAdjust={(account) => openDialog("adjust", account)} onArchive={(account) => openDialog("archive", account)} onEdit={(account) => openDialog("edit", account)} />
      )}
      {dialog === "edit" ? <EditAccountDialog account={selectedAccount} onOpenChange={(open) => { if (!open) setDialog(null); }} onSuccess={() => showFeedback("updateSuccess")} open /> : null}
      {dialog === "adjust" ? <AdjustBalanceDialog account={selectedAccount} onOpenChange={(open) => { if (!open) setDialog(null); }} onSuccess={() => showFeedback("adjustSuccess")} open /> : null}
      {dialog === "archive" ? <ArchiveAccountDialog account={selectedAccount} onOpenChange={(open) => { if (!open) setDialog(null); }} onSuccess={() => showFeedback("archiveSuccess")} open /> : null}
    </section>
  );
}
