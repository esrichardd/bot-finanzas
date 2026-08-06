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

export type TransferFeeCalculationInput =
  | {
      side: "source";
      mode: "deducted_from_amount" | "charged_additionally";
      amount: number;
      description?: string | null;
    }
  | {
      side: "destination";
      mode: "deducted_from_received";
      amount: number;
      description?: string | null;
    };

export interface TransferBreakdown {
  amountFrom: number;
  principalFrom: number;
  grossDestination: number;
  sourceDeductedFees: number;
  sourceAdditionalFees: number;
  destinationFees: number;
  sourceTotalDebit: number;
  destinationNetCredit: number;
  rate: number | null;
}

export type TransferCalculationErrorCode =
  | "TRANSFER_DESTINATION_AMOUNT_REQUIRED"
  | "TRANSFER_SAME_CURRENCY_AMOUNT_MISMATCH"
  | "TRANSFER_SOURCE_FEES_EXCEED_AMOUNT"
  | "TRANSFER_DESTINATION_FEES_EXCEED_AMOUNT"
  | "TRANSFER_AMOUNT_OVERFLOW";

export class TransferCalculationError extends Error {
  constructor(public readonly code: TransferCalculationErrorCode) {
    super(code);
    this.name = "TransferCalculationError";
  }
}

function safeAdd(a: number, b: number): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) {
    throw new TransferCalculationError("TRANSFER_AMOUNT_OVERFLOW");
  }
  return result;
}

export function computeTransferBreakdown(input: {
  amountFrom: number;
  amountTo?: number;
  sameCurrency: boolean;
  fees: ReadonlyArray<TransferFeeCalculationInput>;
}): TransferBreakdown {
  const sourceDeductedFees = input.fees
    .filter((fee) => fee.side === "source" && fee.mode === "deducted_from_amount")
    .reduce((sum, fee) => safeAdd(sum, fee.amount), 0);
  const sourceAdditionalFees = input.fees
    .filter((fee) => fee.side === "source" && fee.mode === "charged_additionally")
    .reduce((sum, fee) => safeAdd(sum, fee.amount), 0);
  const destinationFees = input.fees
    .filter((fee) => fee.side === "destination")
    .reduce((sum, fee) => safeAdd(sum, fee.amount), 0);

  if (sourceDeductedFees >= input.amountFrom) {
    throw new TransferCalculationError("TRANSFER_SOURCE_FEES_EXCEED_AMOUNT");
  }
  const principalFrom = input.amountFrom - sourceDeductedFees;

  let grossDestination: number;
  if (input.sameCurrency) {
    if (input.amountTo !== undefined && input.amountTo !== principalFrom) {
      throw new TransferCalculationError("TRANSFER_SAME_CURRENCY_AMOUNT_MISMATCH");
    }
    grossDestination = principalFrom;
  } else {
    if (input.amountTo === undefined) {
      throw new TransferCalculationError("TRANSFER_DESTINATION_AMOUNT_REQUIRED");
    }
    grossDestination = input.amountTo;
  }

  if (destinationFees >= grossDestination) {
    throw new TransferCalculationError("TRANSFER_DESTINATION_FEES_EXCEED_AMOUNT");
  }
  const sourceTotalDebit = safeAdd(
    safeAdd(principalFrom, sourceDeductedFees),
    sourceAdditionalFees,
  );
  const destinationNetCredit = grossDestination - destinationFees;

  return {
    amountFrom: input.amountFrom,
    principalFrom,
    grossDestination,
    sourceDeductedFees,
    sourceAdditionalFees,
    destinationFees,
    sourceTotalDebit,
    destinationNetCredit,
    rate: input.sameCurrency ? null : deriveRate(principalFrom, grossDestination),
  };
}
