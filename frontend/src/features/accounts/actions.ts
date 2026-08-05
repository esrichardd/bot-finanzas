"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getMe } from "../../lib/api/users";
import {
  archiveAccount,
  listCurrencies,
  openAccount,
  restoreAccount,
  updateAccount,
} from "../../lib/api/accounts";
import { adjustAccountBalance } from "../../lib/api/movements";
import { parseMoney } from "../../lib/money";
import {
  accountIdSchema,
  adjustBalanceFormSchema,
  createAccountFormSchema,
  editAccountFormSchema,
} from "./schemas";
import type { AccountActionState } from "./action-state";
import { runAccountMutation } from "./action-helpers";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function fieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

function revalidateLedger() {
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/movements");
}

export async function openAccountAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  await getMe();
  const parsed = createAccountFormSchema.safeParse({
    name: text(formData, "name"),
    type: text(formData, "type"),
    currencyCode: text(formData, "currencyCode"),
    institution: text(formData, "institution"),
    openingBalanceAmount: text(formData, "openingBalanceAmount"),
    openingBalanceDirection: text(formData, "openingBalanceDirection") || "in",
    occurredAt: text(formData, "occurredAt"),
  });
  if (!parsed.success) return { status: "error", errorKey: "errorGeneric", fieldErrors: fieldErrors(parsed.error) };

  const { data } = parsed;
  const currencies = await listCurrencies();
  const currency = currencies.find((item) => item.code === data.currencyCode.toUpperCase());
  if (!currency) return { status: "error", errorKey: "errorGeneric", fieldErrors: { currencyCode: ["invalid"] } };
  const amount = parseMoney(data.openingBalanceAmount, currency);
  if (data.openingBalanceAmount.trim() && amount === null) {
    return { status: "error", errorKey: "errorInvalidAmount", fieldErrors: { openingBalanceAmount: ["invalid"] } };
  }

  const mutationError = await runAccountMutation(() =>
    openAccount({
      name: data.name,
      type: data.type,
      currencyCode: currency.code,
      institution: data.institution || null,
      ...(amount !== null && amount > 0
        ? {
            openingBalance: {
              amount,
              direction: data.openingBalanceDirection,
              occurredAt: data.occurredAt,
            },
          }
        : {}),
    }),
  );
  if (mutationError) return mutationError;
  revalidateLedger();
  return { status: "success" };
}

export async function updateAccountAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  await getMe();
  const parsed = editAccountFormSchema.safeParse({
    accountId: text(formData, "accountId"),
    name: text(formData, "name"),
    institution: text(formData, "institution"),
  });
  if (!parsed.success) return { status: "error", errorKey: "errorGeneric", fieldErrors: fieldErrors(parsed.error) };

  const mutationError = await runAccountMutation(() =>
    updateAccount(parsed.data.accountId, {
      name: parsed.data.name,
      institution: parsed.data.institution || null,
    }),
  );
  if (mutationError) return mutationError;
  revalidatePath("/accounts");
  return { status: "success" };
}

export async function adjustBalanceAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  await getMe();
  const parsed = adjustBalanceFormSchema.safeParse({
    accountId: text(formData, "accountId"),
    targetBalanceAmount: text(formData, "targetBalanceAmount"),
    targetBalanceDirection: text(formData, "targetBalanceDirection") || "in",
    occurredAt: text(formData, "occurredAt"),
  });
  if (!parsed.success) return { status: "error", errorKey: "errorGeneric", fieldErrors: fieldErrors(parsed.error) };

  const currencies = await listCurrencies();
  const accountCurrencyCode = text(formData, "currencyCode");
  const currency = currencies.find((item) => item.code === accountCurrencyCode);
  if (!currency) return { status: "error", errorKey: "errorGeneric" };
  const amount = parseMoney(parsed.data.targetBalanceAmount, currency);
  if (amount === null) return { status: "error", errorKey: "errorInvalidAmount", fieldErrors: { targetBalanceAmount: ["invalid"] } };

  const mutationError = await runAccountMutation(() =>
    adjustAccountBalance(parsed.data.accountId, {
      targetBalance: { amount, direction: parsed.data.targetBalanceDirection },
      occurredAt: parsed.data.occurredAt,
    }),
  );
  if (mutationError) return mutationError;
  revalidateLedger();
  return { status: "success" };
}

export async function archiveAccountAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  await getMe();
  const parsed = accountIdSchema.safeParse({ accountId: text(formData, "accountId") });
  if (!parsed.success) return { status: "error", errorKey: "errorGeneric" };
  const mutationError = await runAccountMutation(() => archiveAccount(parsed.data.accountId));
  if (mutationError) return mutationError;
  revalidateLedger();
  return { status: "success" };
}

export async function restoreAccountAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  await getMe();
  const parsed = accountIdSchema.safeParse({ accountId: text(formData, "accountId") });
  if (!parsed.success) return { status: "error", errorKey: "errorGeneric" };
  const mutationError = await runAccountMutation(() => restoreAccount(parsed.data.accountId));
  if (mutationError) return mutationError;
  revalidatePath("/accounts");
  return { status: "success" };
}
