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

const nonNegativeMinorUnits = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);

export const adjustAccountBalanceInput = z.object({
  targetBalance: z.object({
    amount: nonNegativeMinorUnits,
    direction: z.enum(["in", "out"]),
  }),
  occurredAt: isoDate,
});
export type AdjustAccountBalanceInput = z.infer<
  typeof adjustAccountBalanceInput
>;

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

export const transferFeeInput = z.discriminatedUnion("side", [
  z.object({
    side: z.literal("source"),
    mode: z.enum(["deducted_from_amount", "charged_additionally"]),
    amount: minorUnits,
    description: z.string().trim().min(1).max(120).nullish(),
  }),
  z.object({
    side: z.literal("destination"),
    mode: z.literal("deducted_from_received"),
    amount: minorUnits,
    description: z.string().trim().min(1).max(120).nullish(),
  }),
]);

export const createTransferInput = z
  .object({
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    amountFrom: minorUnits,
    amountTo: minorUnits.optional(),
    fees: z.array(transferFeeInput).max(10).default([]),
    description: z.string().trim().max(300).nullish(),
    occurredAt: isoDate,
  });
export type CreateTransferInput = z.infer<typeof createTransferInput>;
export type TransferFeeInput = z.infer<typeof transferFeeInput>;

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

export const ledgerQuery = z.object({
  kind: z.enum(["all", "income", "expense", "transfer", "adjustment"]).default("all"),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type LedgerQuery = z.infer<typeof ledgerQuery>;

export const movementResponse = z.object({
  id: z.string(),
  accountId: z.string(),
  type: z.enum([
    "income",
    "expense",
    "transfer_in",
    "transfer_out",
    "adjustment_in",
    "adjustment_out",
  ]),
  amount: z.number(),
  categoryId: z.string().nullable(),
  transferId: z.string().nullable(),
  description: z.string().nullable(),
  occurredAt: z.string(),
  source: z.enum(["manual", "agent"]),
});
export const movementListResponse = z.array(movementResponse);

export const balanceResponse = z.array(
  z.object({ accountId: z.string(), balance: z.number() }),
);

export const transferResponse = z.object({
  id: z.string(),
  breakdown: z.object({
    fromAccountId: z.string(),
    toAccountId: z.string(),
    sameCurrency: z.boolean(),
    amountFrom: z.number(),
    principalFrom: z.number(),
    grossDestination: z.number(),
    sourceDeductedFees: z.number(),
    sourceAdditionalFees: z.number(),
    destinationFees: z.number(),
    sourceTotalDebit: z.number(),
    destinationNetCredit: z.number(),
    rate: z.number().nullable(),
    fees: z.array(z.object({
      side: z.enum(["source", "destination"]),
      mode: z.enum(["deducted_from_amount", "charged_additionally", "deducted_from_received"]),
      amount: z.number(),
      description: z.string().nullable(),
    })),
  }),
  movements: movementListResponse,
});

export const ledgerMovementEntry = z.object({
  entryKind: z.literal("movement"),
  id: z.string(),
  movementType: z.enum(["income", "expense", "adjustment_in", "adjustment_out"]),
  accountId: z.string(),
  amount: z.number(),
  categoryId: z.string().nullable(),
  description: z.string().nullable(),
  occurredAt: z.string(),
  source: z.enum(["manual", "agent"]),
});

export const ledgerTransferFee = z.object({
  movementId: z.string(),
  side: z.enum(["source", "destination"]),
  accountId: z.string(),
  amount: z.number(),
  categoryId: z.string().nullable(),
  description: z.string().nullable(),
});

export const ledgerTransferEntry = z.object({
  entryKind: z.literal("transfer"),
  id: z.string(),
  fromAccountId: z.string(),
  toAccountId: z.string(),
  principalFrom: z.number(),
  grossDestination: z.number(),
  sourceTotalDebit: z.number(),
  destinationNetCredit: z.number(),
  description: z.string().nullable(),
  occurredAt: z.string(),
  source: z.enum(["manual", "agent"]),
  fees: z.array(ledgerTransferFee),
});

export const ledgerEntry = z.discriminatedUnion("entryKind", [
  ledgerMovementEntry,
  ledgerTransferEntry,
]);

export const ledgerResponse = z.object({
  items: z.array(ledgerEntry),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
