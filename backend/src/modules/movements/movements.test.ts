import path from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../http/server.js";
import { createDb } from "../../infra/db/client.js";
import { eq } from "drizzle-orm";
import { user } from "../../infra/auth/auth.schema.js";
import { getAccountBalance } from "./movements.service.js";

const SYSTEM_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";

describe("movements module", () => {
  let container: StartedPostgreSqlContainer;
  let database: ReturnType<typeof createDb>;
  let app: ReturnType<typeof buildServer>;
  let userACookie: string;
  let userBCookie: string;
  let userAId: string;
  let userBId: string;
  let copAccountId: string;
  let copDestinationId: string;
  let usdAccountId: string;
  let archivedAccountId: string;
  let userBAccountId: string;
  let userACategoryId: string;
  let userBCategoryId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17")
      .withDatabase("app")
      .withUsername("app")
      .withPassword("app")
      .start();

    database = createDb(container.getConnectionUri());
    await migrate(database.db, {
      migrationsFolder: path.resolve("src/infra/db/migrations"),
    });

    app = buildServer({
      env: {
        NODE_ENV: "test",
        PORT: 3000,
        LOG_LEVEL: "error",
        DATABASE_URL: container.getConnectionUri(),
        BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
        BETTER_AUTH_URL: "http://localhost:3000",
        BETTER_AUTH_TRUSTED_ORIGINS: "",
      },
      db: database.db,
    });

    userACookie = await signUp("movements-user-a@example.com", "User A");
    userBCookie = await signUp("movements-user-b@example.com", "User B");
    userAId = (await database.db.query.user.findFirst({
      where: eq(user.email, "movements-user-a@example.com"),
    }))!.id;
    userBId = (await database.db.query.user.findFirst({
      where: eq(user.email, "movements-user-b@example.com"),
    }))!.id;

    copAccountId = await createAccount("Cuenta COP", "COP", userACookie);
    copDestinationId = await createAccount("Cuenta COP destino", "COP", userACookie);
    usdAccountId = await createAccount("Cuenta USD", "USD", userACookie);
    archivedAccountId = await createAccount("Cuenta archivada", "COP", userACookie);
    userBAccountId = await createAccount("Cuenta de User B", "COP", userBCookie);

    const archive = await app.inject({
      method: "DELETE",
      url: `/api/accounts/${archivedAccountId}`,
      headers: { cookie: userACookie },
    });
    expect(archive.statusCode).toBe(204);

    userACategoryId = await createCategory("Categoría propia", userACookie);
    userBCategoryId = await createCategory("Categoría ajena", userBCookie);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.close();
    await container?.stop();
  });

  it("handles the ledger, transfers, balances, filters, and scoping", async () => {
    for (const request of [
      { method: "GET" as const, url: "/api/movements" },
      {
        method: "POST" as const,
        url: "/api/movements",
        payload: {
          accountId: copAccountId,
          type: "expense",
          amount: 1,
          occurredAt: "2026-07-30",
        },
      },
      { method: "GET" as const, url: "/api/balances" },
      {
        method: "POST" as const,
        url: "/api/transfers",
        payload: {
          fromAccountId: copAccountId,
          toAccountId: copDestinationId,
          amountFrom: 1,
          occurredAt: "2026-07-30",
        },
      },
    ]) {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(401);
    }

    const expense = await app.inject({
      method: "POST",
      url: "/api/movements",
      headers: { cookie: userACookie },
      payload: {
        accountId: copAccountId,
        type: "expense",
        amount: 50_000,
        categoryId: SYSTEM_CATEGORY_ID,
        description: "Mercado semanal",
        occurredAt: "2026-07-30",
      },
    });
    expect(expense.statusCode).toBe(201);
    const expenseId = expense.json().id;
    expect(balance(await app.inject({ method: "GET", url: "/api/balances", headers: { cookie: userACookie } }), copAccountId)).toBe(-50_000);

    const income = await createMovement("income", 200_000, "2026-07-29");
    expect(income.statusCode).toBe(201);
    expect(await balanceFor(copAccountId)).toBe(150_000);

    const adjustment = await createMovement("adjustment_in", 1_000_000, "2026-07-01");
    expect(adjustment.statusCode).toBe(201);
    expect(await balanceFor(copAccountId)).toBe(1_150_000);

    for (const amount of [0, -1, 1.5]) {
      const invalid = await app.inject({
        method: "POST",
        url: "/api/movements",
        headers: { cookie: userACookie },
        payload: {
          accountId: copAccountId,
          type: "expense",
          amount,
          occurredAt: "2026-07-30",
        },
      });
      expect(invalid.statusCode).toBe(400);
    }
    for (const payload of [
      { type: "transfer_in", amount: 1, occurredAt: "2026-07-30" },
      { type: "expense", amount: 1, occurredAt: "30/07/2026" },
    ]) {
      const invalid = await app.inject({
        method: "POST",
        url: "/api/movements",
        headers: { cookie: userACookie },
        payload: { accountId: copAccountId, ...payload },
      });
      expect(invalid.statusCode).toBe(400);
    }

    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/movements",
          headers: { cookie: userACookie },
          payload: {
            accountId: userBAccountId,
            type: "expense",
            amount: 1,
            occurredAt: "2026-07-30",
          },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/movements",
          headers: { cookie: userACookie },
          payload: {
            accountId: archivedAccountId,
            type: "expense",
            amount: 1,
            occurredAt: "2026-07-30",
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/movements",
          headers: { cookie: userACookie },
          payload: {
            accountId: copAccountId,
            type: "expense",
            amount: 1,
            categoryId: userBCategoryId,
            occurredAt: "2026-07-30",
          },
        })
      ).statusCode,
    ).toBe(404);

    const sameCurrencyTransfer = await app.inject({
      method: "POST",
      url: "/api/transfers",
      headers: { cookie: userACookie },
      payload: {
        fromAccountId: copAccountId,
        toAccountId: copDestinationId,
        amountFrom: 100_000,
        feeAmount: 5_000,
        occurredAt: "2026-07-30",
      },
    });
    expect(sameCurrencyTransfer.statusCode).toBe(201);
    expect(sameCurrencyTransfer.json().movements).toHaveLength(3);
    const sameTransferId = sameCurrencyTransfer.json().id;
    expect(
      sameCurrencyTransfer.json().movements.every(
        (movement: { transferId: string }) => movement.transferId === sameTransferId,
      ),
    ).toBe(true);
    expect(
      sameCurrencyTransfer.json().movements.find(
        (movement: { type: string }) => movement.type === "expense",
      ).categoryId,
    ).toBe("00000000-0000-4000-8000-000000000010");
    expect(await balanceFor(copAccountId)).toBe(1_045_000);
    expect(await balanceFor(copDestinationId)).toBe(100_000);

    const fxTransfer = await app.inject({
      method: "POST",
      url: "/api/transfers",
      headers: { cookie: userACookie },
      payload: {
        fromAccountId: copAccountId,
        toAccountId: usdAccountId,
        amountFrom: 400_000,
        amountTo: 10_000,
        occurredAt: "2026-07-30",
      },
    });
    expect(fxTransfer.statusCode).toBe(201);
    const fxTransferId = fxTransfer.json().id;
    expect(await balanceFor(copAccountId)).toBe(645_000);
    expect(await balanceFor(usdAccountId)).toBe(10_000);

    for (const payload of [
      {
        fromAccountId: copAccountId,
        toAccountId: copAccountId,
        amountFrom: 1,
        occurredAt: "2026-07-30",
      },
      {
        fromAccountId: copAccountId,
        toAccountId: usdAccountId,
        amountFrom: 1,
        occurredAt: "2026-07-30",
      },
      {
        fromAccountId: copAccountId,
        toAccountId: copDestinationId,
        amountFrom: 1,
        amountTo: 2,
        occurredAt: "2026-07-30",
      },
    ]) {
      const invalid = await app.inject({
        method: "POST",
        url: "/api/transfers",
        headers: { cookie: userACookie },
        payload,
      });
      expect(invalid.statusCode).toBe(400);
    }

    const transferMovementId = fxTransfer.json().movements[0].id;
    const immutablePatch = await app.inject({
      method: "PATCH",
      url: `/api/movements/${transferMovementId}`,
      headers: { cookie: userACookie },
      payload: { amount: 1 },
    });
    expect(immutablePatch.statusCode).toBe(400);
    const immutableDelete = await app.inject({
      method: "DELETE",
      url: `/api/movements/${transferMovementId}`,
      headers: { cookie: userACookie },
    });
    expect(immutableDelete.statusCode).toBe(400);

    const deleteSameTransfer = await app.inject({
      method: "DELETE",
      url: `/api/transfers/${sameTransferId}`,
      headers: { cookie: userACookie },
    });
    expect(deleteSameTransfer.statusCode).toBe(204);
    expect(await balanceFor(copAccountId)).toBe(750_000);
    expect(await balanceFor(copDestinationId)).toBeUndefined();
    const remainingSameTransferMovements = await app.inject({
      method: "GET",
      url: `/api/movements?accountId=${copDestinationId}`,
      headers: { cookie: userACookie },
    });
    expect(remainingSameTransferMovements.json()).toEqual([]);

    const patchSimple = await app.inject({
      method: "PATCH",
      url: `/api/movements/${expenseId}`,
      headers: { cookie: userACookie },
      payload: { categoryId: userACategoryId },
    });
    expect(patchSimple.statusCode).toBe(200);
    const changeAmount = await app.inject({
      method: "PATCH",
      url: `/api/movements/${expenseId}`,
      headers: { cookie: userACookie },
      payload: { amount: 70_000 },
    });
    expect(changeAmount.statusCode).toBe(200);
    expect(await balanceFor(copAccountId)).toBe(730_000);

    const byAccount = await app.inject({
      method: "GET",
      url: `/api/movements?accountId=${copAccountId}`,
      headers: { cookie: userACookie },
    });
    expect(byAccount.statusCode).toBe(200);
    expect(byAccount.json().every((row: { accountId: string }) => row.accountId === copAccountId)).toBe(true);
    const byType = await app.inject({
      method: "GET",
      url: "/api/movements?type=expense",
      headers: { cookie: userACookie },
    });
    expect(byType.json()).toHaveLength(1);
    const byDate = await app.inject({
      method: "GET",
      url: "/api/movements?from=2026-07-29&to=2026-07-29",
      headers: { cookie: userACookie },
    });
    expect(byDate.json()).toHaveLength(1);
    const limited = await app.inject({
      method: "GET",
      url: `/api/movements?accountId=${copAccountId}&limit=1&offset=1`,
      headers: { cookie: userACookie },
    });
    expect(limited.json()).toHaveLength(1);

    const userBMovements = await app.inject({
      method: "GET",
      url: "/api/movements",
      headers: { cookie: userBCookie },
    });
    expect(userBMovements.statusCode).toBe(200);
    expect(userBMovements.json()).toEqual([]);
    const userBBalances = await app.inject({
      method: "GET",
      url: "/api/balances",
      headers: { cookie: userBCookie },
    });
    expect(userBBalances.json()).toEqual([]);
    const userBDelete = await app.inject({
      method: "DELETE",
      url: `/api/transfers/${fxTransferId}`,
      headers: { cookie: userBCookie },
    });
    expect(userBDelete.statusCode).toBe(404);

    const deleteFxTransfer = await app.inject({
      method: "DELETE",
      url: `/api/transfers/${fxTransferId}`,
      headers: { cookie: userACookie },
    });
    expect(deleteFxTransfer.statusCode).toBe(204);
    expect(await balanceFor(copAccountId)).toBe(1_130_000);
    expect(await balanceFor(usdAccountId)).toBeUndefined();
  });

  it("exposes a scoped balance for one account", async () => {
    expect(await getAccountBalance(database.db, userAId, copAccountId)).toBe(1_130_000);
    expect(await getAccountBalance(database.db, userAId, copDestinationId)).toBe(0);
    expect(await getAccountBalance(database.db, userBId, copAccountId)).toBe(0);
  });

  async function signUp(email: string, name: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: { email, password: "password1234", name },
    });
    expect([200, 201]).toContain(response.statusCode);
    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    return Array.isArray(setCookie) ? setCookie.join("; ") : setCookie!;
  }

  async function createAccount(name: string, currencyCode: string, cookie: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie },
      payload: { name, type: "bank", currencyCode },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  async function createCategory(name: string, cookie: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie },
      payload: { name },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  async function createMovement(type: string, amount: number, occurredAt: string) {
    return app.inject({
      method: "POST",
      url: "/api/movements",
      headers: { cookie: userACookie },
      payload: { accountId: copAccountId, type, amount, occurredAt },
    });
  }

  async function balanceFor(accountId: string): Promise<number | undefined> {
    const response = await app.inject({
      method: "GET",
      url: "/api/balances",
      headers: { cookie: userACookie },
    });
    return balance(response, accountId);
  }

  function balance(response: { json: () => unknown }, accountId: string) {
    const row = (response.json() as Array<{ accountId: string; balance: number }>).find(
      (value) => value.accountId === accountId,
    );
    return row?.balance;
  }
});
