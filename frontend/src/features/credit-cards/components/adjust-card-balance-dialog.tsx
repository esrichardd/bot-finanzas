"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import type { Currency } from "../../../lib/api/accounts";
import type { CreditCard } from "../../../lib/api/credit-cards";
import { formatMoney } from "../../../lib/money";
import { formatLocalDate } from "../../../lib/utils";
import { adjustCreditCardBalanceAction } from "../actions";
import { initialCreditCardActionState } from "../action-state";
import { useCreditCardActionSuccess } from "./use-action-dialog";

export function AdjustCardBalanceDialog({ card, currency, open, onOpenChange, onSuccess }: { card: CreditCard | null; currency: Currency | undefined; open: boolean; onOpenChange: (open: boolean) => void; onSuccess: () => void }) {
  const t = useTranslations("creditCards");
  const commonT = useTranslations("common");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(adjustCreditCardBalanceAction, initialCreditCardActionState);
  const [target, setTarget] = useState<"out" | "zero" | "in">("out");
  useCreditCardActionSuccess(state, pending, () => { onOpenChange(false); onSuccess(); });
  if (!card || !currency) return null;
  const balanceLabel = card.configured ? (card.balance < 0 ? `${t("debt")}: ${formatMoney(card.debt, currency, locale)}` : card.balance > 0 ? `${t("creditBalance")}: ${formatMoney(card.creditBalance, currency, locale)}` : t("noDebt")) : formatMoney(card.balance, currency, locale);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{t("adjustTitle")}</DialogTitle><DialogDescription>{balanceLabel}</DialogDescription></DialogHeader><form action={formAction} className="space-y-4"><input name="accountId" type="hidden" value={card.account.id} /><input name="currencyCode" type="hidden" value={currency.code} /><div className="space-y-2"><Label htmlFor="adjust-target">{t("targetState")}</Label><Select id="adjust-target" name="targetBalanceDirection" onChange={(event) => setTarget(event.target.value as typeof target)} value={target}><option value="out">{t("targetDebt")}</option><option value="zero">{t("noDebtOption")}</option><option value="in">{t("creditBalanceOption")}</option></Select></div><div className="space-y-2"><Label htmlFor="adjust-amount">{t("amount")}</Label><Input disabled={target === "zero"} id="adjust-amount" inputMode="decimal" name="targetBalanceAmount" placeholder="0" required={target !== "zero"} /></div><div className="space-y-2"><Label htmlFor="adjust-date">{t("date")}</Label><Input defaultValue={formatLocalDate(new Date())} id="adjust-date" name="occurredAt" required type="date" /></div>{state.status === "error" ? <p aria-live="polite" className="text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>{commonT("cancel")}</DialogClose><Button disabled={pending} type="submit">{pending ? t("saving") : commonT("save")}</Button></DialogFooter></form></DialogContent></Dialog>;
}
