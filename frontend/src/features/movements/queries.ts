import "server-only";

import { listAccounts, listCurrencies, type Account, type Currency } from "../../lib/api/accounts";
import { listCategories } from "../../lib/api/categories";
import { listLedger, type MovementKind, type LedgerResponse } from "../../lib/api/movements";

export interface MovementsPageQuery {
  kind?: MovementKind;
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  q?: string;
  offset?: number;
}

export async function getMovementsPageData(query: MovementsPageQuery = {}) {
  const [activeAccounts, archivedAccounts, activeCategories, archivedCategories, currencies, ledger] = await Promise.all([
    listAccounts("active"),
    listAccounts("archived"),
    listCategories("active"),
    listCategories("archived"),
    listCurrencies(),
    listLedger({ ...query, limit: 50, offset: query.offset ?? 0 }),
  ]);
  return {
    accounts: [...activeAccounts, ...archivedAccounts],
    activeAccounts,
    categories: [...activeCategories, ...archivedCategories],
    activeCategories,
    currencies,
    ledger,
  };
}

export type MovementsPageData = Awaited<ReturnType<typeof getMovementsPageData>>;

export function accountCurrency(account: Account, currencies: Currency[]) {
  const currency = currencies.find((item) => item.code === account.currencyCode);
  if (!currency) throw new Error(`Currency ${account.currencyCode} is missing for account ${account.id}`);
  return currency;
}

export function normalizeLedgerQuery(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function ledgerQueryFromSearchParams(params: Record<string, string | string[] | undefined>): MovementsPageQuery {
  const offset = Number(params.offset);
  const rawKind = normalizeLedgerQuery(params.kind);
  const kind = rawKind && ["all", "income", "expense", "transfer", "adjustment"].includes(rawKind)
    ? rawKind as MovementKind
    : undefined;
  return {
    kind,
    accountId: normalizeLedgerQuery(params.accountId),
    categoryId: normalizeLedgerQuery(params.categoryId),
    from: normalizeLedgerQuery(params.from),
    to: normalizeLedgerQuery(params.to),
    q: normalizeLedgerQuery(params.q),
    offset: Number.isSafeInteger(offset) && offset > 0 ? offset : 0,
  };
}

export function emptyLedger(): LedgerResponse {
  return { items: [], total: 0, limit: 50, offset: 0 };
}
