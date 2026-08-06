export type CategoryActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; errorKey: string; fieldErrors?: Record<string, string[]> };

export const initialCategoryActionState: CategoryActionState = { status: "idle" };
