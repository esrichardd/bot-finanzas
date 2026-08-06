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

export type MovementKind = "all" | "income" | "expense" | "transfer" | "adjustment";
export type DirectMovementType = "income" | "expense" | "adjustment_in" | "adjustment_out";
export type TransferFee =
  | { side: "source"; mode: "deducted_from_amount" | "charged_additionally"; amount: number; description?: string | null }
  | { side: "destination"; mode: "deducted_from_received"; amount: number; description?: string | null };

export interface LedgerMovementEntry {
  entryKind: "movement";
  id: string;
  movementType: DirectMovementType;
  accountId: string;
  amount: number;
  categoryId: string | null;
  description: string | null;
  occurredAt: string;
  source: "manual" | "agent";
}

export interface LedgerTransferFee {
  movementId: string;
  side: "source" | "destination";
  accountId: string;
  amount: number;
  categoryId: string | null;
  description: string | null;
}

export interface LedgerTransferEntry {
  entryKind: "transfer";
  id: string;
  fromAccountId: string;
  toAccountId: string;
  principalFrom: number;
  grossDestination: number;
  sourceTotalDebit: number;
  destinationNetCredit: number;
  description: string | null;
  occurredAt: string;
  source: "manual" | "agent";
  fees: LedgerTransferFee[];
}

export type LedgerEntry = LedgerMovementEntry | LedgerTransferEntry;

export interface LedgerResponse {
  items: LedgerEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface TransferBreakdown {
  fromAccountId: string;
  toAccountId: string;
  sameCurrency: boolean;
  amountFrom: number;
  principalFrom: number;
  grossDestination: number;
  sourceDeductedFees: number;
  sourceAdditionalFees: number;
  destinationFees: number;
  sourceTotalDebit: number;
  destinationNetCredit: number;
  rate: number | null;
  fees: TransferFee[];
}

export interface TransferResponse {
  id: string;
  breakdown: TransferBreakdown;
  movements: Movement[];
}

export interface CreateMovementPayload {
  accountId: string;
  type: "income" | "expense";
  amount: number;
  categoryId?: string | null;
  description?: string | null;
  occurredAt: string;
}

export interface CreateTransferPayload {
  fromAccountId: string;
  toAccountId: string;
  amountFrom: number;
  amountTo?: number;
  fees: TransferFee[];
  description?: string | null;
  occurredAt: string;
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

export function listLedger(query: {
  kind?: MovementKind;
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<LedgerResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return apiFetch<LedgerResponse>(`/api/ledger?${params.toString()}`);
}

export function createMovement(input: CreateMovementPayload): Promise<Movement> {
  return apiFetch<Movement>("/api/movements", { method: "POST", body: JSON.stringify(input) });
}

export function updateMovement(
  movementId: string,
  input: Partial<Pick<CreateMovementPayload, "amount" | "categoryId" | "description" | "occurredAt">>,
): Promise<Movement> {
  return apiFetch<Movement>(`/api/movements/${encodeURIComponent(movementId)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteMovement(movementId: string): Promise<void> {
  return apiFetch<void>(`/api/movements/${encodeURIComponent(movementId)}`, { method: "DELETE" });
}

export function previewTransfer(input: CreateTransferPayload): Promise<TransferBreakdown> {
  return apiFetch<TransferBreakdown>("/api/transfers/preview", { method: "POST", body: JSON.stringify(input) });
}

export function createTransfer(input: CreateTransferPayload): Promise<TransferResponse> {
  return apiFetch<TransferResponse>("/api/transfers", { method: "POST", body: JSON.stringify(input) });
}

export function deleteTransfer(transferId: string): Promise<void> {
  return apiFetch<void>(`/api/transfers/${encodeURIComponent(transferId)}`, { method: "DELETE" });
}
