import "server-only";

import { listAccounts, listCurrencies, type Account, type Currency } from "../../lib/api/accounts";
import { listBalances } from "../../lib/api/movements";

export interface AccountViewModel extends Account {
  balance: number;
  currency: Currency;
}

export async function getAccountsPageData() {
  const [active, archived, balances, currencies] = await Promise.all([
    listAccounts("active"),
    listAccounts("archived"),
    listBalances(),
    listCurrencies(),
  ]);
  const balanceByAccount = new Map(balances.map((item) => [item.accountId, item.balance]));
  const currencyByCode = new Map(currencies.map((currency) => [currency.code, currency]));
  const toViewModel = (account: Account): AccountViewModel => {
    const currency = currencyByCode.get(account.currencyCode);
    if (!currency) throw new Error(`Currency ${account.currencyCode} is missing for account ${account.id}`);
    return { ...account, balance: balanceByAccount.get(account.id) ?? 0, currency };
  };
  return {
    active: active.filter((account) => account.type !== "credit_card").map(toViewModel),
    archived: archived.filter((account) => account.type !== "credit_card").map(toViewModel),
    currencies,
  };
}

export async function hasActiveNonCreditAccounts() {
  const accounts = await listAccounts("active");
  return accounts.some((account) => account.type !== "credit_card");
}
