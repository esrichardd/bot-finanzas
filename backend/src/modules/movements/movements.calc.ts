export type MovementType =
  | "income"
  | "expense"
  | "transfer_in"
  | "transfer_out"
  | "adjustment_in"
  | "adjustment_out";

const POSITIVE: ReadonlySet<MovementType> = new Set([
  "income",
  "transfer_in",
  "adjustment_in",
]);

/** Monto con signo según el tipo. El monto de entrada siempre es positivo. */
export function signedAmount(type: MovementType, amount: number): number {
  return POSITIVE.has(type) ? amount : -amount;
}

/** Balance = suma de montos con signo. */
export function computeBalance(
  rows: ReadonlyArray<{ type: MovementType; amount: number }>,
): number {
  return rows.reduce((acc, row) => acc + signedAmount(row.type, row.amount), 0);
}

export interface BalanceAdjustment {
  type: "adjustment_in" | "adjustment_out";
  amount: number;
}

export function computeBalanceAdjustment(
  currentBalance: number,
  targetBalance: number,
): BalanceAdjustment | null {
  const difference = targetBalance - currentBalance;
  if (difference === 0) return null;

  return {
    type: difference > 0 ? "adjustment_in" : "adjustment_out",
    amount: Math.abs(difference),
  };
}

/** Tasa derivada de una transferencia FX, solo para display. */
export function deriveRate(amountFrom: number, amountTo: number): number {
  return amountTo / amountFrom;
}
