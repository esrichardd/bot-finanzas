"use client";

import { MoreHorizontal } from "lucide-react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";
import type { AccountViewModel } from "../queries";
import { restoreAccountAction } from "../actions";
import { initialAccountActionState } from "../action-state";

export function AccountRowActions({ account, archived, onEdit, onAdjust, onArchive }: { account: AccountViewModel; archived: boolean; onEdit: () => void; onAdjust: () => void; onArchive: () => void }) {
  const t = useTranslations("accounts");
  const [state, restoreAction, pending] = useActionState(restoreAccountAction, initialAccountActionState);
  if (archived) {
    return <form action={restoreAction}><input name="accountId" type="hidden" value={account.id} /><Button aria-label={t("restore")} disabled={pending} size="sm" type="submit" variant="outline">{pending ? t("saving") : t("restore")}</Button>{state.status === "error" ? <p aria-live="polite" className="mt-2 text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}</form>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button aria-label={t("actionsFor", { name: account.name })} size="icon" variant="ghost" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>{t("edit")}</DropdownMenuItem>
        <DropdownMenuItem onClick={onAdjust}>{t("adjust")}</DropdownMenuItem>
        <DropdownMenuItem onClick={onArchive} variant="destructive">{t("archive")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
