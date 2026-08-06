"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import type { CreditCard } from "../../../lib/api/credit-cards";
import type { Currency } from "../../../lib/api/accounts";
import type { Category } from "../../../lib/api/categories";
import { AdjustCardBalanceDialog } from "./adjust-card-balance-dialog";
import { ArchiveCreditCardDialog } from "./archive-credit-card-dialog";
import { CreateCreditCardDialog } from "./create-credit-card-dialog";
import { CreditCardPanel } from "./credit-card-panel";
import { EditCreditCardDialog } from "./edit-credit-card-dialog";

function normalize(value: string, locale: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase(locale).trim();
}

type DialogKind = "edit" | "adjust" | "archive" | null;

export function CreditCardsScreen({ data, title, subtitle }: { data: { active: CreditCard[]; archived: CreditCard[]; currencies: Currency[]; categories: Category[] }; title: string; subtitle: string }) {
  const t = useTranslations("creditCards");
  const locale = useLocale();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState("all");
  const [sort, setSort] = useState("name");
  const [selected, setSelected] = useState<CreditCard | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const source = tab === "active" ? data.active : data.archived;
  const managementFeeCategoryId = data.categories.find((category) => normalize(category.name, locale) === "comisiones")?.id;
  const currencies = data.currencies;
  const visible = useMemo(() => {
    const query = normalize(search, locale);
    return [...source].filter((card) => !query || normalize(`${card.account.name} ${card.account.institution ?? ""}`, locale).includes(query)).filter((card) => currency === "all" || card.account.currencyCode === currency).sort((a, b) => {
      if (a.configured !== b.configured) return a.configured ? -1 : 1;
      if (sort === "debt") return (b.configured ? b.debt : b.balance) - (a.configured ? a.debt : a.balance);
      if (sort === "utilization") return (b.configured ? b.utilizationPercentage : -1) - (a.configured ? a.utilizationPercentage : -1);
      if (sort === "payment") return (a.configured ? a.nextPaymentDueDate : "9999").localeCompare(b.configured ? b.nextPaymentDueDate : "9999");
      return a.account.name.localeCompare(b.account.name, locale);
    });
  }, [currency, locale, search, sort, source]);
  const hasNoCards = source.length === 0;
  function openDialog(kind: Exclude<DialogKind, null>, card: CreditCard) { setSelected(card); setDialog(kind); setFeedback(null); }
  function clearFilters() { setSearch(""); setCurrency("all"); setSort("name"); }
  function showFeedback(key: string) { setFeedback(key); }
  return <section className="mx-auto max-w-6xl space-y-7 py-4 md:py-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="space-y-2"><p className="text-sm text-muted-foreground">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-normal tracking-tight md:text-5xl">{title}</h1><p className="max-w-xl text-muted-foreground">{subtitle}</p></div><CreateCreditCardDialog currencies={currencies} onSuccess={() => showFeedback("createSuccess")} /></div>{feedback ? <p aria-live="polite" className="text-sm text-primary" role="status">{t(feedback as never)}</p> : null}<div className="flex flex-col gap-3 rounded-xl border bg-card p-4"><div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label={t("status")}><Button className="flex-1" onClick={() => setTab("active")} variant={tab === "active" ? "default" : "ghost"}>{t("active")}</Button><Button className="flex-1" onClick={() => setTab("archived")} variant={tab === "archived" ? "default" : "ghost"}>{t("archived")}</Button></div><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><Input aria-label={t("searchPlaceholder")} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchPlaceholder")} value={search} /><Select aria-label={t("currency")} onChange={(event) => setCurrency(event.target.value)} value={currency}><option value="all">{t("allCurrencies")}</option>{currencies.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}</Select><Select aria-label={t("sort")} onChange={(event) => setSort(event.target.value)} value={sort}><option value="name">{t("sortName")}</option><option value="debt">{t("sortDebt")}</option><option value="utilization">{t("sortUtilization")}</option><option value="payment">{t("sortPaymentDate")}</option></Select></div></div>{hasNoCards ? <div className="rounded-xl border border-dashed px-6 py-16 text-center"><h2 className="font-serif text-2xl">{tab === "active" ? t("emptyTitle") : t("emptyArchivedTitle")}</h2><p className="mx-auto mt-2 max-w-md text-muted-foreground">{tab === "active" ? t("emptyDescription") : t("emptyArchivedDescription")}</p>{tab === "active" ? <div className="mt-6"><CreateCreditCardDialog currencies={currencies} onSuccess={() => showFeedback("createSuccess")} /></div> : null}</div> : visible.length === 0 ? <div className="rounded-xl border border-dashed px-6 py-16 text-center"><h2 className="font-serif text-2xl">{t("noResultsTitle")}</h2><p className="mt-2 text-muted-foreground">{t("noResultsDescription")}</p><Button className="mt-5" onClick={clearFilters} variant="outline">{t("clearFilters")}</Button></div> : <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">{visible.map((card) => <CreditCardPanel card={card} currency={currencies.find((item) => item.code === card.account.currencyCode)} key={card.account.id} managementFeeCategoryId={managementFeeCategoryId} onAdjust={() => openDialog("adjust", card)} onArchive={() => openDialog("archive", card)} onEdit={() => openDialog("edit", card)} onSuccess={() => { setFeedback(tab === "archived" ? "restoreSuccess" : "updateSuccess"); }} />)}</div>}{dialog === "edit" ? <EditCreditCardDialog card={selected} currency={selected ? currencies.find((item) => item.code === selected.account.currencyCode) : undefined} key={selected?.account.id} onOpenChange={(open) => { if (!open) setDialog(null); }} onSuccess={() => showFeedback(selected?.configured ? "updateSuccess" : "updateSuccess")} open /> : null}{dialog === "adjust" ? <AdjustCardBalanceDialog card={selected} currency={selected ? currencies.find((item) => item.code === selected.account.currencyCode) : undefined} key={selected?.account.id} onOpenChange={(open) => { if (!open) setDialog(null); }} onSuccess={() => showFeedback("adjustSuccess")} open /> : null}{dialog === "archive" ? <ArchiveCreditCardDialog card={selected} key={selected?.account.id} onOpenChange={(open) => { if (!open) setDialog(null); }} onSuccess={() => showFeedback("archiveSuccess")} open /> : null}</section>;
}
