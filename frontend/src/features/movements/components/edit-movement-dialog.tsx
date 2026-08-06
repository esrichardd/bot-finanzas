"use client";

import { useActionState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import type { Account, Currency } from "../../../lib/api/accounts";
import type { Category } from "../../../lib/api/categories";
import type { LedgerMovementEntry } from "../../../lib/api/movements";
import { formatMoney, formatMoneyInput } from "../../../lib/money";
import { updateMovementAction } from "../actions";
import { initialMovementActionState } from "../action-state";

function CategoryOptions({ categories, noneLabel }: { categories: Category[]; noneLabel: string }) {
  return <>
    <option value="">{noneLabel}</option>
    {categories.filter((category) => category.parentId === null).map((root) => <optgroup key={root.id} label={`${root.emoji ?? ""} ${root.name}`}><option value={root.id}>{root.emoji ?? ""} {root.name}</option>{categories.filter((category) => category.parentId === root.id).map((child) => <option key={child.id} value={child.id}>{child.emoji ?? root.emoji ?? ""} {root.name} / {child.name}</option>)}</optgroup>)}
  </>;
}

export function EditMovementDialog({ movement, account, categories, currency, onOpenChange, onSuccess, open }: { movement: LedgerMovementEntry | null; account: Account | undefined; categories: Category[]; currency: Currency | undefined; onOpenChange: (open: boolean) => void; onSuccess: () => void; open: boolean }) {
  const t = useTranslations("movements");
  const locale = useLocale();
  const [state, action, pending] = useActionState(updateMovementAction, initialMovementActionState);
  useEffect(() => { if (state.status === "success") { onSuccess(); onOpenChange(false); } }, [onOpenChange, onSuccess, state.status]);
  if (!movement || !account) return null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{t("editTitle")}</DialogTitle><DialogDescription>{t("editDescription")}</DialogDescription></DialogHeader><form action={action} className="space-y-4"><input name="movementId" type="hidden" value={movement.id} /><input name="accountId" type="hidden" value={movement.accountId} /><div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{account.name} · {formatMoney(movement.amount, currency ?? { code: account.currencyCode, decimals: 0 }, locale)}</div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="edit-amount">{t("amount")}</Label><Input id="edit-amount" name="amount" defaultValue={formatMoneyInput(movement.amount, currency ?? { code: account.currencyCode, decimals: 0 }, locale)} inputMode="decimal" required /></div><div className="space-y-2"><Label htmlFor="edit-date">{t("date")}</Label><Input id="edit-date" name="occurredAt" type="date" defaultValue={movement.occurredAt} required /></div></div><div className="space-y-2"><Label htmlFor="edit-category">{t("category")}</Label><Select id="edit-category" name="categoryId" defaultValue={movement.categoryId ?? ""}><CategoryOptions categories={categories.filter((category) => !category.archived)} noneLabel={t("noCategory")} /></Select></div><div className="space-y-2"><Label htmlFor="edit-description">{t("description")}</Label><Textarea id="edit-description" name="description" defaultValue={movement.description ?? ""} maxLength={300} /></div>{state.status === "error" ? <p className="text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button><Button disabled={pending} type="submit">{pending ? t("saving") : t("save")}</Button></DialogFooter></form></DialogContent></Dialog>;
}
