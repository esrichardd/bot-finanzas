"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button, buttonVariants } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import type { Account, Currency } from "../../../lib/api/accounts";
import type { Category } from "../../../lib/api/categories";
import type { LedgerEntry, LedgerMovementEntry } from "../../../lib/api/movements";
import { formatMoney } from "../../../lib/money";
import type { MovementCreatePrefill, MovementsPageData, MovementsPageQuery } from "../queries";
import { DeleteMovementButton, DeleteTransferButton } from "./delete-actions";
import { EditMovementDialog } from "./edit-movement-dialog";
import { MovementEntryDialog } from "./movement-entry-dialog";

function dateLabel(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function categoryName(categoryId: string | null, categories: Category[], noneLabel: string) {
  if (!categoryId) return noneLabel;
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return noneLabel;
  const parent = category.parentId ? categories.find((item) => item.id === category.parentId) : undefined;
  return `${category.emoji ?? parent?.emoji ?? ""} ${parent ? `${parent.name} / ` : ""}${category.name}`;
}

function accountName(accountId: string, accounts: Account[]) {
  return accounts.find((account) => account.id === accountId)?.name ?? "—";
}

function currencyFor(accountId: string, accounts: Account[], currencies: Currency[]) {
  const account = accounts.find((item) => item.id === accountId);
  return currencies.find((currency) => currency.code === account?.currencyCode) ?? { code: account?.currencyCode ?? "", decimals: 0 };
}

function movementLabel(item: LedgerMovementEntry, t: (key: never) => string) {
  if (item.movementType === "income") return { label: t("income" as never), sign: "+", tone: "text-primary" };
  if (item.movementType === "expense") return { label: t("expense" as never), sign: "−", tone: "text-destructive" };
  return { label: t("adjustment" as never), sign: item.movementType === "adjustment_in" ? "+" : "−", tone: "text-muted-foreground" };
}

function PaginationLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
  const className = buttonVariants({
    variant: "outline",
    className: disabled ? "pointer-events-none opacity-50" : undefined,
  });
  return disabled
    ? <span aria-disabled="true" className={className}>{children}</span>
    : <Link className={className} href={href}>{children}</Link>;
}

function LedgerRow({ item, data, onEdit, onRefresh }: { item: LedgerEntry; data: MovementsPageData; onEdit: (item: LedgerMovementEntry) => void; onRefresh: () => void }) {
  const t = useTranslations("movements");
  const locale = useLocale();
  if (item.entryKind === "movement") {
    const movement = movementLabel(item, t);
    return <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex min-w-0 items-start gap-3"><span aria-hidden className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg ${movement.tone}`}>{movement.sign}</span><div className="min-w-0"><p className="truncate font-medium">{item.description || movement.label}</p><p className="truncate text-sm text-muted-foreground">{movement.label} · {accountName(item.accountId, data.accounts)} · {categoryName(item.categoryId, data.categories, t("noCategory"))}</p></div></div><div className="flex items-center justify-between gap-3 sm:justify-end"><span className={`font-medium tabular-nums ${movement.tone}`}>{movement.sign}{formatMoney(item.amount, currencyFor(item.accountId, data.accounts, data.currencies), locale)}</span>{item.source === "manual" && (item.movementType === "income" || item.movementType === "expense") ? <div className="flex items-center"><Button onClick={() => onEdit(item)} size="sm" variant="ghost">{t("edit")}</Button><DeleteMovementButton id={item.id} onSuccess={onRefresh} /></div> : <span className="text-xs text-muted-foreground">{t("readOnly")}</span>}</div></div>;
  }
  const fromCurrency = currencyFor(item.fromAccountId, data.accounts, data.currencies);
  const toCurrency = currencyFor(item.toAccountId, data.accounts, data.currencies);
  return <details className="group px-4 py-4 sm:px-6"><summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="flex min-w-0 items-start gap-3"><span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">↔</span><span className="min-w-0"><span className="block truncate font-medium">{item.description || t("transfer")}</span><span className="block truncate text-sm text-muted-foreground">{accountName(item.fromAccountId, data.accounts)} → {accountName(item.toAccountId, data.accounts)}</span></span></span><span className="flex items-center justify-between gap-3 sm:justify-end"><span className="font-medium tabular-nums">{formatMoney(item.sourceTotalDebit, fromCurrency, locale)}</span><span className="text-sm text-muted-foreground">{t("details")}</span></span></summary><div className="mt-4 grid gap-3 rounded-lg bg-muted/30 p-4 text-sm sm:grid-cols-2"><div><p className="text-muted-foreground">{t("principal")}</p><p>{formatMoney(item.principalFrom, fromCurrency, locale)}</p></div><div><p className="text-muted-foreground">{t("grossDestination")}</p><p>{formatMoney(item.grossDestination, toCurrency, locale)}</p></div><div><p className="text-muted-foreground">{t("sourceTotalDebit")}</p><p>{formatMoney(item.sourceTotalDebit, fromCurrency, locale)}</p></div><div><p className="text-muted-foreground">{t("destinationNetCredit")}</p><p>{formatMoney(item.destinationNetCredit, toCurrency, locale)}</p></div>{item.fees.length > 0 ? <div className="sm:col-span-2"><p className="mb-2 text-muted-foreground">{t("fees")}</p><ul className="space-y-1">{item.fees.map((fee) => <li className="flex justify-between gap-3" key={fee.movementId}><span>{fee.description || t("fee")}{" · "}{fee.side === "source" ? t("source") : t("destination")}</span><span className="tabular-nums">{formatMoney(fee.amount, currencyFor(fee.accountId, data.accounts, data.currencies), locale)}</span></li>)}</ul></div> : null}<div className="flex justify-end sm:col-span-2"><DeleteTransferButton id={item.id} onSuccess={onRefresh} /></div></div></details>;
}

export function MovementsScreen({ data, initialCreate, query, subtitle, title }: { data: MovementsPageData; initialCreate?: MovementCreatePrefill; query: MovementsPageQuery; subtitle: string; title: string }) {
  const t = useTranslations("movements");
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);
  const consumedPrefill = useRef<string | null>(null);
  const [selected, setSelected] = useState<LedgerMovementEntry | null>(null);
  const locale = useLocale();
  const groups = useMemo(() => {
    const grouped = new Map<string, LedgerEntry[]>();
    for (const item of data.ledger.items) grouped.set(item.occurredAt, [...(grouped.get(item.occurredAt) ?? []), item]);
    return [...grouped.entries()];
  }, [data.ledger.items]);
  const refresh = useCallback(() => router.refresh(), [router]);
  const prefillKey = initialCreate ? JSON.stringify(initialCreate) : null;
  useEffect(() => {
    if (!initialCreate || consumedPrefill.current === prefillKey) return;
    consumedPrefill.current = prefillKey;
    setNewOpen(true);
    router.replace("/movements");
  }, [initialCreate, prefillKey, router]);
  const closeEdit = useCallback((open: boolean) => {
    if (!open) setSelected(null);
  }, []);
  function hrefFor(offset: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, offset })) if (value !== undefined && value !== "") params.set(key, String(value));
    return `/movements?${params.toString()}`;
  }
  const hasNext = data.ledger.offset + data.ledger.items.length < data.ledger.total;
  const hasPrevious = data.ledger.offset > 0;
  return <section className="mx-auto max-w-6xl space-y-7 py-4 md:py-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="space-y-2"><p className="text-sm text-muted-foreground">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-normal tracking-tight md:text-5xl">{title}</h1><p className="max-w-xl text-muted-foreground">{subtitle}</p></div><Button className="w-full sm:w-auto" onClick={() => setNewOpen(true)} size="lg"><span aria-hidden>＋</span>{t("new")}</Button></div><form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" method="get"><Input aria-label={t("search")} defaultValue={query.q ?? ""} name="q" placeholder={t("searchPlaceholder")} /><Select aria-label={t("kind")} defaultValue={query.kind ?? "all"} name="kind"><option value="all">{t("all")}</option><option value="income">{t("income")}</option><option value="expense">{t("expense")}</option><option value="transfer">{t("transfer")}</option><option value="adjustment">{t("adjustment")}</option></Select><Select aria-label={t("account")} defaultValue={query.accountId ?? ""} name="accountId"><option value="">{t("allAccounts")}</option>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}{account.archived ? ` · ${t("archived")}` : ""}</option>)}</Select><Select aria-label={t("category")} defaultValue={query.categoryId ?? ""} name="categoryId"><option value="">{t("allCategories")}</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.archived ? ` · ${t("archived")}` : ""}</option>)}</Select><div className="grid gap-3 sm:col-span-2 lg:col-span-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"><Input aria-label={t("from")} defaultValue={query.from ?? ""} name="from" type="date" /><Input aria-label={t("to")} defaultValue={query.to ?? ""} name="to" type="date" /><Button type="submit">{t("applyFilters")}</Button></div></form>{data.ledger.total === 0 ? <div className="rounded-xl border border-dashed px-6 py-16 text-center"><h2 className="font-serif text-2xl">{t("emptyTitle")}</h2><p className="mx-auto mt-2 max-w-md text-muted-foreground">{t("emptyDescription")}</p><Button className="mt-6" onClick={() => setNewOpen(true)}>{t("new")}</Button></div> : <div className="overflow-hidden rounded-xl border bg-card">{groups.map(([date, items]) => <section key={date}><div className="border-b bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground sm:px-6">{dateLabel(date, locale)}</div><div className="divide-y">{items.map((item) => <LedgerRow data={data} item={item} key={item.id} onEdit={setSelected} onRefresh={refresh} />)}</div></section>)}</div>}{data.ledger.total > 0 ? <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{t("paginationSummary", { from: data.ledger.offset + 1, to: Math.min(data.ledger.offset + data.ledger.items.length, data.ledger.total), total: data.ledger.total })}</span><div className="flex gap-2"><PaginationLink disabled={!hasPrevious} href={hrefFor(Math.max(0, data.ledger.offset - data.ledger.limit))}>{t("previous")}</PaginationLink><PaginationLink disabled={!hasNext} href={hrefFor(data.ledger.offset + data.ledger.limit)}>{t("next")}</PaginationLink></div></div> : null}<MovementEntryDialog accounts={data.accounts} activeAccounts={data.activeAccounts} activeCategories={data.activeCategories} currencies={data.currencies} initialPrefill={initialCreate} onOpenChange={setNewOpen} onSuccess={refresh} open={newOpen} /><EditMovementDialog account={data.accounts.find((account) => account.id === selected?.accountId)} categories={data.categories} currency={data.currencies.find((currency) => currency.code === data.accounts.find((account) => account.id === selected?.accountId)?.currencyCode)} movement={selected} onOpenChange={closeEdit} onSuccess={refresh} open={selected !== null} /></section>;
}
