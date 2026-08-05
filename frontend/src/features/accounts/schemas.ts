import { z } from "zod";

export const accountTypeSchema = z.enum(["bank", "cash", "crypto"]);

export const createAccountFormSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: accountTypeSchema,
  currencyCode: z.string().trim().min(3).max(10),
  institution: z.string().trim().max(60),
  openingBalanceAmount: z.string(),
  openingBalanceDirection: z.enum(["in", "out"]),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const editAccountFormSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  institution: z.string().trim().max(60),
});

export const adjustBalanceFormSchema = z.object({
  accountId: z.string().uuid(),
  targetBalanceAmount: z.string(),
  targetBalanceDirection: z.enum(["in", "out"]),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const accountIdSchema = z.object({ accountId: z.string().uuid() });
