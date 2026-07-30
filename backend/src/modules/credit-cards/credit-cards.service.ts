import { eq } from "drizzle-orm";
import type { Database } from "../../infra/db/client.js";
import { ownedBy, orThrow } from "../../shared/db-helpers.js";
import { ValidationError } from "../../shared/errors.js";
import { getOwnedActiveAccount } from "../accounts/accounts.service.js";
import { getAccountBalance } from "../movements/movements.service.js";
import { availableCredit, currentDebt, nextOccurrence } from "./credit-cards.calc.js";
import { creditCardDetails } from "./credit-cards.schema.js";
import type { UpsertCreditCardInput } from "./credit-cards.types.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getCreditCardAccount(
  db: Database,
  userId: string,
  accountId: string,
) {
  const account = await getOwnedActiveAccount(db, userId, accountId);
  if (account.type !== "credit_card") {
    throw new ValidationError("Account is not a credit card");
  }
  return account;
}

export async function upsertCreditCard(
  db: Database,
  userId: string,
  accountId: string,
  input: UpsertCreditCardInput,
) {
  await getCreditCardAccount(db, userId, accountId);
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
  await getCreditCardAccount(db, userId, accountId);
  const details = orThrow(
    await db.query.creditCardDetails.findFirst({
      where: eq(creditCardDetails.accountId, accountId),
    }),
    "credit card details",
  );
  const balance = await getAccountBalance(db, userId, accountId);
  const currentDate = today();

  return {
    accountId: details.accountId,
    creditLimit: details.creditLimit,
    cutDay: details.cutDay,
    paymentDueDay: details.paymentDueDay,
    managementFee: details.managementFee,
    balance,
    debt: currentDebt(balance),
    availableCredit: availableCredit(details.creditLimit, balance),
    nextCutDate: nextOccurrence(details.cutDay, currentDate),
    nextPaymentDueDate: nextOccurrence(details.paymentDueDay, currentDate),
  };
}
