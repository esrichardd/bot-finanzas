import { z } from "zod";

export const accountTypeValues = [
  "bank",
  "cash",
  "credit_card",
  "crypto",
] as const;

export const createAccountInput = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(accountTypeValues),
  currencyCode: z.string().trim().toUpperCase().min(3).max(10),
  institution: z.string().trim().min(1).max(60).nullish(),
});
export type CreateAccountInput = z.infer<typeof createAccountInput>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const minorUnits = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

export const openingBalanceInput = z.object({
  amount: minorUnits,
  direction: z.enum(["in", "out"]),
  occurredAt: isoDate,
});

export const openAccountInput = createAccountInput.extend({
  openingBalance: openingBalanceInput.optional(),
});
export type OpenAccountInput = z.infer<typeof openAccountInput>;

export const listAccountsQuery = z.object({
  status: z.enum(["active", "archived"]).default("active"),
});
export type ListAccountsQuery = z.infer<typeof listAccountsQuery>;

export const updateAccountInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    institution: z.string().trim().min(1).max(60).nullable(),
  })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
export type UpdateAccountInput = z.infer<typeof updateAccountInput>;

export const accountResponse = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(accountTypeValues),
  currencyCode: z.string(),
  institution: z.string().nullable(),
  archived: z.boolean(),
});
export const accountListResponse = z.array(accountResponse);

export const currencyResponse = z.object({
  code: z.string(),
  name: z.string(),
  decimals: z.number(),
  kind: z.enum(["fiat", "crypto"]),
});
export const currencyListResponse = z.array(currencyResponse);
