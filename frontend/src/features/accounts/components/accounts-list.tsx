"use client";

import { useLocale, useTranslations } from "next-intl";

import { formatMoney } from "../../../lib/money";
import type { AccountViewModel } from "../queries";
import { AccountRowActions } from "./account-row-actions";

export function AccountsList({ accounts, archived, onEdit, onAdjust, onArchive }: { accounts: AccountViewModel[]; archived: boolean; onEdit: (account: AccountViewModel) => void; onAdjust: (account: AccountViewModel) => void; onArchive: (account: AccountViewModel) => void }) {
  const t = useTranslations("accounts");
  const locale = useLocale();
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="hidden grid-cols-[minmax(0,1.6fr)_0.8fr_0.7fr_minmax(0,1fr)_auto] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:grid">
        <span>{t("name")}</span><span>{t("type")}</span><span>{t("currency")}</span><span>{t("balance")}</span><span aria-hidden />
      </div>
      {accounts.map((account) => (
        <div className="grid gap-3 border-b px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1.6fr)_0.8fr_0.7fr_minmax(0,1fr)_auto] md:items-center md:gap-4" key={account.id}>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{account.name}</p>
              <p className="truncate text-sm text-muted-foreground">{account.institution ?? t("noInstitution")}</p>
            </div>
            <div className="md:hidden"><AccountRowActions account={account} archived={archived} onAdjust={() => onAdjust(account)} onArchive={() => onArchive(account)} onEdit={() => onEdit(account)} /></div>
          </div>
          <span className="text-sm text-muted-foreground">{t(account.type)}</span>
          <span className="text-sm text-muted-foreground">{account.currency.code}</span>
          <p className={`font-serif text-xl ${account.balance < 0 ? "text-destructive" : account.balance === 0 ? "text-muted-foreground" : "text-foreground"}`}>
            {formatMoney(account.balance, account.currency, locale)}
          </p>
          <div className="hidden md:block"><AccountRowActions account={account} archived={archived} onAdjust={() => onAdjust(account)} onArchive={() => onArchive(account)} onEdit={() => onEdit(account)} /></div>
        </div>
      ))}
    </div>
  );
}
