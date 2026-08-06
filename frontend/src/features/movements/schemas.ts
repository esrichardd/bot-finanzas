import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amountSchema = z.string().trim().min(1);

export const movementFormSchema = z.object({
  accountId: z.string().uuid(),
  type: z.enum(["income", "expense"]),
  amount: amountSchema,
  categoryId: z.string().uuid().nullable(),
  description: z.string().max(300),
  occurredAt: dateSchema,
});

export const editMovementFormSchema = movementFormSchema.omit({ accountId: true, type: true });

export const transferFormSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amountFrom: amountSchema,
  amountTo: z.string(),
  fees: z.string(),
  description: z.string().max(300),
  occurredAt: dateSchema,
});

export const movementIdSchema = z.object({ movementId: z.string().uuid() });
export const transferIdSchema = z.object({ transferId: z.string().uuid() });
