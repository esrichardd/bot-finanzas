"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import type { Account, Currency } from "../../../lib/api/accounts";
import type { Category } from "../../../lib/api/categories";
import { formatMoney } from "../../../lib/money";
import { createMovementAction, createTransferAction, previewTransferAction } from "../actions";
import { initialMovementActionState, type MovementActionState } from "../action-state";

type FeeDraft = { side: "source" | "destination"; mode: "deducted_from_amount" | "charged_additionally" | "deducted_from_received"; amount: string; description: string };

function today() { return new Date().toISOString().slice(0, 10); }

function CategoryOptions({ categories, noneLabel }: { categories: Category[]; noneLabel: string }) {
  const roots = categories.filter((category) => category.parentId === null);
  return <>
    <option value="">{noneLabel}</option>
    {roots.map((root) => {
      const children = categories.filter((category) => category.parentId === root.id);
      return <optgroup key={root.id} label={`${root.emoji ?? ""} ${root.name}`}>
        <option value={root.id}>{root.emoji ?? ""} {root.name}</option>
        {children.map((child) => <option key={child.id} value={child.id}>{child.emoji ?? root.emoji ?? ""} {root.name} / {child.name}</option>)}
      </optgroup>;
    })}
  </>;
}

function ErrorMessage({ state, t }: { state: MovementActionState; t: (key: never) => string }) {
  return state.status === "error" ? <p aria-live="polite" className="text-sm text-destructive" role="alert">{t(state.errorKey as never)}</p> : null;
}

export function MovementEntryDialog({
  accounts,
  activeAccounts,
  activeCategories,
  currencies,
  onOpenChange,
  onSuccess,
  open,
}: {
  accounts: Account[];
  activeAccounts: Account[];
  activeCategories: Category[];
  currencies: Currency[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  open: boolean;
}) {
  const t = useTranslations("movements");
  const locale = useLocale();
  const [mode, setMode] = useState<"movement" | "transfer">("movement");
  const [fees, setFees] = useState<FeeDraft[]>([]);
  const [movementState, movementAction, movementPending] = useActionState(createMovementAction, initialMovementActionState);
  const [previewState, previewAction, previewPending] = useActionState(previewTransferAction, initialMovementActionState);
  const [createState, createAction, createPending] = useActionState(createTransferAction, initialMovementActionState);
  const [fromAccountId, setFromAccountId] = useState(activeAccounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(activeAccounts[1]?.id ?? activeAccounts[0]?.id ?? "");
  const fromAccount = accounts.find((account) => account.id === fromAccountId);
  const toAccount = accounts.find((account) => account.id === toAccountId);
  const fromCurrency = currencies.find((currency) => currency.code === fromAccount?.currencyCode);
  const toCurrency = currencies.find((currency) => currency.code === toAccount?.currencyCode);
  const fx = Boolean(fromAccount && toAccount && fromAccount.currencyCode !== toAccount.currencyCode);
  const preview = previewState.status === "preview" ? previewState.preview : null;
  const accountOptions = activeAccounts.length > 0 ? activeAccounts : accounts.filter((account) => !account.archived);
  const feeJson = JSON.stringify(fees);

  useEffect(() => {
    if (movementState.status === "success" || createState.status === "success") {
      onSuccess();
      onOpenChange(false);
    }
  }, [createState.status, movementState.status, onOpenChange, onSuccess]);

  const sourceFees = useMemo(() => fees.filter((fee) => fee.side === "source"), [fees]);
  const destinationFees = useMemo(() => fees.filter((fee) => fee.side === "destination"), [fees]);
  function addFee(side: "source" | "destination") {
    if (fees.length >= 10) return;
    setFees((current) => [...current, { side, mode: side === "source" ? "deducted_from_amount" : "deducted_from_received", amount: "", description: "" }]);
  }
  function updateFee(index: number, field: keyof FeeDraft, value: string) {
    setFees((current) => current.map((fee, itemIndex) => itemIndex === index ? { ...fee, [field]: value } : fee));
  }
  function removeFee(index: number) { setFees((current) => current.filter((_, itemIndex) => itemIndex !== index)); }
  function feeFieldIndex(fee: FeeDraft) { return fees.indexOf(fee); }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t("newTitle")}</DialogTitle>
        <DialogDescription>{t("newDescription")}</DialogDescription>
      </DialogHeader>
      <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label={t("operationType")}>
        <Button type="button" variant={mode === "movement" ? "default" : "ghost"} className="flex-1" onClick={() => setMode("movement")}>{t("simpleMovement")}</Button>
        <Button type="button" variant={mode === "transfer" ? "default" : "ghost"} className="flex-1" onClick={() => setMode("transfer")}>{t("transfer")}</Button>
      </div>

      {mode === "movement" ? <form action={movementAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="movement-account">{t("account")}</Label><Select id="movement-account" name="accountId" required>{accountOptions.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</Select></div>
          <div className="space-y-2"><Label htmlFor="movement-type">{t("type")}</Label><Select id="movement-type" name="type" defaultValue="expense"><option value="expense">{t("expense")}</option><option value="income">{t("income")}</option></Select></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="movement-amount">{t("amount")}</Label><Input id="movement-amount" name="amount" inputMode="decimal" placeholder="0" required /></div>
          <div className="space-y-2"><Label htmlFor="movement-date">{t("date")}</Label><Input id="movement-date" name="occurredAt" type="date" defaultValue={today()} required /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="movement-category">{t("category")}</Label><Select id="movement-category" name="categoryId"><CategoryOptions categories={activeCategories} noneLabel={t("noCategory")} /></Select></div>
        <div className="space-y-2"><Label htmlFor="movement-description">{t("description")}</Label><Textarea id="movement-description" name="description" maxLength={300} placeholder={t("descriptionPlaceholder")} /></div>
        <ErrorMessage state={movementState} t={t} />
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button><Button disabled={movementPending} type="submit">{movementPending ? t("saving") : t("save")}</Button></DialogFooter>
      </form> : <div className="space-y-5">
        <form action={previewAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="transfer-from">{t("fromAccount")}</Label><Select id="transfer-from" name="fromAccountId" value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)} required>{accountOptions.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</Select></div><div className="space-y-2"><Label htmlFor="transfer-to">{t("toAccount")}</Label><Select id="transfer-to" name="toAccountId" value={toAccountId} onChange={(event) => setToAccountId(event.target.value)} required>{accountOptions.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>)}</Select></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="transfer-amount-from">{t("amountFrom")} {fromCurrency ? `(${fromCurrency.code})` : ""}</Label><Input id="transfer-amount-from" name="amountFrom" inputMode="decimal" placeholder="0" required /></div>{fx ? <div className="space-y-2"><Label htmlFor="transfer-amount-to">{t("amountTo")} {toCurrency ? `(${toCurrency.code})` : ""}</Label><Input id="transfer-amount-to" name="amountTo" inputMode="decimal" placeholder="0" required /></div> : <input name="amountTo" type="hidden" value="" />}</div>
          <div className="rounded-xl border bg-muted/30 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-medium">{t("sourceFees")}</h3><p className="text-xs text-muted-foreground">{t("feesHint")}</p></div><Button type="button" variant="outline" size="sm" onClick={() => addFee("source")} disabled={fees.length >= 10}>{t("addFee")}</Button></div>{sourceFees.length === 0 ? <p className="text-sm text-muted-foreground">{t("noFees")}</p> : <div className="space-y-3">{sourceFees.map((fee) => { const index = feeFieldIndex(fee); return <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" key={index}><Input aria-label={t("feeAmount")} value={fee.amount} onChange={(event) => updateFee(index, "amount", event.target.value)} placeholder="0" inputMode="decimal" /><div className="flex gap-2"><Select aria-label={t("feeMode")} value={fee.mode} onChange={(event) => updateFee(index, "mode", event.target.value)}><option value="deducted_from_amount">{t("deducted")}</option><option value="charged_additionally">{t("additional")}</option></Select><Input aria-label={t("feeDescription")} value={fee.description} onChange={(event) => updateFee(index, "description", event.target.value)} placeholder={t("feeDescription")} /></div><Button type="button" variant="ghost" onClick={() => removeFee(index)} aria-label={t("removeFee")}>×</Button></div>; })}</div>}</div>
          <div className="rounded-xl border bg-muted/30 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-medium">{t("destinationFees")}</h3><p className="text-xs text-muted-foreground">{t("destinationFeesHint")}</p></div><Button type="button" variant="outline" size="sm" onClick={() => addFee("destination")} disabled={fees.length >= 10}>{t("addFee")}</Button></div>{destinationFees.length === 0 ? <p className="text-sm text-muted-foreground">{t("noFees")}</p> : <div className="space-y-3">{destinationFees.map((fee) => { const index = feeFieldIndex(fee); return <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" key={index}><Input aria-label={t("feeAmount")} value={fee.amount} onChange={(event) => updateFee(index, "amount", event.target.value)} placeholder="0" inputMode="decimal" /><Input aria-label={t("feeDescription")} value={fee.description} onChange={(event) => updateFee(index, "description", event.target.value)} placeholder={t("feeDescription")} /><Button type="button" variant="ghost" onClick={() => removeFee(index)} aria-label={t("removeFee")}>×</Button></div>; })}</div>}</div>
          <input name="fees" type="hidden" value={feeJson} /><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="transfer-date">{t("date")}</Label><Input id="transfer-date" name="occurredAt" type="date" defaultValue={today()} required /></div><div className="space-y-2"><Label htmlFor="transfer-description">{t("description")}</Label><Input id="transfer-description" name="description" maxLength={300} /></div></div>
          <ErrorMessage state={previewState} t={t} />
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button><Button disabled={previewPending} type="submit">{previewPending ? t("previewing") : t("preview")}</Button></DialogFooter>
        </form>
        {preview ? <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4"><h3 className="font-medium">{t("previewTitle")}</h3><dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{t("principal")}</dt><dd>{formatMoney(preview.principalFrom, fromCurrency ?? { code: "", decimals: 0 }, locale)}</dd></div><div><dt className="text-muted-foreground">{t("grossDestination")}</dt><dd>{formatMoney(preview.grossDestination, toCurrency ?? { code: "", decimals: 0 }, locale)}</dd></div><div><dt className="text-muted-foreground">{t("sourceTotalDebit")}</dt><dd>{formatMoney(preview.sourceTotalDebit, fromCurrency ?? { code: "", decimals: 0 }, locale)}</dd></div><div><dt className="text-muted-foreground">{t("destinationNetCredit")}</dt><dd>{formatMoney(preview.destinationNetCredit, toCurrency ?? { code: "", decimals: 0 }, locale)}</dd></div>{preview.rate !== null ? <div><dt className="text-muted-foreground">{t("rate")}</dt><dd>{preview.rate}</dd></div> : null}</dl><form action={createAction}><input name="payload" type="hidden" value={JSON.stringify(previewState.status === "preview" ? previewState.payload : {})} /><ErrorMessage state={createState} t={t} /><div className="flex justify-end"><Button disabled={createPending} type="submit">{createPending ? t("saving") : t("confirmTransfer")}</Button></div></form></div> : null}
      </div>}
    </DialogContent>
  </Dialog>;
}
