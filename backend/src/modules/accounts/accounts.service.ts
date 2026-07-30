import { eq } from "drizzle-orm";
import type { Database } from "../../infra/db/client.js";
import { ownedBy, orThrow } from "../../shared/db-helpers.js";
import { ValidationError } from "../../shared/errors.js";
import { accounts, currencies } from "./accounts.schema.js";
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

export async function listCurrencies(db: Database) {
  return db.select().from(currencies).orderBy(currencies.code);
}

export async function listAccounts(db: Database, userId: string) {
  const rows = await db
    .select()
    .from(accounts)
    .where(ownedBy(accounts.userId, userId, eq(accounts.archived, false)))
    .orderBy(accounts.name);
  return rows.map(toResponse);
}

export async function createAccount(
  db: Database,
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
    throw new ValidationError("An account with that name already exists");
  }

  const [created] = await db
    .insert(accounts)
    .values({
      userId,
      name: input.name,
      type: input.type,
      currencyCode: input.currencyCode,
      institution: input.institution ?? null,
    })
    .returning();
  return toResponse(created!);
}

export async function updateAccount(
  db: Database,
  userId: string,
  accountId: string,
  input: UpdateAccountInput,
) {
  const [updated] = await db
    .update(accounts)
    .set(input)
    .where(ownedBy(accounts.userId, userId, eq(accounts.id, accountId)))
    .returning();
  return toResponse(orThrow(updated, "account"));
}

export async function archiveAccount(
  db: Database,
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
