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
} from "../accounts/accounts.service.js";
import { getAccessibleCategory } from "../categories/categories.service.js";
import { ownedBy, orThrow } from "../../shared/db-helpers.js";
import { ValidationError } from "../../shared/errors.js";
import {
  computeBalance,
  computeBalanceAdjustment,
  type MovementType,
} from "./movements.calc.js";
import { AccountAlreadyAtTargetBalanceError } from "./movements.errors.js";
import { movements, transfers } from "./movements.schema.js";
import type {
  CreateMovementInput,
  CreateTransferInput,
  AdjustAccountBalanceInput,
  ListMovementsQuery,
  UpdateMovementInput,
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

export async function createTransfer(
  db: Database,
  userId: string,
  input: CreateTransferInput,
) {
  const feeCategoryId = input.feeCategoryId ?? SYSTEM_FEE_CATEGORY_ID;

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
    const sameCurrency = from.currencyCode === to.currencyCode;
    let amountTo: number;
    if (sameCurrency) {
      if (input.amountTo !== undefined && input.amountTo !== input.amountFrom) {
        throw new ValidationError(
          "Same-currency transfers must have equal amounts; model differences as fee",
        );
      }
      amountTo = input.amountFrom;
    } else {
      if (input.amountTo === undefined) {
        throw new ValidationError("amountTo is required for cross-currency transfers");
      }
      amountTo = input.amountTo;
    }

    if (input.feeAmount !== undefined) {
      await getAccessibleCategory(tx, userId, feeCategoryId);
    }

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
        amount: input.amountFrom,
        categoryId: null,
      },
      {
        ...base,
        accountId: to.id,
        type: "transfer_in" as const,
        amount: amountTo,
        categoryId: null,
      },
      ...(input.feeAmount !== undefined
        ? [
            {
              ...base,
              accountId: from.id,
              type: "expense" as const,
              amount: input.feeAmount,
              categoryId: feeCategoryId,
            },
          ]
        : []),
    ];
    const created = await tx.insert(movements).values(rows).returning();
    return { id: transferId, movements: created.map(toResponse) };
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
