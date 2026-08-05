"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import { formatMoney } from "../../../lib/money";
import { formatLocalDate } from "../../../lib/utils";
import type { AccountViewModel } from "../queries";
import { adjustBalanceAction } from "../actions";
import { initialAccountActionState } from "../action-state";
import { useCloseOnActionSuccess } from "./use-action-dialog";

export function AdjustBalanceDialog({ account, open, onOpenChange, onSuccess }: { account: AccountViewModel | null; open: boolean; onOpenChange: (open: boolean) => void; onSuccess?: () => void }) {
  const t = useTranslations("accounts");
  const commonT = useTranslations("common");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(adjustBalanceAction, initialAccountActionState);
  const [amount, setAmount] = useState("");
  useCloseOnActionSuccess(state.status, pending, onOpenChange, onSuccess);
  if (!account) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adjustTitle")}</DialogTitle>
          <DialogDescription>{t("adjustHint")}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input name="accountId" type="hidden" value={account.id} />
          <input name="currencyCode" type="hidden" value={account.currency.code} />
          <p className="text-sm text-muted-foreground">{t("currentBalance")}: {formatMoney(account.balance, account.currency, locale)}</p>
          <div className="space-y-2">
            <Label htmlFor="target-balance">{t("targetBalance")}</Label>
            <Input id="target-balance" inputMode="decimal" name="targetBalanceAmount" onChange={(event) => setAmount(event.target.value)} required value={amount} />
            {state.status === "error" && state.fieldErrors?.targetBalanceAmount ? <p className="text-sm text-destructive">{t(state.errorKey as never)}</p> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="target-direction">{t("balanceNature")}</Label>
              <Select defaultValue="in" id="target-direction" name="targetBalanceDirection">
                <option value="in">{t("positiveBalance")}</option>
                <option value="out">{t("negativeBalance")}</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-date">{t("date")}</Label>
              <Input defaultValue={formatLocalDate(new Date())} id="adjust-date" name="occurredAt" required type="date" />
            </div>
          </div>
          {state.status === "error" && !state.fieldErrors ? <p aria-live="polite" className="text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{commonT("cancel")}</DialogClose>
            <Button disabled={pending} type="submit">{pending ? t("saving") : t("adjust")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
