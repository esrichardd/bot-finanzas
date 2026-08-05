import { apiFetch } from "./client";

export type AccountType = "bank" | "cash" | "credit_card" | "crypto";
export type AccountStatus = "active" | "archived";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currencyCode: string;
  institution: string | null;
  archived: boolean;
}

export interface Currency {
  code: string;
  name: string;
  decimals: number;
  kind: "fiat" | "crypto";
}

export interface OpeningBalance {
  amount: number;
  direction: "in" | "out";
  occurredAt: string;
}

export interface OpenAccountPayload {
  name: string;
  type: AccountType;
  currencyCode: string;
  institution?: string | null;
  openingBalance?: OpeningBalance;
}

export function listAccounts(status: AccountStatus): Promise<Account[]> {
  return apiFetch<Account[]>(`/api/accounts?status=${status}`);
}

export function listCurrencies(): Promise<Currency[]> {
  return apiFetch<Currency[]>("/api/currencies");
}

export function openAccount(input: OpenAccountPayload): Promise<Account> {
  return apiFetch<Account>("/api/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAccount(
  accountId: string,
  input: { name?: string; institution?: string | null },
): Promise<Account> {
  return apiFetch<Account>(`/api/accounts/${encodeURIComponent(accountId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveAccount(accountId: string): Promise<void> {
  return apiFetch<void>(`/api/accounts/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
  });
}

export function restoreAccount(accountId: string): Promise<Account> {
  return apiFetch<Account>(
    `/api/accounts/${encodeURIComponent(accountId)}/restore`,
    { method: "POST" },
  );
}
