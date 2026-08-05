"use client";

import { useActionState, useState } from "react";
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
import type { AccountViewModel } from "../queries";
import { updateAccountAction } from "../actions";
import { initialAccountActionState } from "../action-state";
import { useCloseOnActionSuccess } from "./use-action-dialog";

export function EditAccountDialog({
  account,
  open,
  onOpenChange,
  onSuccess,
}: {
  account: AccountViewModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const t = useTranslations("accounts");
  const commonT = useTranslations("common");
  const [state, formAction, pending] = useActionState(updateAccountAction, initialAccountActionState);
  const [name, setName] = useState(account?.name ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");

  useCloseOnActionSuccess(state.status, pending, onOpenChange, onSuccess);

  if (!account) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>{t("immutableFieldsHint")}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input name="accountId" type="hidden" value={account.id} />
          <div className="space-y-2">
            <Label htmlFor="edit-account-name">{t("name")}</Label>
            <Input id="edit-account-name" maxLength={60} name="name" onChange={(event) => setName(event.target.value)} required value={name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-account-institution">{t("institutionOptional")}</Label>
            <Input id="edit-account-institution" maxLength={60} name="institution" onChange={(event) => setInstitution(event.target.value)} value={institution} />
          </div>
          <p className="text-sm text-muted-foreground">{t(account.type as never)} · {account.currencyCode}</p>
          {state.status === "error" ? <p aria-live="polite" className="text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{commonT("cancel")}</DialogClose>
            <Button disabled={pending} type="submit">{pending ? t("saving") : commonT("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
