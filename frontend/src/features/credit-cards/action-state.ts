export type CreditCardActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; errorKey: string; fieldErrors?: Record<string, string[]> };

export const initialCreditCardActionState: CreditCardActionState = { status: "idle" };
