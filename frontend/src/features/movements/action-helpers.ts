import { ApiError, type ApiErrorBody } from "../../lib/api/client";
import type { MovementActionState } from "./action-state";

export const API_ERROR_KEYS: Record<string, string> = {
  TRANSFER_SAME_ACCOUNT: "errorSameAccount",
  TRANSFER_DESTINATION_AMOUNT_REQUIRED: "errorDestinationAmountRequired",
  TRANSFER_SAME_CURRENCY_AMOUNT_MISMATCH: "errorSameCurrencyMismatch",
  TRANSFER_SOURCE_FEES_EXCEED_AMOUNT: "errorSourceFeesExceed",
  TRANSFER_DESTINATION_FEES_EXCEED_AMOUNT: "errorDestinationFeesExceed",
  TRANSFER_AMOUNT_OVERFLOW: "errorAmountOverflow",
  ACCOUNT_NOT_FOUND: "errorAccountUnavailable",
  CATEGORY_NOT_FOUND: "errorCategoryUnavailable",
  VALIDATION_ERROR: "errorValidation",
};

export function apiErrorKey(error: unknown) {
  if (!(error instanceof ApiError)) return "errorGeneric";
  const body = error.body as ApiErrorBody | null;
  return body?.error ? API_ERROR_KEYS[body.error] ?? "errorGeneric" : "errorGeneric";
}

export async function runMovementMutation(operation: () => Promise<unknown>): Promise<MovementActionState | null> {
  try {
    await operation();
    return null;
  } catch (error) {
    if (error instanceof ApiError) return { status: "error", errorKey: apiErrorKey(error) };
    throw error;
  }
}
