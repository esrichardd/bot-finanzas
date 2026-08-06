"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import type { CreditCard } from "../../../lib/api/credit-cards";
import { archiveCreditCardAction } from "../actions";
import { initialCreditCardActionState } from "../action-state";
import { useCreditCardActionSuccess } from "./use-action-dialog";

export function ArchiveCreditCardDialog({ card, open, onOpenChange, onSuccess }: { card: CreditCard | null; open: boolean; onOpenChange: (open: boolean) => void; onSuccess: () => void }) {
  const t = useTranslations("creditCards");
  const commonT = useTranslations("common");
  const [state, formAction, pending] = useActionState(archiveCreditCardAction, initialCreditCardActionState);
  useCreditCardActionSuccess(state, pending, () => { onOpenChange(false); onSuccess(); });
  if (!card) return null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{t("archiveTitle")}</DialogTitle><DialogDescription>{card.balance === 0 ? t("archiveDescription") : card.balance < 0 ? t("archiveDebtBlocked") : t("archiveCreditBlocked")}</DialogDescription></DialogHeader><form action={formAction}><input name="accountId" type="hidden" value={card.account.id} />{state.status === "error" ? <p aria-live="polite" className="mb-4 text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>{commonT("cancel")}</DialogClose><Button disabled={pending || card.balance !== 0} type="submit" variant="destructive">{pending ? t("saving") : t("archive")}</Button></DialogFooter></form></DialogContent></Dialog>;
}
