"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getMe } from "../../lib/api/users";
import { listAccounts, listCurrencies } from "../../lib/api/accounts";
import {
  createMovement,
  createTransfer,
  deleteMovement,
  deleteTransfer,
  previewTransfer,
  updateMovement,
  type CreateTransferPayload,
  type TransferFee,
} from "../../lib/api/movements";
import { parseMoney } from "../../lib/money";
import { apiErrorKey, runMovementMutation } from "./action-helpers";
import type { MovementActionState } from "./action-state";
import { editMovementFormSchema, movementFormSchema, movementIdSchema, transferFormSchema, transferIdSchema } from "./schemas";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function fieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

function revalidateLedger() {
  revalidatePath("/movements");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

async function getAccountContext(accountId: string) {
  const [accounts, currencies] = await Promise.all([listAccounts("active"), listCurrencies()]);
  const account = accounts.find((item) => item.id === accountId);
  const currency = currencies.find((item) => item.code === account?.currencyCode);
  return { account, currency };
}

function parseAmount(value: string, currency: { code: string; decimals: number } | undefined) {
  return currency ? parseMoney(value, currency) : null;
}

export async function createMovementAction(_previous: MovementActionState, formData: FormData): Promise<MovementActionState> {
  await getMe();
  const parsed = movementFormSchema.safeParse({
    accountId: text(formData, "accountId"), type: text(formData, "type"), amount: text(formData, "amount"),
    categoryId: text(formData, "categoryId") || null, description: text(formData, "description"), occurredAt: text(formData, "occurredAt"),
  });
  if (!parsed.success) return { status: "error", errorKey: "errorValidation", fieldErrors: fieldErrors(parsed.error) };
  const { account, currency } = await getAccountContext(parsed.data.accountId);
  const amount = parseAmount(parsed.data.amount, currency);
  if (!account || !currency || amount === null || amount <= 0) return { status: "error", errorKey: "errorInvalidAmount" };
  const mutationError = await runMovementMutation(() => createMovement({
    accountId: account.id, type: parsed.data.type, amount, categoryId: parsed.data.categoryId,
    description: parsed.data.description || null, occurredAt: parsed.data.occurredAt,
  }));
  if (mutationError) return mutationError;
  revalidateLedger();
  return { status: "success" };
}

export async function updateMovementAction(_previous: MovementActionState, formData: FormData): Promise<MovementActionState> {
  await getMe();
  const parsed = editMovementFormSchema.safeParse({ amount: text(formData, "amount"), categoryId: text(formData, "categoryId") || null, description: text(formData, "description"), occurredAt: text(formData, "occurredAt") });
  const movementId = movementIdSchema.safeParse({ movementId: text(formData, "movementId") });
  if (!parsed.success || !movementId.success) return { status: "error", errorKey: "errorValidation" };
  const { account, currency } = await getAccountContext(text(formData, "accountId"));
  const amount = parseAmount(parsed.data.amount, currency);
  if (!account || !currency || amount === null || amount <= 0) return { status: "error", errorKey: "errorInvalidAmount" };
  const mutationError = await runMovementMutation(() => updateMovement(movementId.data.movementId, { amount, categoryId: parsed.data.categoryId, description: parsed.data.description || null, occurredAt: parsed.data.occurredAt }));
  if (mutationError) return mutationError;
  revalidateLedger();
  return { status: "success" };
}

function parseFees(raw: string, sourceCurrency: { code: string; decimals: number }, destinationCurrency: { code: string; decimals: number }): TransferFee[] | null {
  let rows: Array<{ side: "source" | "destination"; mode: "deducted_from_amount" | "charged_additionally" | "deducted_from_received"; amount: string; description?: string }>;
  try { rows = JSON.parse(raw) as typeof rows; } catch { return null; }
  if (!Array.isArray(rows) || rows.length > 10) return null;
  const fees: TransferFee[] = [];
  for (const row of rows) {
    const currency = row.side === "source" ? sourceCurrency : destinationCurrency;
    const amount = parseAmount(row.amount, currency);
    if (!amount || amount <= 0) return null;
    if (row.side === "source" && (row.mode === "deducted_from_amount" || row.mode === "charged_additionally")) fees.push({ side: row.side, mode: row.mode, amount, description: row.description?.trim() || null });
    else if (row.side === "destination" && row.mode === "deducted_from_received") fees.push({ side: row.side, mode: row.mode, amount, description: row.description?.trim() || null });
    else return null;
  }
  return fees;
}

async function transferPayload(formData: FormData): Promise<{ payload: CreateTransferPayload; errorKey?: string }> {
  const parsed = transferFormSchema.safeParse({
    fromAccountId: text(formData, "fromAccountId"), toAccountId: text(formData, "toAccountId"), amountFrom: text(formData, "amountFrom"), amountTo: text(formData, "amountTo"), fees: text(formData, "fees"), description: text(formData, "description"), occurredAt: text(formData, "occurredAt"),
  });
  if (!parsed.success) return { payload: {} as CreateTransferPayload, errorKey: "errorValidation" };
  const [from, to] = await Promise.all([getAccountContext(parsed.data.fromAccountId), getAccountContext(parsed.data.toAccountId)]);
  if (!from.account || !to.account || !from.currency || !to.currency) return { payload: {} as CreateTransferPayload, errorKey: "errorAccountUnavailable" };
  const amountFrom = parseAmount(parsed.data.amountFrom, from.currency);
  const amountTo = parsed.data.amountTo.trim() ? parseAmount(parsed.data.amountTo, to.currency) : null;
  const fees = parseFees(parsed.data.fees, from.currency, to.currency);
  if (amountFrom === null || amountFrom <= 0 || (parsed.data.amountTo.trim() && (amountTo === null || amountTo <= 0)) || fees === null) return { payload: {} as CreateTransferPayload, errorKey: "errorInvalidAmount" };
  return { payload: { fromAccountId: from.account.id, toAccountId: to.account.id, amountFrom, ...(amountTo !== null ? { amountTo } : {}), fees, description: parsed.data.description || null, occurredAt: parsed.data.occurredAt } };
}

export async function previewTransferAction(_previous: MovementActionState, formData: FormData): Promise<MovementActionState> {
  await getMe();
  const { payload, errorKey } = await transferPayload(formData);
  if (errorKey) return { status: "error", errorKey };
  try {
    const preview = await previewTransfer(payload);
    return { status: "preview", preview, payload };
  } catch (error) {
    return { status: "error", errorKey: apiErrorKey(error) };
  }
}

export async function createTransferAction(_previous: MovementActionState, formData: FormData): Promise<MovementActionState> {
  await getMe();
  let payload: CreateTransferPayload;
  try { payload = JSON.parse(text(formData, "payload")) as CreateTransferPayload; } catch { return { status: "error", errorKey: "errorValidation" }; }
  const mutationError = await runMovementMutation(() => createTransfer(payload));
  if (mutationError) return mutationError;
  revalidateLedger();
  return { status: "success" };
}

export async function deleteMovementAction(_previous: MovementActionState, formData: FormData): Promise<MovementActionState> {
  await getMe();
  const parsed = movementIdSchema.safeParse({ movementId: text(formData, "movementId") });
  if (!parsed.success) return { status: "error", errorKey: "errorValidation" };
  const mutationError = await runMovementMutation(() => deleteMovement(parsed.data.movementId));
  if (mutationError) return mutationError;
  revalidateLedger();
  return { status: "success" };
}

export async function deleteTransferAction(_previous: MovementActionState, formData: FormData): Promise<MovementActionState> {
  await getMe();
  const parsed = transferIdSchema.safeParse({ transferId: text(formData, "transferId") });
  if (!parsed.success) return { status: "error", errorKey: "errorValidation" };
  const mutationError = await runMovementMutation(() => deleteTransfer(parsed.data.transferId));
  if (mutationError) return mutationError;
  revalidateLedger();
  return { status: "success" };
}
