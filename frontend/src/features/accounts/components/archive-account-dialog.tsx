"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../../components/ui/alert-dialog";
import { formatMoney } from "../../../lib/money";
import type { AccountViewModel } from "../queries";
import { archiveAccountAction } from "../actions";
import { initialAccountActionState } from "../action-state";
import { useCloseOnActionSuccess } from "./use-action-dialog";

export function ArchiveAccountDialog({ account, open, onOpenChange, onSuccess }: { account: AccountViewModel | null; open: boolean; onOpenChange: (open: boolean) => void; onSuccess?: () => void }) {
  const t = useTranslations("accounts");
  const commonT = useTranslations("common");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(archiveAccountAction, initialAccountActionState);
  useCloseOnActionSuccess(state.status, pending, onOpenChange, onSuccess);
  if (!account) return null;
  const canArchive = account.balance === 0;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("archiveTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("archiveDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm">{account.name} · {formatMoney(account.balance, account.currency, locale)}</p>
        {!canArchive ? <p className="text-sm text-destructive">{t("archiveRequiresZero")}</p> : null}
        {state.status === "error" ? <p aria-live="polite" className="text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}
        <form action={formAction}>
          <input name="accountId" type="hidden" value={account.id} />
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button type="button" variant="outline" />}>{commonT("cancel")}</AlertDialogCancel>
            <Button disabled={!canArchive || pending} type="submit" variant="destructive">{pending ? t("saving") : t("archive")}</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
