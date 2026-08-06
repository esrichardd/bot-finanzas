import { ApiError, type ApiErrorBody } from "../../lib/api/client";
import type { CreditCardActionState } from "./action-state";

export const API_ERROR_KEYS: Record<string, string> = {
  ACCOUNT_NAME_CONFLICT: "errorNameConflict",
  ACCOUNT_BALANCE_NOT_ZERO: "errorBalanceNotZero",
  ACCOUNT_ALREADY_ACTIVE: "errorAlreadyActive",
  ACCOUNT_ALREADY_AT_TARGET_BALANCE: "errorAlreadyAtBalance",
  CREDIT_CARD_DEDICATED_FLOW_REQUIRED: "errorDedicatedFlow",
};

export function apiErrorKey(error: unknown): string {
  if (!(error instanceof ApiError)) return "errorGeneric";
  const body = error.body as ApiErrorBody | null;
  return body?.error ? API_ERROR_KEYS[body.error] ?? "errorGeneric" : "errorGeneric";
}

export async function runCreditCardMutation(
  operation: () => Promise<unknown>,
): Promise<CreditCardActionState | null> {
  try {
    await operation();
    return null;
  } catch (error) {
    if (error instanceof ApiError) return { status: "error", errorKey: apiErrorKey(error) };
    throw error;
  }
}
