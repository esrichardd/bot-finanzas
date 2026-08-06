import { eq, inArray } from "drizzle-orm";
import type { Database, DbExecutor } from "../../infra/db/client.js";
import { orThrow } from "../../shared/db-helpers.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";
import {
  createAccount,
  getOwnedAccount,
  getOwnedActiveAccount,
  listAccounts,
  updateAccount,
} from "../accounts/accounts.service.js";
import { getAccountBalance, getBalances, createMovement } from "../movements/movements.service.js";
import { creditCardDetails } from "./credit-cards.schema.js";
import {
  availableCredit,
  creditBalance,
  creditUtilization,
  currentDebt,
  nextOccurrence,
} from "./credit-cards.calc.js";
import type {
  OpenCreditCardInput,
  UpdateCreditCardInput,
  UpsertCreditCardInput,
} from "./credit-cards.types.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function assertCreditCard(account: { type: string }) {
  if (account.type !== "credit_card") {
    throw new ValidationError("Account is not a credit card");
  }
}

type CreditCardAccount = {
  id: string;
  name: string;
  type: "credit_card";
  currencyCode: string;
  institution: string | null;
  archived: boolean;
};

type CreditCardDetails = typeof creditCardDetails.$inferSelect;

function composeCreditCard(
  account: CreditCardAccount,
  details: CreditCardDetails | null,
  balance: number,
  currentDate: string,
) {
  if (!details) {
    return { configured: false as const, account, balance };
  }

  const debt = currentDebt(balance);
  return {
    configured: true as const,
    account,
    creditLimit: details.creditLimit,
    cutDay: details.cutDay,
    paymentDueDay: details.paymentDueDay,
    managementFee: details.managementFee,
    balance,
    debt,
    creditBalance: creditBalance(balance),
    availableCredit: availableCredit(details.creditLimit, balance),
    utilizationPercentage: creditUtilization(debt, details.creditLimit),
    nextCutDate: nextOccurrence(details.cutDay, currentDate),
    nextPaymentDueDate: nextOccurrence(details.paymentDueDay, currentDate),
  };
}

function toLegacyResponse(card: ReturnType<typeof composeCreditCard>) {
  if (!card.configured) throw new NotFoundError("Credit card details");
  return {
    accountId: card.account.id,
    creditLimit: card.creditLimit,
    cutDay: card.cutDay,
    paymentDueDay: card.paymentDueDay,
    managementFee: card.managementFee,
    balance: card.balance,
    debt: card.debt,
    availableCredit: card.availableCredit,
    nextCutDate: card.nextCutDate,
    nextPaymentDueDate: card.nextPaymentDueDate,
  };
}

async function findDetails(db: DbExecutor, accountId: string) {
  return db.query.creditCardDetails.findFirst({
    where: eq(creditCardDetails.accountId, accountId),
  });
}

export async function listCreditCards(
  db: Database,
  userId: string,
  status: "active" | "archived" = "active",
) {
  const accounts = (await listAccounts(db, userId, status)).filter(
    (account): account is CreditCardAccount => account.type === "credit_card",
  );
  const balances = await getBalances(db, userId);
  const balanceByAccount = new Map(balances.map((item) => [item.accountId, item.balance]));
  const ids = accounts.map((account) => account.id);
  const detailsRows = ids.length === 0
    ? []
    : await db.select().from(creditCardDetails).where(inArray(creditCardDetails.accountId, ids));
  const detailsByAccount = new Map(detailsRows.map((details) => [details.accountId, details]));
  const currentDate = today();

  return accounts
    .map((account) => composeCreditCard(
      account,
      detailsByAccount.get(account.id) ?? null,
      balanceByAccount.get(account.id) ?? 0,
      currentDate,
    ))
    .sort((a, b) => a.account.name.localeCompare(b.account.name));
}

export async function openCreditCard(
  db: Database,
  userId: string,
  input: OpenCreditCardInput,
) {
  return db.transaction(async (tx) => {
    const account = await createAccount(tx, userId, {
      name: input.name,
      type: "credit_card",
      currencyCode: input.currencyCode,
      institution: input.institution ?? null,
    });
    const [details] = await tx
      .insert(creditCardDetails)
      .values({
        accountId: account.id,
        creditLimit: input.creditLimit,
        cutDay: input.cutDay,
        paymentDueDay: input.paymentDueDay,
        managementFee: input.managementFee ?? null,
      })
      .returning();
    const openingDebt = input.openingDebt;
    if (openingDebt && openingDebt.amount > 0) {
      await createMovement(tx, userId, {
        accountId: account.id,
        type: "adjustment_out",
        amount: openingDebt.amount,
        categoryId: null,
        description: "Deuda inicial",
        occurredAt: openingDebt.occurredAt,
      });
    }
    const card = composeCreditCard(
      account as CreditCardAccount,
      orThrow(details, "credit card details"),
      -(openingDebt?.amount ?? 0),
      today(),
    );
    if (!card.configured) throw new ValidationError("Credit card details are incomplete");
    return card;
  });
}

export async function updateCreditCard(
  db: Database,
  userId: string,
  accountId: string,
  input: UpdateCreditCardInput,
) {
  return db.transaction(async (tx) => {
    const current = await getOwnedActiveAccount(tx, userId, accountId);
    assertCreditCard(current);
    const account = await updateAccount(tx, userId, accountId, {
      name: input.name,
      institution: input.institution,
    });
    const [details] = await tx
      .insert(creditCardDetails)
      .values({
        accountId,
        creditLimit: input.creditLimit,
        cutDay: input.cutDay,
        paymentDueDay: input.paymentDueDay,
        managementFee: input.managementFee ?? null,
      })
      .onConflictDoUpdate({
        target: creditCardDetails.accountId,
        set: {
          creditLimit: input.creditLimit,
          cutDay: input.cutDay,
          paymentDueDay: input.paymentDueDay,
          managementFee: input.managementFee ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    const balance = await getAccountBalance(tx, userId, accountId);
    const card = composeCreditCard(
      account as CreditCardAccount,
      orThrow(details, "credit card details"),
      balance,
      today(),
    );
    if (!card.configured) throw new ValidationError("Credit card details are incomplete");
    return card;
  });
}

export async function upsertCreditCard(
  db: Database,
  userId: string,
  accountId: string,
  input: UpsertCreditCardInput,
) {
  const account = await getOwnedActiveAccount(db, userId, accountId);
  assertCreditCard(account);
  await db
    .insert(creditCardDetails)
    .values({
      accountId,
      creditLimit: input.creditLimit,
      cutDay: input.cutDay,
      paymentDueDay: input.paymentDueDay,
      managementFee: input.managementFee ?? null,
    })
    .onConflictDoUpdate({
      target: creditCardDetails.accountId,
      set: {
        creditLimit: input.creditLimit,
        cutDay: input.cutDay,
        paymentDueDay: input.paymentDueDay,
        managementFee: input.managementFee ?? null,
        updatedAt: new Date(),
      },
    });
  return getCreditCard(db, userId, accountId);
}

export async function getCreditCard(
  db: Database,
  userId: string,
  accountId: string,
) {
  const account = await getOwnedAccount(db, userId, accountId);
  assertCreditCard(account);
  const details = await findDetails(db, accountId);
  const balance = await getAccountBalance(db, userId, accountId);
  return toLegacyResponse(composeCreditCard(
    account as CreditCardAccount,
    details ?? null,
    balance,
    today(),
  ));
}
