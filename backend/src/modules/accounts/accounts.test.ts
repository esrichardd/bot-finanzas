import path from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../http/server.js";
import { createDb } from "../../infra/db/client.js";

describe("accounts module", () => {
  let container: StartedPostgreSqlContainer;
  let database: ReturnType<typeof createDb>;
  let app: ReturnType<typeof buildServer>;
  let userACookie: string;
  let userBCookie: string;
  let userAAccountId: string;

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
      },
      db: database.db,
    });

    userACookie = await signUp("accounts-user-a@example.com", "User A");
    userBCookie = await signUp("accounts-user-b@example.com", "User B");
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.close();
    await container?.stop();
  });

  it("supports currencies and strictly scoped account lifecycle", async () => {
    const unauthenticatedAccounts = await app.inject({
      method: "GET",
      url: "/accounts",
    });
    expect(unauthenticatedAccounts.statusCode).toBe(401);

    const unauthenticatedCurrencies = await app.inject({
      method: "GET",
      url: "/currencies",
    });
    expect(unauthenticatedCurrencies.statusCode).toBe(401);

    const currencies = await app.inject({
      method: "GET",
      url: "/currencies",
      headers: { cookie: userACookie },
    });
    expect(currencies.statusCode).toBe(200);
    expect(currencies.json()).toEqual([
      {
        code: "COP",
        name: "Peso colombiano",
        decimals: 2,
        kind: "fiat",
      },
      {
        code: "USD",
        name: "Dólar estadounidense",
        decimals: 2,
        kind: "fiat",
      },
    ]);

    const create = await app.inject({
      method: "POST",
      url: "/accounts",
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
      url: "/accounts",
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
      url: "/accounts",
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
        url: "/accounts",
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
    }

    const userBList = await app.inject({
      method: "GET",
      url: "/accounts",
      headers: { cookie: userBCookie },
    });
    expect(userBList.statusCode).toBe(200);
    expect(userBList.json()).toEqual([]);

    const userBUpdate = await app.inject({
      method: "PATCH",
      url: `/accounts/${userAAccountId}`,
      headers: { cookie: userBCookie },
      payload: { name: "Cuenta ajena" },
    });
    expect(userBUpdate.statusCode).toBe(404);

    const currencyUpdate = await app.inject({
      method: "PATCH",
      url: `/accounts/${userAAccountId}`,
      headers: { cookie: userACookie },
      payload: { currencyCode: "USD" },
    });
    expect(currencyUpdate.statusCode).toBe(400);

    const typeUpdate = await app.inject({
      method: "PATCH",
      url: `/accounts/${userAAccountId}`,
      headers: { cookie: userACookie },
      payload: { type: "cash" },
    });
    expect(typeUpdate.statusCode).toBe(400);

    const renamed = await app.inject({
      method: "PATCH",
      url: `/accounts/${userAAccountId}`,
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
      url: `/accounts/${userAAccountId}`,
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
      url: "/accounts",
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
      url: `/accounts/${userAAccountId}`,
      headers: { cookie: userACookie },
    });
    expect(archive.statusCode).toBe(204);

    const afterArchive = await app.inject({
      method: "GET",
      url: "/accounts",
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
      url: "/accounts",
      headers: { cookie: userACookie },
      payload: {
        name: "Bancolombia Principal",
        type: "bank",
        currencyCode: "COP",
      },
    });
    expect(recreate.statusCode).toBe(201);
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
