"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { deleteMovementAction, deleteTransferAction } from "../actions";
import { initialMovementActionState } from "../action-state";

export function DeleteMovementButton({ id, onSuccess }: { id: string; onSuccess: () => void }) {
  const t = useTranslations("movements");
  const [state, action, pending] = useActionState(deleteMovementAction, initialMovementActionState);
  useEffect(() => { if (state.status === "success") onSuccess(); }, [onSuccess, state.status]);
  return <form action={action} onSubmit={(event) => { if (!window.confirm(t("deleteConfirm"))) event.preventDefault(); }}><input name="movementId" type="hidden" value={id} /><Button aria-label={t("delete")} disabled={pending} type="submit" variant="ghost" size="sm">{t("delete")}</Button>{state.status === "error" ? <span className="text-xs text-destructive">{t(state.errorKey as never)}</span> : null}</form>;
}

export function DeleteTransferButton({ id, onSuccess }: { id: string; onSuccess: () => void }) {
  const t = useTranslations("movements");
  const [state, action, pending] = useActionState(deleteTransferAction, initialMovementActionState);
  useEffect(() => { if (state.status === "success") onSuccess(); }, [onSuccess, state.status]);
  return <form action={action} onSubmit={(event) => { if (!window.confirm(t("deleteTransferConfirm"))) event.preventDefault(); }}><input name="transferId" type="hidden" value={id} /><Button aria-label={t("deleteTransfer")} disabled={pending} type="submit" variant="ghost" size="sm">{t("delete")}</Button>{state.status === "error" ? <span className="text-xs text-destructive">{t(state.errorKey as never)}</span> : null}</form>;
}
