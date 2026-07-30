import { z } from "zod";

const minorUnits = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const dayOfMonth = z.number().int().min(1).max(31);

export const upsertCreditCardInput = z.object({
  creditLimit: minorUnits,
  cutDay: dayOfMonth,
  paymentDueDay: dayOfMonth,
  managementFee: minorUnits.nullish(),
});
export type UpsertCreditCardInput = z.infer<typeof upsertCreditCardInput>;

export const creditCardResponse = z.object({
  accountId: z.string(),
  creditLimit: z.number(),
  cutDay: z.number(),
  paymentDueDay: z.number(),
  managementFee: z.number().nullable(),
  balance: z.number(),
  debt: z.number(),
  availableCredit: z.number(),
  nextCutDate: z.string(),
  nextPaymentDueDate: z.string(),
});
