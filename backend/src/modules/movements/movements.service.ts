import {
  and,
  desc,
  eq,
  gte,
  lte,
  type SQL,
} from "drizzle-orm";
import type { Database, DbExecutor } from "../../infra/db/client.js";
import {
  lockOwnedAccount,
  lockOwnedActiveAccount,
  getOwnedActiveAccount,
} from "../accounts/accounts.service.js";
import { getAccessibleCategory } from "../categories/categories.service.js";
import { ownedBy, orThrow } from "../../shared/db-helpers.js";
import { ValidationError } from "../../shared/errors.js";
import {
  computeBalance,
  computeBalanceAdjustment,
  computeTransferBreakdown,
  type TransferCalculationError,
  type MovementType,
} from "./movements.calc.js";
import {
  AccountAlreadyAtTargetBalanceError,
  TransferAmountOverflowError,
  TransferDestinationAmountRequiredError,
  TransferDestinationFeesExceedAmountError,
  TransferSameAccountError,
  TransferSameCurrencyAmountMismatchError,
  TransferSourceFeesExceedAmountError,
} from "./movements.errors.js";
import { movements, transfers } from "./movements.schema.js";
import type {
  CreateMovementInput,
  CreateTransferInput,
  AdjustAccountBalanceInput,
  ListMovementsQuery,
  UpdateMovementInput,
  LedgerQuery,
} from "./movements.types.js";

export const SYSTEM_FEE_CATEGORY_ID = "00000000-0000-4000-8000-000000000010";

type MovementRow = typeof movements.$inferSelect;

function toResponse(row: MovementRow) {
  return {
    id: row.id,
    accountId: row.accountId,
    type: row.type,
    amount: row.amount,
    categoryId: row.categoryId,
    transferId: row.transferId,
    description: row.description,
    occurredAt: row.occurredAt,
    source: row.source,
  };
}

/**
 * Inserts a movement after locking its account. Callers at the HTTP boundary
 * must wrap this function in a transaction so the lock covers the insert.
 */
export async function createMovement(
  db: DbExecutor,
  userId: string,
  input: CreateMovementInput,
) {
  await lockOwnedActiveAccount(db, userId, input.accountId);
  if (input.categoryId) {
    await getAccessibleCategory(db, userId, input.categoryId);
  }

  const [created] = await db
    .insert(movements)
    .values({
      userId,
      accountId: input.accountId,
      type: input.type,
      amount: input.amount,
      categoryId: input.categoryId ?? null,
      transferId: null,
      description: input.description ?? null,
      occurredAt: input.occurredAt,
      source: "manual",
    })
    .returning();
  return toResponse(orThrow(created, "movement"));
}

export async function listMovements(
  db: Database,
  userId: string,
  query: ListMovementsQuery,
) {
  const conditions: SQL[] = [ownedBy(movements.userId, userId)];
  if (query.accountId) conditions.push(eq(movements.accountId, query.accountId));
  if (query.type) conditions.push(eq(movements.type, query.type));
  if (query.categoryId) conditions.push(eq(movements.categoryId, query.categoryId));
  if (query.from) conditions.push(gte(movements.occurredAt, query.from));
  if (query.to) conditions.push(lte(movements.occurredAt, query.to));

  const rows = await db
    .select()
    .from(movements)
    .where(and(...conditions))
    .orderBy(desc(movements.occurredAt), desc(movements.createdAt))
    .limit(query.limit)
    .offset(query.offset);
  return rows.map(toResponse);
}

type LedgerGroup = { transferId: string | null; rows: MovementRow[] };

function includesText(value: string | null, query: string): boolean {
  return (value ?? "").toLocaleLowerCase().includes(query);
}

function matchesLedgerGroup(group: LedgerGroup, query: LedgerQuery): boolean {
  const first = group.rows[0];
  if (!first) return false;
  if (query.from && first.occurredAt < query.from) return false;
  if (query.to && first.occurredAt > query.to) return false;

  if (group.transferId === null) {
    const isKind = query.kind === "all"
      || (query.kind === "income" && first.type === "income")
      || (query.kind === "expense" && first.type === "expense")
      || (query.kind === "adjustment" && (first.type === "adjustment_in" || first.type === "adjustment_out"));
    if (!isKind) return false;
    if (query.accountId && first.accountId !== query.accountId) return false;
    if (query.categoryId && first.categoryId !== query.categoryId) return false;
    if (query.q && !includesText(first.description, query.q.toLocaleLowerCase())) return false;
    return true;
  }

  if (query.kind !== "all" && query.kind !== "transfer") return false;
  if (query.accountId && !group.rows.some((row) => row.accountId === query.accountId)) return false;
  if (query.categoryId && !group.rows.some((row) => row.categoryId === query.categoryId)) return false;
  if (query.q) {
    const text = query.q.toLocaleLowerCase();
    if (!group.rows.some((row) => includesText(row.description, text))) return false;
  }
  return true;
}

function toLedgerEntry(group: LedgerGroup) {
  const first = group.rows[0]!;
  if (group.transferId === null) {
    return {
      entryKind: "movement" as const,
      id: first.id,
      movementType: first.type as "income" | "expense" | "adjustment_in" | "adjustment_out",
      accountId: first.accountId,
      amount: first.amount,
      categoryId: first.categoryId,
      description: first.description,
      occurredAt: first.occurredAt,
      source: first.source,
    };
  }

  const principal = group.rows.find((row) => row.type === "transfer_out");
  const destination = group.rows.find((row) => row.type === "transfer_in");
  if (!principal || !destination) return null;
  const fees = group.rows
    .filter((row) => row.type === "expense")
    .map((row) => ({
      movementId: row.id,
      side: row.accountId === principal.accountId ? "source" as const : "destination" as const,
      accountId: row.accountId,
      amount: row.amount,
      categoryId: row.categoryId,
      description: row.description,
    }));
  const sourceFees = fees.filter((fee) => fee.side === "source").reduce((sum, fee) => sum + fee.amount, 0);
  const destinationFees = fees.filter((fee) => fee.side === "destination").reduce((sum, fee) => sum + fee.amount, 0);
  return {
    entryKind: "transfer" as const,
    id: group.transferId,
    fromAccountId: principal.accountId,
    toAccountId: destination.accountId,
    principalFrom: principal.amount,
    grossDestination: destination.amount,
    sourceTotalDebit: principal.amount + sourceFees,
    destinationNetCredit: destination.amount - destinationFees,
    description: principal.description,
    occurredAt: principal.occurredAt,
    source: principal.source,
    fees,
  };
}

export async function listLedger(
  db: Database,
  userId: string,
  query: LedgerQuery,
) {
  const rows = await db
    .select()
    .from(movements)
    .where(ownedBy(movements.userId, userId))
    .orderBy(desc(movements.occurredAt), desc(movements.createdAt));
  const groups = new Map<string, LedgerGroup>();
  for (const row of rows) {
    const key = row.transferId ?? row.id;
    const group = groups.get(key) ?? { transferId: row.transferId, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  const items = [...groups.values()]
    .filter((group) => matchesLedgerGroup(group, query))
    .map(toLedgerEntry)
    .filter((item): item is NonNullable<ReturnType<typeof toLedgerEntry>> => item !== null);
  return {
    items: items.slice(query.offset, query.offset + query.limit),
    total: items.length,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function updateMovement(
  db: Database,
  userId: string,
  movementId: string,
  input: UpdateMovementInput,
) {
  return db.transaction(async (tx) => {
    const movement = orThrow(
      await tx.query.movements.findFirst({
        where: ownedBy(movements.userId, userId, eq(movements.id, movementId)),
      }),
      "movement",
    );
    if (movement.transferId !== null) {
      throw new ValidationError("Transfer movements are edited via their transfer");
    }
    await lockOwnedAccount(tx, userId, movement.accountId);
    if (input.categoryId) {
      await getAccessibleCategory(tx, userId, input.categoryId);
    }

    const [updated] = await tx
      .update(movements)
      .set(input)
      .where(ownedBy(movements.userId, userId, eq(movements.id, movementId)))
      .returning();
    return toResponse(orThrow(updated, "movement"));
  });
}

export async function deleteMovement(
  db: Database,
  userId: string,
  movementId: string,
) {
  await db.transaction(async (tx) => {
    const movement = orThrow(
      await tx.query.movements.findFirst({
        where: ownedBy(movements.userId, userId, eq(movements.id, movementId)),
      }),
      "movement",
    );
    if (movement.transferId !== null) {
      throw new ValidationError("Transfer movements are deleted via DELETE /transfers/:id");
    }
    await lockOwnedAccount(tx, userId, movement.accountId);
    await tx
      .delete(movements)
      .where(ownedBy(movements.userId, userId, eq(movements.id, movementId)));
  });
}

export async function getBalances(db: Database, userId: string) {
  const rows = await db
    .select({ accountId: movements.accountId, type: movements.type, amount: movements.amount })
    .from(movements)
    .where(ownedBy(movements.userId, userId));
  const grouped = new Map<string, Array<{ type: MovementType; amount: number }>>();
  for (const row of rows) {
    const accountRows = grouped.get(row.accountId) ?? [];
    accountRows.push({ type: row.type, amount: row.amount });
    grouped.set(row.accountId, accountRows);
  }
  return [...grouped].map(([accountId, accountRows]) => ({
    accountId,
    balance: computeBalance(accountRows),
  }));
}

/** Balance de una cuenta del usuario (0 si no tiene movimientos). */
export async function getAccountBalance(
  db: DbExecutor,
  userId: string,
  accountId: string,
): Promise<number> {
  const rows = await db
    .select({ type: movements.type, amount: movements.amount })
    .from(movements)
    .where(ownedBy(movements.userId, userId, eq(movements.accountId, accountId)));
  return computeBalance(rows);
}

export async function adjustAccountBalance(
  db: Database,
  userId: string,
  accountId: string,
  input: AdjustAccountBalanceInput,
) {
  return db.transaction(async (tx) => {
    await lockOwnedActiveAccount(tx, userId, accountId);
    const currentBalance = await getAccountBalance(tx, userId, accountId);
    const targetBalance =
      input.targetBalance.amount === 0
        ? 0
        : input.targetBalance.direction === "in"
          ? input.targetBalance.amount
          : -input.targetBalance.amount;
    const adjustment = computeBalanceAdjustment(currentBalance, targetBalance);

    if (!adjustment) {
      throw new AccountAlreadyAtTargetBalanceError();
    }

    return createMovement(tx, userId, {
      accountId,
      type: adjustment.type,
      amount: adjustment.amount,
      categoryId: null,
      description: "Ajuste manual de saldo",
      occurredAt: input.occurredAt,
    });
  });
}

function mapTransferCalculationError(error: TransferCalculationError): never {
  switch (error.code) {
    case "TRANSFER_DESTINATION_AMOUNT_REQUIRED":
      throw new TransferDestinationAmountRequiredError();
    case "TRANSFER_SAME_CURRENCY_AMOUNT_MISMATCH":
      throw new TransferSameCurrencyAmountMismatchError();
    case "TRANSFER_SOURCE_FEES_EXCEED_AMOUNT":
      throw new TransferSourceFeesExceedAmountError();
    case "TRANSFER_DESTINATION_FEES_EXCEED_AMOUNT":
      throw new TransferDestinationFeesExceedAmountError();
    case "TRANSFER_AMOUNT_OVERFLOW":
      throw new TransferAmountOverflowError();
  }
}

type TransferAccountContext = {
  from: Awaited<ReturnType<typeof getOwnedActiveAccount>>;
  to: Awaited<ReturnType<typeof getOwnedActiveAccount>>;
  sameCurrency: boolean;
  breakdown: ReturnType<typeof computeTransferBreakdown>;
};

async function resolveTransferContext(
  db: DbExecutor,
  userId: string,
  input: CreateTransferInput,
  accounts?: {
    from: TransferAccountContext["from"];
    to: TransferAccountContext["to"];
  },
): Promise<TransferAccountContext> {
  if (input.fromAccountId === input.toAccountId) throw new TransferSameAccountError();
  const from = accounts?.from ?? await getOwnedActiveAccount(db, userId, input.fromAccountId);
  const to = accounts?.to ?? await getOwnedActiveAccount(db, userId, input.toAccountId);
  if (input.fees.length > 0) await getAccessibleCategory(db, userId, SYSTEM_FEE_CATEGORY_ID);
  const sameCurrency = from.currencyCode === to.currencyCode;
  let breakdown: ReturnType<typeof computeTransferBreakdown>;
  try {
    breakdown = computeTransferBreakdown({
      amountFrom: input.amountFrom,
      amountTo: input.amountTo,
      sameCurrency,
      fees: input.fees,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return mapTransferCalculationError(error as TransferCalculationError);
    }
    throw error;
  }
  return { from, to, sameCurrency, breakdown };
}

function breakdownResponse(context: TransferAccountContext, input: CreateTransferInput) {
  return {
    fromAccountId: context.from.id,
    toAccountId: context.to.id,
    sameCurrency: context.sameCurrency,
    ...context.breakdown,
    fees: input.fees.map((fee) => ({
      side: fee.side,
      mode: fee.mode,
      amount: fee.amount,
      description: fee.description ?? null,
    })),
  };
}

export async function previewTransfer(
  db: Database,
  userId: string,
  input: CreateTransferInput,
) {
  const context = await resolveTransferContext(db, userId, input);
  return breakdownResponse(context, input);
}

export async function createTransfer(
  db: Database,
  userId: string,
  input: CreateTransferInput,
) {
  return db.transaction(async (tx) => {
    const accountIds = [input.fromAccountId, input.toAccountId].sort();
    const lockedAccounts = new Map<
      string,
      Awaited<ReturnType<typeof lockOwnedActiveAccount>>
    >();
    for (const accountId of accountIds) {
      lockedAccounts.set(
        accountId,
        await lockOwnedActiveAccount(tx, userId, accountId),
      );
    }
    const from = lockedAccounts.get(input.fromAccountId)!;
    const to = lockedAccounts.get(input.toAccountId)!;
    const context = await resolveTransferContext(tx, userId, input, { from, to });

    const [transfer] = await tx.insert(transfers).values({ userId }).returning();
    const transferId = orThrow(transfer, "transfer").id;
    const base = {
      userId,
      transferId,
      occurredAt: input.occurredAt,
      description: input.description ?? null,
      source: "manual" as const,
    };
    const rows = [
      {
        ...base,
        accountId: from.id,
        type: "transfer_out" as const,
        amount: context.breakdown.principalFrom,
        categoryId: null,
      },
      ...input.fees
        .filter((fee) => fee.side === "source")
        .map((fee) => ({
          ...base,
          accountId: from.id,
          type: "expense" as const,
          amount: fee.amount,
          categoryId: SYSTEM_FEE_CATEGORY_ID,
          description: fee.description ?? null,
        })),
      {
        ...base,
        accountId: to.id,
        type: "transfer_in" as const,
        amount: context.breakdown.grossDestination,
        categoryId: null,
      },
      ...input.fees
        .filter((fee) => fee.side === "destination")
        .map((fee) => ({
          ...base,
          accountId: to.id,
          type: "expense" as const,
          amount: fee.amount,
          categoryId: SYSTEM_FEE_CATEGORY_ID,
          description: fee.description ?? null,
        })),
    ];
    const created = await tx.insert(movements).values(rows).returning();
    return {
      id: transferId,
      breakdown: breakdownResponse(context, input),
      movements: created.map(toResponse),
    };
  });
}

export async function deleteTransfer(
  db: Database,
  userId: string,
  transferId: string,
) {
  await db.transaction(async (tx) => {
    orThrow(
      await tx.query.transfers.findFirst({
        where: ownedBy(transfers.userId, userId, eq(transfers.id, transferId)),
      }),
      "transfer",
    );
    const movementRows = await tx
      .select({ accountId: movements.accountId })
      .from(movements)
      .where(ownedBy(movements.userId, userId, eq(movements.transferId, transferId)));
    for (const accountId of [...new Set(movementRows.map((row) => row.accountId))].sort()) {
      await lockOwnedAccount(tx, userId, accountId);
    }
    await tx
      .delete(movements)
      .where(ownedBy(movements.userId, userId, eq(movements.transferId, transferId)));
    await tx
      .delete(transfers)
      .where(ownedBy(transfers.userId, userId, eq(transfers.id, transferId)));
  });
}
