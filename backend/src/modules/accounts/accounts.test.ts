import path from "node:path";
import { eq } from "drizzle-orm";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../http/server.js";
import { createDb } from "../../infra/db/client.js";
import { user } from "../../infra/auth/auth.schema.js";
import { getOwnedActiveAccount } from "./accounts.service.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";

describe("accounts module", () => {
  let container: StartedPostgreSqlContainer;
  let database: ReturnType<typeof createDb>;
  let app: ReturnType<typeof buildServer>;
  let userACookie: string;
  let userBCookie: string;
  let userAAccountId: string;
  let userAActiveAccountId: string;
  let userAId: string;
  let userBId: string;
  let binanceUsdId: string;

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

    userACookie = await signUp("accounts-user-a@example.com", "User A");
    userBCookie = await signUp("accounts-user-b@example.com", "User B");
    userAId = (await database.db.query.user.findFirst({
      where: eq(user.email, "accounts-user-a@example.com"),
    }))!.id;
    userBId = (await database.db.query.user.findFirst({
      where: eq(user.email, "accounts-user-b@example.com"),
    }))!.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.close();
    await container?.stop();
  });

  it("supports currencies and strictly scoped account lifecycle", async () => {
    const unauthenticatedAccounts = await app.inject({
      method: "GET",
      url: "/api/accounts",
    });
    expect(unauthenticatedAccounts.statusCode).toBe(401);

    const unauthenticatedCurrencies = await app.inject({
      method: "GET",
      url: "/api/currencies",
    });
    expect(unauthenticatedCurrencies.statusCode).toBe(401);

    const currencies = await app.inject({
      method: "GET",
      url: "/api/currencies",
      headers: { cookie: userACookie },
    });
    expect(currencies.statusCode).toBe(200);
    expect(currencies.json()).toEqual([
      {
        code: "BTC",
        name: "Bitcoin",
        decimals: 8,
        kind: "crypto",
      },
      {
        code: "COP",
        name: "Peso colombiano",
        decimals: 2,
        kind: "fiat",
      },
      {
        code: "ETH",
        name: "Ethereum",
        decimals: 8,
        kind: "crypto",
      },
      {
        code: "SOL",
        name: "Solana",
        decimals: 9,
        kind: "crypto",
      },
      {
        code: "USD",
        name: "Dólar estadounidense",
        decimals: 2,
        kind: "fiat",
      },
      {
        code: "USDT",
        name: "Tether",
        decimals: 6,
        kind: "crypto",
      },
    ]);

    const create = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie: userACookie },
      payload: {
        name: "Bancolombia Ahorros",
        type: "bank",
        currencyCode: "COP",
        institution: "Bancolombia",
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({
      name: "Bancolombia Ahorros",
      type: "bank",
      currencyCode: "COP",
      institution: "Bancolombia",
      archived: false,
    });
    userAAccountId = create.json().id;

    const unknownCurrency = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie: userACookie },
      payload: {
        name: "Revolut",
        type: "bank",
        currencyCode: "EUR",
      },
    });
    expect(unknownCurrency.statusCode).toBe(400);
    expect(unknownCurrency.json().message).toContain("Unknown currency: EUR");

    const invalidType = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie: userACookie },
      payload: {
        name: "Algo",
        type: "wallet",
        currencyCode: "USD",
      },
    });
    expect(invalidType.statusCode).toBe(400);

    for (const name of ["Binance USD", "Binance BTC", "Binance ETH"]) {
      const cryptoAccount = await app.inject({
        method: "POST",
        url: "/api/accounts",
        headers: { cookie: userACookie },
        payload: {
          name,
          type: "crypto",
          currencyCode: "USD",
          institution: "Binance",
        },
      });
      expect(cryptoAccount.statusCode).toBe(201);
      expect(cryptoAccount.json()).toMatchObject({
        type: "crypto",
        currencyCode: "USD",
        institution: "Binance",
      });
      if (name === "Binance USD") binanceUsdId = cryptoAccount.json().id;
    }

    const btcAccount = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie: userACookie },
      payload: {
        name: "Binance BTC real",
        type: "crypto",
        currencyCode: "BTC",
        institution: "Binance",
      },
    });
    expect(btcAccount.statusCode).toBe(201);

    const purchase = await app.inject({
      method: "POST",
      url: "/api/transfers",
      headers: { cookie: userACookie },
      payload: {
        fromAccountId: binanceUsdId,
        toAccountId: btcAccount.json().id,
        amountFrom: 50_000,
        amountTo: 100_000_000,
        occurredAt: "2026-07-30",
      },
    });
    expect(purchase.statusCode).toBe(201);
    const balances = await app.inject({
      method: "GET",
      url: "/api/balances",
      headers: { cookie: userACookie },
    });
    expect(balances.statusCode).toBe(200);
    expect(balances.json()).toContainEqual({
      accountId: btcAccount.json().id,
      balance: 100_000_000,
    });

    const userBList = await app.inject({
      method: "GET",
      url: "/api/accounts",
      headers: { cookie: userBCookie },
    });
    expect(userBList.statusCode).toBe(200);
    expect(userBList.json()).toEqual([]);

    const userBUpdate = await app.inject({
      method: "PATCH",
      url: `/api/accounts/${userAAccountId}`,
      headers: { cookie: userBCookie },
      payload: { name: "Cuenta ajena" },
    });
    expect(userBUpdate.statusCode).toBe(404);

    const currencyUpdate = await app.inject({
      method: "PATCH",
      url: `/api/accounts/${userAAccountId}`,
      headers: { cookie: userACookie },
      payload: { currencyCode: "USD" },
    });
    expect(currencyUpdate.statusCode).toBe(400);

    const typeUpdate = await app.inject({
      method: "PATCH",
      url: `/api/accounts/${userAAccountId}`,
      headers: { cookie: userACookie },
      payload: { type: "cash" },
    });
    expect(typeUpdate.statusCode).toBe(400);

    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/accounts/${userAAccountId}`,
      headers: { cookie: userACookie },
      payload: { name: "Bancolombia Principal" },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({
      name: "Bancolombia Principal",
      type: "bank",
      currencyCode: "COP",
      institution: "Bancolombia",
    });

    const clearInstitution = await app.inject({
      method: "PATCH",
      url: `/api/accounts/${userAAccountId}`,
      headers: { cookie: userACookie },
      payload: { institution: null },
    });
    expect(clearInstitution.statusCode).toBe(200);
    expect(clearInstitution.json()).toMatchObject({
      name: "Bancolombia Principal",
      institution: null,
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie: userACookie },
      payload: {
        name: "Bancolombia Principal",
        type: "bank",
        currencyCode: "COP",
      },
    });
    expect(duplicate.statusCode).toBe(400);

    const archive = await app.inject({
      method: "DELETE",
      url: `/api/accounts/${userAAccountId}`,
      headers: { cookie: userACookie },
    });
    expect(archive.statusCode).toBe(204);

    const afterArchive = await app.inject({
      method: "GET",
      url: "/api/accounts",
      headers: { cookie: userACookie },
    });
    expect(afterArchive.statusCode).toBe(200);
    expect(
      afterArchive
        .json()
        .some((account: { id: string }) => account.id === userAAccountId),
    ).toBe(false);

    const recreate = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie: userACookie },
      payload: {
        name: "Bancolombia Principal",
        type: "bank",
        currencyCode: "COP",
      },
    });
    expect(recreate.statusCode).toBe(201);
    userAActiveAccountId = recreate.json().id;
  });

  it("exposes an owned active account lookup for other modules", async () => {
    const active = await getOwnedActiveAccount(
      database.db,
      userAId,
      userAActiveAccountId,
    );
    expect(active.currencyCode).toBe("COP");

    await expect(
      getOwnedActiveAccount(database.db, userBId, userAActiveAccountId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getOwnedActiveAccount(
        database.db,
        userAId,
        "00000000-0000-4000-8000-000000000099",
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getOwnedActiveAccount(database.db, userAId, userAAccountId),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("opens accounts with ledger balances and manages archived lifecycle", async () => {
    for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const invalid = await app.inject({
        method: "POST",
        url: "/api/accounts",
        headers: { cookie: userACookie },
        payload: {
          name: `Invalid opening ${String(amount)}`,
          type: "bank",
          currencyCode: "COP",
          openingBalance: { amount, direction: "in", occurredAt: "2026-08-02" },
        },
      });
      expect(invalid.statusCode).toBe(400);
    }

    const opening = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie: userACookie },
      payload: {
        name: "Cuenta con saldo inicial",
        type: "bank",
        currencyCode: "COP",
        openingBalance: {
          amount: 250_000,
          direction: "in",
          occurredAt: "2026-08-02",
        },
      },
    });
    expect(opening.statusCode).toBe(201);
    const accountId = opening.json().id as string;

    const movements = await app.inject({
      method: "GET",
      url: `/api/movements?accountId=${accountId}`,
      headers: { cookie: userACookie },
    });
    expect(movements.statusCode).toBe(200);
    expect(movements.json()).toHaveLength(1);
    expect(movements.json()[0]).toMatchObject({
      type: "adjustment_in",
      amount: 250_000,
      description: "Saldo inicial",
      occurredAt: "2026-08-02",
      source: "manual",
    });

    const balances = await app.inject({
      method: "GET",
      url: "/api/balances",
      headers: { cookie: userACookie },
    });
    expect(balances.json()).toContainEqual({ accountId, balance: 250_000 });

    const negativeOpening = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie: userACookie },
      payload: {
        name: "Cuenta sobregirada de prueba",
        type: "bank",
        currencyCode: "COP",
        openingBalance: {
          amount: 5_000,
          direction: "out",
          occurredAt: "2026-08-02",
        },
      },
    });
    expect(negativeOpening.statusCode).toBe(201);
    const negativeMovements = await app.inject({
      method: "GET",
      url: `/api/movements?accountId=${negativeOpening.json().id}`,
      headers: { cookie: userACookie },
    });
    expect(negativeMovements.json()).toContainEqual(
      expect.objectContaining({ type: "adjustment_out", amount: 5_000 }),
    );

    const adjusted = await app.inject({
      method: "POST",
      url: `/api/accounts/${accountId}/balance-adjustments`,
      headers: { cookie: userACookie },
      payload: {
        targetBalance: { amount: 70_000, direction: "in" },
        occurredAt: "2026-08-03",
      },
    });
    expect(adjusted.statusCode).toBe(201);
    expect(adjusted.json()).toMatchObject({
      type: "adjustment_out",
      amount: 180_000,
      description: "Ajuste manual de saldo",
    });

    const alreadyAtTarget = await app.inject({
      method: "POST",
      url: `/api/accounts/${accountId}/balance-adjustments`,
      headers: { cookie: userACookie },
      payload: {
        targetBalance: { amount: 70_000, direction: "in" },
        occurredAt: "2026-08-03",
      },
    });
    expect(alreadyAtTarget.statusCode).toBe(400);
    expect(alreadyAtTarget.json().error).toBe("ACCOUNT_ALREADY_AT_TARGET_BALANCE");

    const cannotArchive = await app.inject({
      method: "DELETE",
      url: `/api/accounts/${accountId}`,
      headers: { cookie: userACookie },
    });
    expect(cannotArchive.statusCode).toBe(400);
    expect(cannotArchive.json().error).toBe("ACCOUNT_BALANCE_NOT_ZERO");

    const zeroed = await app.inject({
      method: "POST",
      url: `/api/accounts/${accountId}/balance-adjustments`,
      headers: { cookie: userACookie },
      payload: {
        targetBalance: { amount: 0, direction: "in" },
        occurredAt: "2026-08-04",
      },
    });
    expect(zeroed.statusCode).toBe(201);
    expect(zeroed.json()).toMatchObject({ type: "adjustment_out", amount: 70_000 });

    const archived = await app.inject({
      method: "DELETE",
      url: `/api/accounts/${accountId}`,
      headers: { cookie: userACookie },
    });
    expect(archived.statusCode).toBe(204);

    const archivedList = await app.inject({
      method: "GET",
      url: "/api/accounts?status=archived",
      headers: { cookie: userACookie },
    });
    expect(archivedList.statusCode).toBe(200);
    expect(archivedList.json()).toContainEqual(expect.objectContaining({ id: accountId, archived: true }));

    const restored = await app.inject({
      method: "POST",
      url: `/api/accounts/${accountId}/restore`,
      headers: { cookie: userACookie },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ id: accountId, archived: false });

    const restoreAgain = await app.inject({
      method: "POST",
      url: `/api/accounts/${accountId}/restore`,
      headers: { cookie: userACookie },
    });
    expect(restoreAgain.statusCode).toBe(400);
    expect(restoreAgain.json().error).toBe("ACCOUNT_ALREADY_ACTIVE");

    const restoreConflictArchived = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie: userACookie },
      payload: {
        name: "Cuenta restauración conflictiva",
        type: "bank",
        currencyCode: "COP",
      },
    });
    expect(restoreConflictArchived.statusCode).toBe(201);
    const restoreConflictId = restoreConflictArchived.json().id as string;
    const archiveForRestoreConflict = await app.inject({
      method: "DELETE",
      url: `/api/accounts/${restoreConflictId}`,
      headers: { cookie: userACookie },
    });
    expect(archiveForRestoreConflict.statusCode).toBe(204);

    const activeRestoreConflict = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie: userACookie },
      payload: {
        name: "Cuenta restauración conflictiva",
        type: "bank",
        currencyCode: "COP",
      },
    });
    expect(activeRestoreConflict.statusCode).toBe(201);

    const restoreConflict = await app.inject({
      method: "POST",
      url: `/api/accounts/${restoreConflictId}/restore`,
      headers: { cookie: userACookie },
    });
    expect(restoreConflict.statusCode).toBe(400);
    expect(restoreConflict.json().error).toBe("ACCOUNT_NAME_CONFLICT");

    const concurrentName = "Cuenta nombre concurrente";
    const concurrentCreates = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: "POST",
          url: "/api/accounts",
          headers: { cookie: userACookie },
          payload: {
            name: concurrentName,
            type: "bank",
            currencyCode: "COP",
          },
        }),
      ),
    );
    expect(concurrentCreates.map((response) => response.statusCode).sort()).toEqual([201, 400]);

    const raceAccount = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie: userACookie },
      payload: {
        name: "Cuenta carrera de archivado",
        type: "bank",
        currencyCode: "COP",
      },
    });
    expect(raceAccount.statusCode).toBe(201);
    const raceAccountId = raceAccount.json().id as string;
    const [raceArchive, raceMovement] = await Promise.all([
      app.inject({
        method: "DELETE",
        url: `/api/accounts/${raceAccountId}`,
        headers: { cookie: userACookie },
      }),
      app.inject({
        method: "POST",
        url: "/api/movements",
        headers: { cookie: userACookie },
        payload: {
          accountId: raceAccountId,
          type: "adjustment_in",
          amount: 1,
          occurredAt: "2026-08-05",
        },
      }),
    ]);
    expect(raceArchive.statusCode === 204 && raceMovement.statusCode === 201).toBe(false);

    const invalidStatus = await app.inject({
      method: "GET",
      url: "/api/accounts?status=deleted",
      headers: { cookie: userACookie },
    });
    expect(invalidStatus.statusCode).toBe(400);
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
});
