export type AccountActionState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      errorKey: string;
      fieldErrors?: Record<string, string[]>;
    };

export const initialAccountActionState: AccountActionState = { status: "idle" };
