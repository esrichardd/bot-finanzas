import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amountSchema = z.string().trim();

export const creditCardFormSchema = z.object({
  name: z.string().trim().min(1).max(60),
  institution: z.string().trim().max(60),
  currencyCode: z.string().trim().min(3),
  creditLimit: amountSchema,
  cutDay: z.coerce.number().int().min(1).max(31),
  paymentDueDay: z.coerce.number().int().min(1).max(31),
  managementFee: amountSchema,
  openingDebt: amountSchema.optional(),
  openingDebtDate: dateSchema.optional(),
});

export const creditCardIdSchema = z.object({ accountId: z.string().uuid() });

export const adjustCardBalanceFormSchema = z.object({
  accountId: z.string().uuid(),
  targetBalanceAmount: amountSchema,
  targetBalanceDirection: z.enum(["in", "out"]),
  occurredAt: dateSchema,
});
