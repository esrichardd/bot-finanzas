import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const minorUnits = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const directMovementTypes = [
  "income",
  "expense",
  "adjustment_in",
  "adjustment_out",
] as const;

export const createMovementInput = z.object({
  accountId: z.string().uuid(),
  type: z.enum(directMovementTypes),
  amount: minorUnits,
  categoryId: z.string().uuid().nullish(),
  description: z.string().trim().max(300).nullish(),
  occurredAt: isoDate,
});
export type CreateMovementInput = z.infer<typeof createMovementInput>;

export const updateMovementInput = z
  .object({
    amount: minorUnits,
    categoryId: z.string().uuid().nullable(),
    description: z.string().trim().max(300).nullable(),
    occurredAt: isoDate,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");
export type UpdateMovementInput = z.infer<typeof updateMovementInput>;

export const createTransferInput = z
  .object({
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    amountFrom: minorUnits,
    amountTo: minorUnits.optional(),
    feeAmount: minorUnits.optional(),
    feeCategoryId: z.string().uuid().optional(),
    description: z.string().trim().max(300).nullish(),
    occurredAt: isoDate,
  })
  .refine(
    (value) => value.fromAccountId !== value.toAccountId,
    "Cannot transfer to the same account",
  );
export type CreateTransferInput = z.infer<typeof createTransferInput>;

export const listMovementsQuery = z.object({
  accountId: z.string().uuid().optional(),
  type: z
    .enum([
      "income",
      "expense",
      "transfer_in",
      "transfer_out",
      "adjustment_in",
      "adjustment_out",
    ])
    .optional(),
  categoryId: z.string().uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListMovementsQuery = z.infer<typeof listMovementsQuery>;

export const movementResponse = z.object({
  id: z.string(),
  accountId: z.string(),
  type: z.string(),
  amount: z.number(),
  categoryId: z.string().nullable(),
  transferId: z.string().nullable(),
  description: z.string().nullable(),
  occurredAt: z.string(),
  source: z.string(),
});
export const movementListResponse = z.array(movementResponse);

export const balanceResponse = z.array(
  z.object({ accountId: z.string(), balance: z.number() }),
);

export const transferResponse = z.object({
  id: z.string(),
  movements: movementListResponse,
});
