import {
  and,
  desc,
  eq,
  gte,
  lte,
  type SQL,
} from "drizzle-orm";
import type { Database } from "../../infra/db/client.js";
import { getOwnedActiveAccount } from "../accounts/accounts.service.js";
import { getAccessibleCategory } from "../categories/categories.service.js";
import { ownedBy, orThrow } from "../../shared/db-helpers.js";
import { ValidationError } from "../../shared/errors.js";
import { computeBalance, type MovementType } from "./movements.calc.js";
import { movements, transfers } from "./movements.schema.js";
import type {
  CreateMovementInput,
  CreateTransferInput,
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

export async function createMovement(
  db: Database,
  userId: string,
  input: CreateMovementInput,
) {
  await getOwnedActiveAccount(db, userId, input.accountId);
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
  const movement = orThrow(
    await db.query.movements.findFirst({
      where: ownedBy(movements.userId, userId, eq(movements.id, movementId)),
    }),
    "movement",
  );
  if (movement.transferId !== null) {
    throw new ValidationError("Transfer movements are edited via their transfer");
  }
  if (input.categoryId) {
    await getAccessibleCategory(db, userId, input.categoryId);
  }

  const [updated] = await db
    .update(movements)
    .set(input)
    .where(ownedBy(movements.userId, userId, eq(movements.id, movementId)))
    .returning();
  return toResponse(orThrow(updated, "movement"));
}

export async function deleteMovement(
  db: Database,
  userId: string,
  movementId: string,
) {
  const movement = orThrow(
    await db.query.movements.findFirst({
      where: ownedBy(movements.userId, userId, eq(movements.id, movementId)),
    }),
    "movement",
  );
  if (movement.transferId !== null) {
    throw new ValidationError("Transfer movements are deleted via DELETE /transfers/:id");
  }

  await db
    .delete(movements)
    .where(ownedBy(movements.userId, userId, eq(movements.id, movementId)));
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
  db: Database,
  userId: string,
  accountId: string,
): Promise<number> {
  const rows = await db
    .select({ type: movements.type, amount: movements.amount })
    .from(movements)
    .where(ownedBy(movements.userId, userId, eq(movements.accountId, accountId)));
  return computeBalance(rows);
}

export async function createTransfer(
  db: Database,
  userId: string,
  input: CreateTransferInput,
) {
  const from = await getOwnedActiveAccount(db, userId, input.fromAccountId);
  const to = await getOwnedActiveAccount(db, userId, input.toAccountId);

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

  const feeCategoryId = input.feeCategoryId ?? SYSTEM_FEE_CATEGORY_ID;
  if (input.feeAmount !== undefined) {
    await getAccessibleCategory(db, userId, feeCategoryId);
  }

  return db.transaction(async (tx) => {
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
  orThrow(
    await db.query.transfers.findFirst({
      where: ownedBy(transfers.userId, userId, eq(transfers.id, transferId)),
    }),
    "transfer",
  );

  await db.transaction(async (tx) => {
    await tx
      .delete(movements)
      .where(ownedBy(movements.userId, userId, eq(movements.transferId, transferId)));
    await tx
      .delete(transfers)
      .where(ownedBy(transfers.userId, userId, eq(transfers.id, transferId)));
  });
}
