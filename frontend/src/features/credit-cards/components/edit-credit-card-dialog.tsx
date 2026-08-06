"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import type { Currency } from "../../../lib/api/accounts";
import type { ConfiguredCreditCard, CreditCard } from "../../../lib/api/credit-cards";
import { formatMoneyInput } from "../../../lib/money";
import { updateCreditCardAction } from "../actions";
import { initialCreditCardActionState } from "../action-state";
import { useCreditCardActionSuccess } from "./use-action-dialog";

export function EditCreditCardDialog({ card, currency, open, onOpenChange, onSuccess }: { card: CreditCard | null; currency: Currency | undefined; open: boolean; onOpenChange: (open: boolean) => void; onSuccess: () => void }) {
  const t = useTranslations("creditCards");
  const commonT = useTranslations("common");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(updateCreditCardAction, initialCreditCardActionState);
  useCreditCardActionSuccess(state, pending, () => { onOpenChange(false); onSuccess(); });
  if (!card || !currency) return null;
  const configured = card.configured ? card : null;
  const initial = configured as ConfiguredCreditCard | null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{card.configured ? t("editTitle") : t("completeSetup")}</DialogTitle><DialogDescription>{card.configured ? t("editDescription") : t("incompleteDescription")}</DialogDescription></DialogHeader><form action={formAction} className="space-y-4"><input name="accountId" type="hidden" value={card.account.id} /><input name="currencyCode" type="hidden" value={card.account.currencyCode} /><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="edit-card-name">{t("name")}</Label><Input defaultValue={card.account.name} id="edit-card-name" maxLength={60} name="name" required /></div><div className="space-y-2"><Label htmlFor="edit-card-institution">{t("institutionOptional")}</Label><Input defaultValue={card.account.institution ?? ""} id="edit-card-institution" maxLength={60} name="institution" /></div></div><div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="edit-card-currency">{t("currency")}</Label><Input disabled id="edit-card-currency" value={card.account.currencyCode} readOnly /></div><div className="space-y-2"><Label htmlFor="edit-card-limit">{t("creditLimit")}</Label><Input defaultValue={initial ? formatMoneyInput(initial.creditLimit, currency, locale) : ""} id="edit-card-limit" inputMode="decimal" name="creditLimit" required /></div><div className="space-y-2"><Label htmlFor="edit-card-fee">{t("managementFeeOptional")}</Label><Input defaultValue={initial?.managementFee ? formatMoneyInput(initial.managementFee, currency, locale) : ""} id="edit-card-fee" inputMode="decimal" name="managementFee" /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="edit-card-cut">{t("cutDay")}</Label><Input defaultValue={initial?.cutDay ?? 1} id="edit-card-cut" max={31} min={1} name="cutDay" required type="number" /></div><div className="space-y-2"><Label htmlFor="edit-card-due">{t("paymentDueDay")}</Label><Input defaultValue={initial?.paymentDueDay ?? 1} id="edit-card-due" max={31} min={1} name="paymentDueDay" required type="number" /></div></div>{initial && Number.isFinite(initial.debt) ? <p className="text-sm text-muted-foreground">{t("lowerLimitWarning")}</p> : null}{state.status === "error" ? <p aria-live="polite" className="text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>{commonT("cancel")}</DialogClose><Button disabled={pending} type="submit">{pending ? t("saving") : commonT("save")}</Button></DialogFooter></form></DialogContent></Dialog>;
}
