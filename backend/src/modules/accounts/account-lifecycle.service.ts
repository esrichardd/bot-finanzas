import type { Database } from "../../infra/db/client.js";
import { getAccountBalance, createMovement } from "../movements/movements.service.js";
import {
  AccountBalanceNotZeroError,
} from "./accounts.errors.js";
import {
  archiveAccount,
  createAccount,
  lockOwnedActiveAccount,
} from "./accounts.service.js";
import type { OpenAccountInput } from "./accounts.types.js";

export async function openAccount(
  db: Database,
  userId: string,
  input: OpenAccountInput,
) {
  const { openingBalance, ...accountInput } = input;

  return db.transaction(async (tx) => {
    const account = await createAccount(tx, userId, accountInput);

    if (openingBalance) {
      await createMovement(tx, userId, {
        accountId: account.id,
        type:
          openingBalance.direction === "in"
            ? "adjustment_in"
            : "adjustment_out",
        amount: openingBalance.amount,
        categoryId: null,
        description: "Saldo inicial",
        occurredAt: openingBalance.occurredAt,
      });
    }

    return account;
  });
}

export async function archiveEmptyAccount(
  db: Database,
  userId: string,
  accountId: string,
) {
  return db.transaction(async (tx) => {
    await lockOwnedActiveAccount(tx, userId, accountId);
    const balance = await getAccountBalance(tx, userId, accountId);
    if (balance !== 0) {
      throw new AccountBalanceNotZeroError();
    }
    await archiveAccount(tx, userId, accountId);
  });
}
