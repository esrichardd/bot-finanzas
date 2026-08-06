import { z } from "zod";

const minorUnits = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonNegativeMinorUnits = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);
const dayOfMonth = z.number().int().min(1).max(31);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const creditCardDetailsInput = z.object({
  creditLimit: minorUnits,
  cutDay: dayOfMonth,
  paymentDueDay: dayOfMonth,
  managementFee: minorUnits.nullish(),
});

export const openCreditCardInput = creditCardDetailsInput.extend({
  name: z.string().trim().min(1).max(60),
  currencyCode: z.string().trim().toUpperCase().min(3).max(10),
  institution: z.string().trim().min(1).max(60).nullish(),
  openingDebt: z
    .object({ amount: nonNegativeMinorUnits, occurredAt: isoDate })
    .optional(),
});
export type OpenCreditCardInput = z.infer<typeof openCreditCardInput>;

export const updateCreditCardInput = creditCardDetailsInput.extend({
  name: z.string().trim().min(1).max(60),
  institution: z.string().trim().min(1).max(60).nullable(),
});
export type UpdateCreditCardInput = z.infer<typeof updateCreditCardInput>;

export const listCreditCardsQuery = z.object({
  status: z.enum(["active", "archived"]).default("active"),
});
export type ListCreditCardsQuery = z.infer<typeof listCreditCardsQuery>;

export const upsertCreditCardInput = creditCardDetailsInput;
export type UpsertCreditCardInput = z.infer<typeof upsertCreditCardInput>;

const accountResponse = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal("credit_card"),
  currencyCode: z.string(),
  institution: z.string().nullable(),
  archived: z.boolean(),
});

const configuredCreditCardFields = {
  configured: z.literal(true),
  account: accountResponse,
  creditLimit: z.number(),
  cutDay: z.number(),
  paymentDueDay: z.number(),
  managementFee: z.number().nullable(),
  balance: z.number(),
  debt: z.number(),
  creditBalance: z.number(),
  availableCredit: z.number(),
  utilizationPercentage: z.number(),
  nextCutDate: z.string(),
  nextPaymentDueDate: z.string(),
};

export const configuredCreditCardResponse = z.object(configuredCreditCardFields);
export const incompleteCreditCardResponse = z.object({
  configured: z.literal(false),
  account: accountResponse,
  balance: z.number(),
});
export const creditCardListItem = z.discriminatedUnion("configured", [
  configuredCreditCardResponse,
  incompleteCreditCardResponse,
]);
export const creditCardListResponse = z.array(creditCardListItem);

/** Backward-compatible response for /accounts/:id/credit-card. */
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
