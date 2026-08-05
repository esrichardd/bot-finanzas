import { apiFetch } from "./client";

export interface AccountBalance {
  accountId: string;
  balance: number;
}

export interface Movement {
  id: string;
  accountId: string;
  type: string;
  amount: number;
  categoryId: string | null;
  transferId: string | null;
  description: string | null;
  occurredAt: string;
  source: string;
}

export interface AdjustAccountBalancePayload {
  targetBalance: { amount: number; direction: "in" | "out" };
  occurredAt: string;
}

export function listBalances(): Promise<AccountBalance[]> {
  return apiFetch<AccountBalance[]>("/api/balances");
}

export function adjustAccountBalance(
  accountId: string,
  input: AdjustAccountBalancePayload,
): Promise<Movement> {
  return apiFetch<Movement>(
    `/api/accounts/${encodeURIComponent(accountId)}/balance-adjustments`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
