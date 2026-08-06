"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MoreHorizontal, RotateCcw, Settings2 } from "lucide-react";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";
import type { Currency } from "../../../lib/api/accounts";
import type { CreditCard } from "../../../lib/api/credit-cards";
import { formatMoney } from "../../../lib/money";
import { restoreCreditCardAction } from "../actions";
import { initialCreditCardActionState } from "../action-state";

function movementHref(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(key, String(value));
  return `/movements?${query.toString()}`;
}

function dateLabel(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function RestoreButton({ card, onSuccess }: { card: CreditCard; onSuccess: () => void }) {
  const t = useTranslations("creditCards");
  const [state, formAction, pending] = useActionState(restoreCreditCardAction, initialCreditCardActionState);
  useEffect(() => { if (state.status === "success") onSuccess(); }, [onSuccess, state.status]);
  return <form action={formAction}><input name="accountId" type="hidden" value={card.account.id} /><Button disabled={pending} size="sm" type="submit" variant="outline"><RotateCcw />{pending ? t("saving") : t("restore")}</Button>{state.status === "error" ? <p aria-live="polite" className="mt-2 text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}</form>;
}

export function CreditCardPanel({ card, currency, managementFeeCategoryId, onEdit, onAdjust, onArchive, onSuccess }: { card: CreditCard; currency: Currency | undefined; managementFeeCategoryId?: string; onEdit: () => void; onAdjust: () => void; onArchive: () => void; onSuccess: () => void }) {
  const t = useTranslations("creditCards");
  const locale = useLocale();
  if (!currency) return null;
  const account = card.account;
  const archived = account.archived;
  const configured = card.configured;
  const historyHref = movementHref({ accountId: account.id });
  const purchaseHref = movementHref({ create: "expense", accountId: account.id });
  const paymentHref = movementHref({ create: "transfer", toAccountId: account.id });
  const advanceHref = movementHref({ create: "transfer", fromAccountId: account.id });
  const feeHref = movementHref({ create: "expense", accountId: account.id, amountMinor: configured && card.managementFee ? card.managementFee : undefined, categoryId: managementFeeCategoryId, description: t("managementFeeDescription") });
  const utilization = configured ? card.utilizationPercentage : 0;
  const utilizationText = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(utilization);
  return <article className="flex min-h-[20rem] flex-col rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
    <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-serif text-2xl font-normal">{account.name}</h2>{!configured ? <Badge className="border-destructive/30 bg-destructive/10 text-destructive">{t("incompleteTitle")}</Badge> : null}</div><p className="truncate text-sm text-muted-foreground">{account.institution || t("noInstitution")} · {account.currencyCode}</p></div><DropdownMenu><DropdownMenuTrigger render={<Button aria-label={t("actionsFor", { name: account.name })} size="icon" variant="ghost" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end">{archived ? <DropdownMenuItem onClick={() => window.location.assign(historyHref)}>{t("history")}</DropdownMenuItem> : <><DropdownMenuItem onClick={onEdit}><Settings2 />{configured ? t("edit") : t("completeSetup")}</DropdownMenuItem><DropdownMenuItem onClick={onAdjust}>{t("adjust")}</DropdownMenuItem><DropdownMenuItem onClick={onArchive} variant="destructive">{t("archive")}</DropdownMenuItem></>}{!archived && configured ? <><DropdownMenuItem onClick={() => window.location.assign(advanceHref)}>{t("cashAdvance")}</DropdownMenuItem><DropdownMenuItem onClick={() => window.location.assign(feeHref)}>{t("registerManagementFee")}</DropdownMenuItem></> : null}</DropdownMenuContent></DropdownMenu></div>
    {!configured ? <div className="mt-8 rounded-xl border border-dashed bg-muted/20 p-4"><p className="font-medium">{t("incompleteDescription")}</p><p className="mt-1 text-sm text-muted-foreground">{t("incompleteActions")}</p></div> : <><div className="mt-7"><p className="text-sm text-muted-foreground">{card.balance > 0 ? t("creditBalance") : t("debt")}</p><p className={`mt-1 font-serif text-4xl font-normal tabular-nums ${card.balance > 0 ? "text-primary" : card.balance === 0 ? "text-muted-foreground" : "text-destructive"}`}>{formatMoney(card.balance > 0 ? card.creditBalance : card.debt, currency, locale)}</p></div><div className="mt-6 grid grid-cols-2 gap-4 text-sm"><div><p className="text-muted-foreground">{t("availableCredit")}</p><p className="mt-1 font-medium tabular-nums">{formatMoney(card.availableCredit, currency, locale)}</p></div><div><p className="text-muted-foreground">{t("utilization")}</p><p className="mt-1 font-medium tabular-nums">{utilizationText}%</p></div></div><div aria-label={t("utilizationLabel", { value: utilizationText })} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.min(100, Math.max(0, utilization))} className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(100, Math.max(0, utilization))}%` }} /></div><div className="mt-6 grid grid-cols-2 gap-4 text-sm"><div><p className="text-muted-foreground">{t("nextCutDate")}</p><p className="mt-1">{dateLabel(card.nextCutDate, locale)}</p></div><div><p className="text-muted-foreground">{t("nextPaymentDueDate")}</p><p className="mt-1">{dateLabel(card.nextPaymentDueDate, locale)}</p></div></div><div className="mt-4 text-sm"><span className="text-muted-foreground">{t("managementFee")}: </span>{card.managementFee ? formatMoney(card.managementFee, currency, locale) : t("noManagementFee")}</div></>}
    <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">{archived ? <><Link href={historyHref}><Button size="sm" variant="outline">{t("history")}</Button></Link><RestoreButton card={card} onSuccess={onSuccess} /></> : configured ? <><Link href={purchaseHref}><Button size="sm">{t("purchase")}</Button></Link><Link href={paymentHref}><Button size="sm" variant="outline">{t("pay")}</Button></Link><Link className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline" href={historyHref}>{t("history")}</Link></> : <><Button onClick={onEdit} size="sm"><Settings2 />{t("completeSetup")}</Button><Link className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline" href={historyHref}>{t("history")}</Link></>}</div>
  </article>;
}
