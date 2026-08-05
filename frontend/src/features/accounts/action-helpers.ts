import { ApiError, type ApiErrorBody } from "../../lib/api/client";
import type { AccountActionState } from "./action-state";

export const API_ERROR_KEYS: Record<string, string> = {
  ACCOUNT_NAME_CONFLICT: "errorNameConflict",
  ACCOUNT_BALANCE_NOT_ZERO: "errorBalanceNotZero",
  ACCOUNT_ALREADY_ACTIVE: "errorAlreadyActive",
  ACCOUNT_ALREADY_AT_TARGET_BALANCE: "errorAlreadyAtBalance",
};

function getApiErrorKey(error: ApiError) {
  const body = error.body as ApiErrorBody | null;
  return body?.error ? (API_ERROR_KEYS[body.error] ?? "errorGeneric") : "errorGeneric";
}

export async function runAccountMutation(
  operation: () => Promise<unknown>,
): Promise<AccountActionState | null> {
  try {
    await operation();
    return null;
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: "error", errorKey: getApiErrorKey(error) };
    }
    throw error;
  }
}
