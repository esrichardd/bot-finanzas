"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getMe } from "../../lib/api/users";
import { listCurrencies } from "../../lib/api/accounts";
import { archiveAccount, restoreAccount } from "../../lib/api/accounts";
import {
  openCreditCard,
  updateCreditCard,
} from "../../lib/api/credit-cards";
import { adjustAccountBalance } from "../../lib/api/movements";
import { parseMoney } from "../../lib/money";
import { apiErrorKey, runCreditCardMutation } from "./action-helpers";
import type { CreditCardActionState } from "./action-state";
import { adjustCardBalanceFormSchema, creditCardFormSchema, creditCardIdSchema } from "./schemas";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function fieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

function revalidateFinancialViews() {
  revalidatePath("/credit-cards");
  revalidatePath("/accounts");
  revalidatePath("/movements");
  revalidatePath("/dashboard");
}

async function currencyFor(code: string) {
  const currencies = await listCurrencies();
  return currencies.find((currency) => currency.code === code.toUpperCase());
}

function parseRequiredAmount(value: string, currency: { code: string; decimals: number } | undefined) {
  const amount = currency ? parseMoney(value, currency) : null;
  return amount !== null && amount > 0 ? amount : null;
}

function parseOptionalAmount(value: string, currency: { code: string; decimals: number } | undefined) {
  if (!value.trim()) return null;
  const amount = currency ? parseMoney(value, currency) : null;
  return amount !== null && amount > 0 ? amount : null;
}

function parseNonNegativeAmount(value: string, currency: { code: string; decimals: number } | undefined) {
  if (!value.trim()) return 0;
  const amount = currency ? parseMoney(value, currency) : null;
  return amount !== null && amount >= 0 ? amount : null;
}

export async function openCreditCardAction(
  _previousState: CreditCardActionState,
  formData: FormData,
): Promise<CreditCardActionState> {
  await getMe();
  const parsed = creditCardFormSchema.safeParse({
    name: text(formData, "name"),
    institution: text(formData, "institution"),
    currencyCode: text(formData, "currencyCode"),
    creditLimit: text(formData, "creditLimit"),
    cutDay: text(formData, "cutDay"),
    paymentDueDay: text(formData, "paymentDueDay"),
    managementFee: text(formData, "managementFee"),
    openingDebt: text(formData, "openingDebt"),
    openingDebtDate: text(formData, "openingDebtDate"),
  });
  if (!parsed.success) return { status: "error", errorKey: "errorValidation", fieldErrors: fieldErrors(parsed.error) };

  const currency = await currencyFor(parsed.data.currencyCode);
  const creditLimit = parseRequiredAmount(parsed.data.creditLimit, currency);
  const managementFee = parseOptionalAmount(parsed.data.managementFee, currency);
  const openingDebt = parseOptionalAmount(parsed.data.openingDebt ?? "", currency);
  if (!currency || creditLimit === null || (parsed.data.managementFee.trim() && managementFee === null) || (parsed.data.openingDebt?.trim() && openingDebt === null)) {
    return { status: "error", errorKey: "errorInvalidAmount" };
  }

  const mutationError = await runCreditCardMutation(() => openCreditCard({
    name: parsed.data.name,
    currencyCode: currency.code,
    institution: parsed.data.institution || null,
    creditLimit,
    cutDay: parsed.data.cutDay,
    paymentDueDay: parsed.data.paymentDueDay,
    managementFee,
    ...(openingDebt !== null
      ? { openingDebt: { amount: openingDebt, occurredAt: parsed.data.openingDebtDate || new Date().toISOString().slice(0, 10) } }
      : {}),
  }));
  if (mutationError) return mutationError;
  revalidateFinancialViews();
  return { status: "success" };
}

export async function updateCreditCardAction(
  _previousState: CreditCardActionState,
  formData: FormData,
): Promise<CreditCardActionState> {
  await getMe();
  const accountId = text(formData, "accountId");
  const id = creditCardIdSchema.safeParse({ accountId });
  const parsed = creditCardFormSchema.safeParse({
    name: text(formData, "name"),
    institution: text(formData, "institution"),
    currencyCode: text(formData, "currencyCode"),
    creditLimit: text(formData, "creditLimit"),
    cutDay: text(formData, "cutDay"),
    paymentDueDay: text(formData, "paymentDueDay"),
    managementFee: text(formData, "managementFee"),
  });
  if (!id.success || !parsed.success) return { status: "error", errorKey: "errorValidation", fieldErrors: parsed.success ? undefined : fieldErrors(parsed.error) };
  const currency = await currencyFor(parsed.data.currencyCode);
  const creditLimit = parseRequiredAmount(parsed.data.creditLimit, currency);
  const managementFee = parseOptionalAmount(parsed.data.managementFee, currency);
  if (!currency || creditLimit === null || (parsed.data.managementFee.trim() && managementFee === null)) {
    return { status: "error", errorKey: "errorInvalidAmount" };
  }

  const mutationError = await runCreditCardMutation(() => updateCreditCard(accountId, {
    name: parsed.data.name,
    institution: parsed.data.institution || null,
    creditLimit,
    cutDay: parsed.data.cutDay,
    paymentDueDay: parsed.data.paymentDueDay,
    managementFee,
  }));
  if (mutationError) return mutationError;
  revalidateFinancialViews();
  return { status: "success" };
}

export async function adjustCreditCardBalanceAction(
  _previousState: CreditCardActionState,
  formData: FormData,
): Promise<CreditCardActionState> {
  await getMe();
  const parsed = adjustCardBalanceFormSchema.safeParse({
    accountId: text(formData, "accountId"),
    targetBalanceAmount: text(formData, "targetBalanceAmount"),
    targetBalanceDirection: text(formData, "targetBalanceDirection") || "out",
    occurredAt: text(formData, "occurredAt"),
  });
  if (!parsed.success) return { status: "error", errorKey: "errorValidation", fieldErrors: fieldErrors(parsed.error) };
  const currencyCode = text(formData, "currencyCode");
  const currency = await currencyFor(currencyCode);
  const amount = parseNonNegativeAmount(parsed.data.targetBalanceAmount, currency);
  if (!currency || amount === null) return { status: "error", errorKey: "errorInvalidAmount" };

  try {
    await adjustAccountBalance(parsed.data.accountId, {
      targetBalance: { amount, direction: amount === 0 ? "in" : parsed.data.targetBalanceDirection },
      occurredAt: parsed.data.occurredAt,
    });
  } catch (error) {
    return { status: "error", errorKey: apiErrorKey(error) };
  }
  revalidateFinancialViews();
  return { status: "success" };
}

export async function archiveCreditCardAction(
  _previousState: CreditCardActionState,
  formData: FormData,
): Promise<CreditCardActionState> {
  await getMe();
  const parsed = creditCardIdSchema.safeParse({ accountId: text(formData, "accountId") });
  if (!parsed.success) return { status: "error", errorKey: "errorValidation" };
  const mutationError = await runCreditCardMutation(() => archiveAccount(parsed.data.accountId));
  if (mutationError) return mutationError;
  revalidateFinancialViews();
  return { status: "success" };
}

export async function restoreCreditCardAction(
  _previousState: CreditCardActionState,
  formData: FormData,
): Promise<CreditCardActionState> {
  await getMe();
  const parsed = creditCardIdSchema.safeParse({ accountId: text(formData, "accountId") });
  if (!parsed.success) return { status: "error", errorKey: "errorValidation" };
  const mutationError = await runCreditCardMutation(() => restoreAccount(parsed.data.accountId));
  if (mutationError) return mutationError;
  revalidateFinancialViews();
  return { status: "success" };
}
