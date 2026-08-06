import { ApiError, type ApiErrorBody } from "../../lib/api/client";
import type { CategoryActionState } from "./action-state";

const API_ERROR_KEYS: Record<string, string> = {
  CATEGORY_NAME_CONFLICT: "errorNameConflict",
  CATEGORY_ALREADY_ARCHIVED: "errorAlreadyArchived",
  CATEGORY_ALREADY_ACTIVE: "errorAlreadyActive",
  CATEGORY_PARENT_ARCHIVED: "errorParentArchived",
};

function getApiErrorKey(error: ApiError) {
  const body = error.body as ApiErrorBody | null;
  return body?.error ? API_ERROR_KEYS[body.error] ?? "errorGeneric" : "errorGeneric";
}

export async function runCategoryMutation(operation: () => Promise<unknown>): Promise<CategoryActionState | null> {
  try {
    await operation();
    return null;
  } catch (error) {
    if (error instanceof ApiError) return { status: "error", errorKey: getApiErrorKey(error) };
    throw error;
  }
}
