import { eq } from "drizzle-orm";
import type { Database, DbExecutor } from "../../infra/db/client.js";
import { ownedBy, orThrow } from "../../shared/db-helpers.js";
import { ValidationError } from "../../shared/errors.js";
import { accounts, currencies } from "./accounts.schema.js";
import {
  AccountAlreadyActiveError,
  AccountNameConflictError,
} from "./accounts.errors.js";
import type {
  CreateAccountInput,
  UpdateAccountInput,
} from "./accounts.types.js";

function toResponse(row: typeof accounts.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currencyCode: row.currencyCode,
    institution: row.institution,
    archived: row.archived,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function listCurrencies(db: Database) {
  return db.select().from(currencies).orderBy(currencies.code);
}

export async function listAccounts(
  db: Database,
  userId: string,
  status: "active" | "archived" = "active",
) {
  const rows = await db
    .select()
    .from(accounts)
    .where(
      ownedBy(
        accounts.userId,
        userId,
        eq(accounts.archived, status === "archived"),
      ),
    )
    .orderBy(accounts.name);
  return rows.map(toResponse);
}

/** Cuenta del usuario, activa o archivada. */
export async function getOwnedAccount(
  db: DbExecutor,
  userId: string,
  accountId: string,
) {
  return orThrow(
    await db.query.accounts.findFirst({
      where: ownedBy(accounts.userId, userId, eq(accounts.id, accountId)),
    }),
    "account",
  );
}

/** Cuenta del usuario, activa. Lanza ValidationError si está archivada. */
export async function getOwnedActiveAccount(
  db: DbExecutor,
  userId: string,
  accountId: string,
) {
  const account = await getOwnedAccount(db, userId, accountId);
  if (account.archived) {
    throw new ValidationError("Account is archived");
  }
  return account;
}

export async function lockOwnedAccount(
  db: DbExecutor,
  userId: string,
  accountId: string,
) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(ownedBy(accounts.userId, userId, eq(accounts.id, accountId)))
    .for("update")
    .limit(1);
  return orThrow(account, "account");
}

export async function lockOwnedActiveAccount(
  db: DbExecutor,
  userId: string,
  accountId: string,
) {
  const account = await lockOwnedAccount(db, userId, accountId);
  if (account.archived) {
    throw new ValidationError("Account is archived");
  }
  return account;
}

export async function createAccount(
  db: DbExecutor,
  userId: string,
  input: CreateAccountInput,
) {
  const currency = await db.query.currencies.findFirst({
    where: eq(currencies.code, input.currencyCode),
  });
  if (!currency) {
    throw new ValidationError(`Unknown currency: ${input.currencyCode}`);
  }

  const duplicate = await db.query.accounts.findFirst({
    where: ownedBy(
      accounts.userId,
      userId,
      eq(accounts.name, input.name),
      eq(accounts.archived, false),
    ),
  });
  if (duplicate) {
    throw new AccountNameConflictError();
  }

  let created: typeof accounts.$inferSelect | undefined;
  try {
    [created] = await db
      .insert(accounts)
      .values({
        userId,
        name: input.name,
        type: input.type,
        currencyCode: input.currencyCode,
        institution: input.institution ?? null,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) throw new AccountNameConflictError();
    throw error;
  }
  return toResponse(created!);
}

export async function updateAccount(
  db: DbExecutor,
  userId: string,
  accountId: string,
  input: UpdateAccountInput,
) {
  if (input.name !== undefined) {
    const duplicate = await db.query.accounts.findFirst({
      where: ownedBy(
        accounts.userId,
        userId,
        eq(accounts.name, input.name),
        eq(accounts.archived, false),
      ),
    });
    if (duplicate && duplicate.id !== accountId) {
      throw new AccountNameConflictError();
    }
  }

  let updated: typeof accounts.$inferSelect | undefined;
  try {
    [updated] = await db
      .update(accounts)
      .set(input)
      .where(ownedBy(accounts.userId, userId, eq(accounts.id, accountId)))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) throw new AccountNameConflictError();
    throw error;
  }
  return toResponse(orThrow(updated, "account"));
}

export async function archiveAccount(
  db: DbExecutor,
  userId: string,
  accountId: string,
) {
  const [archived] = await db
    .update(accounts)
    .set({ archived: true })
    .where(ownedBy(accounts.userId, userId, eq(accounts.id, accountId)))
    .returning();
  orThrow(archived, "account");
}

export async function restoreAccount(
  db: Database,
  userId: string,
  accountId: string,
) {
  const account = orThrow(
    await db.query.accounts.findFirst({
      where: ownedBy(accounts.userId, userId, eq(accounts.id, accountId)),
    }),
    "account",
  );
  if (!account.archived) {
    throw new AccountAlreadyActiveError();
  }

  const duplicate = await db.query.accounts.findFirst({
    where: ownedBy(
      accounts.userId,
      userId,
      eq(accounts.name, account.name),
      eq(accounts.archived, false),
    ),
  });
  if (duplicate) {
    throw new AccountNameConflictError();
  }

  let restored: typeof accounts.$inferSelect | undefined;
  try {
    [restored] = await db
      .update(accounts)
      .set({ archived: false })
      .where(ownedBy(accounts.userId, userId, eq(accounts.id, accountId)))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) throw new AccountNameConflictError();
    throw error;
  }
  return toResponse(orThrow(restored, "account"));
}
