"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import type { Currency } from "../../../lib/api/accounts";
import { formatLocalDate } from "../../../lib/utils";
import { openAccountAction } from "../actions";
import { initialAccountActionState } from "../action-state";
import { useActionSuccess } from "./use-action-dialog";

function today() {
  return formatLocalDate(new Date());
}

function CreateAccountForm({
  currencies,
  onSuccess,
}: {
  currencies: Currency[];
  onSuccess: () => void;
}) {
  const t = useTranslations("accounts");
  const commonT = useTranslations("common");
  const [state, formAction, pending] = useActionState(
    openAccountAction,
    initialAccountActionState,
  );
  const [currencyCode, setCurrencyCode] = useState(currencies[0]?.code ?? "");
  const [amount, setAmount] = useState("");

  useActionSuccess(state.status, pending, onSuccess);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="account-name">{t("name")}</Label>
        <Input id="account-name" name="name" required maxLength={60} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="account-type">{t("type")}</Label>
          <Select defaultValue="bank" id="account-type" name="type">
            <option value="bank">{t("bank")}</option>
            <option value="cash">{t("cash")}</option>
            <option value="crypto">{t("crypto")}</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="account-currency">{t("currency")}</Label>
          <Select
            id="account-currency"
            name="currencyCode"
            onChange={(event) => {
              setCurrencyCode(event.target.value);
              setAmount("");
            }}
            required
            value={currencyCode}
          >
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} · {currency.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="account-institution">{t("institutionOptional")}</Label>
        <Input id="account-institution" maxLength={60} name="institution" />
      </div>
      <div className="space-y-3 border-t pt-4">
        <div>
          <h3 className="text-sm font-medium">{t("openingBalance")}</h3>
          <p className="text-sm text-muted-foreground">{t("openingBalanceHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="opening-balance">{t("amount")}</Label>
          <Input
            id="opening-balance"
            inputMode="decimal"
            name="openingBalanceAmount"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0"
            value={amount}
          />
          {state.status === "error" && state.fieldErrors?.openingBalanceAmount ? (
            <p className="text-sm text-destructive">{t("errorInvalidAmount")}</p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="opening-direction">{t("balanceNature")}</Label>
            <Select defaultValue="in" id="opening-direction" name="openingBalanceDirection">
              <option value="in">{t("positiveBalance")}</option>
              <option value="out">{t("negativeBalance")}</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="opening-date">{t("date")}</Label>
            <Input defaultValue={today()} id="opening-date" name="occurredAt" required type="date" />
          </div>
        </div>
      </div>
      {state.status === "error" ? (
        <p aria-live="polite" className="text-sm text-destructive" role="alert">
          {t(state.errorKey as never)}
        </p>
      ) : null}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          {commonT("cancel")}
        </DialogClose>
        <Button disabled={pending} type="submit">
          {pending ? t("saving") : t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateAccountDialog({ currencies, onSuccess }: { currencies: Currency[]; onSuccess?: () => void }) {
  const t = useTranslations("accounts");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  function handleSuccess() {
    setOpen(false);
    setFormKey((key) => key + 1);
    router.refresh();
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} size="lg">
        <Plus />
        {t("create")}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDescription")}</DialogDescription>
        </DialogHeader>
        <CreateAccountForm currencies={currencies} key={formKey} onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  );
}
