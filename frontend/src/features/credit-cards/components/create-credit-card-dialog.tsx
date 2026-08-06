"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import { Button } from "../../../components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import type { Currency } from "../../../lib/api/accounts";
import { formatLocalDate } from "../../../lib/utils";
import { openCreditCardAction } from "../actions";
import { initialCreditCardActionState } from "../action-state";
import { useCreditCardActionSuccess } from "./use-action-dialog";

export function CreateCreditCardDialog({ currencies, onSuccess }: { currencies: Currency[]; onSuccess: () => void }) {
  const t = useTranslations("creditCards");
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  function handleSuccess() {
    setOpen(false);
    setFormKey((value) => value + 1);
    onSuccess();
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button onClick={() => setOpen(true)} size="lg"><Plus />{t("create")}</Button>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{t("createTitle")}</DialogTitle><DialogDescription>{t("createDescription")}</DialogDescription></DialogHeader>
      <CreateCreditCardForm currencies={currencies} key={formKey} onSuccess={handleSuccess} />
    </DialogContent>
  </Dialog>;
}

function CreateCreditCardForm({ currencies, onSuccess }: { currencies: Currency[]; onSuccess: () => void }) {
  const t = useTranslations("creditCards");
  const commonT = useTranslations("common");
  const [state, formAction, pending] = useActionState(openCreditCardAction, initialCreditCardActionState);
  const [currencyCode, setCurrencyCode] = useState(currencies[0]?.code ?? "");
  useCreditCardActionSuccess(state, pending, onSuccess);
  return <form action={formAction} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="card-name">{t("name")}</Label><Input id="card-name" maxLength={60} name="name" required /></div>
      <div className="space-y-2"><Label htmlFor="card-institution">{t("institutionOptional")}</Label><Input id="card-institution" maxLength={60} name="institution" /></div>
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2"><Label htmlFor="card-currency">{t("currency")}</Label><Select id="card-currency" name="currencyCode" onChange={(event) => setCurrencyCode(event.target.value)} required value={currencyCode}>{currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name}</option>)}</Select></div>
      <div className="space-y-2"><Label htmlFor="card-limit">{t("creditLimit")}</Label><Input id="card-limit" inputMode="decimal" name="creditLimit" placeholder="0" required /></div>
      <div className="space-y-2"><Label htmlFor="card-fee">{t("managementFeeOptional")}</Label><Input id="card-fee" inputMode="decimal" name="managementFee" placeholder="0" /></div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="card-cut">{t("cutDay")}</Label><Input id="card-cut" max={31} min={1} name="cutDay" required type="number" /></div>
      <div className="space-y-2"><Label htmlFor="card-due">{t("paymentDueDay")}</Label><Input id="card-due" max={31} min={1} name="paymentDueDay" required type="number" /></div>
    </div>
    <div className="space-y-3 border-t pt-4">
      <div><h3 className="text-sm font-medium">{t("openingDebt")}</h3><p className="text-sm text-muted-foreground">{t("openingDebtHint")}</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="card-opening-debt">{t("amount")}</Label><Input id="card-opening-debt" inputMode="decimal" name="openingDebt" placeholder="0" /></div><div className="space-y-2"><Label htmlFor="card-opening-date">{t("date")}</Label><Input defaultValue={formatLocalDate(new Date())} id="card-opening-date" name="openingDebtDate" type="date" /></div></div>
    </div>
    <p className="text-xs text-muted-foreground">{t("managementFeeDisclaimer")}</p>
    {state.status === "error" ? <p aria-live="polite" className="text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}
    <DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>{commonT("cancel")}</DialogClose><Button disabled={pending} type="submit">{pending ? t("saving") : t("create")}</Button></DialogFooter>
  </form>;
}
