import path from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../http/server.js";
import { createDb } from "../../infra/db/client.js";
import { availableCredit, nextOccurrence } from "./credit-cards.calc.js";

describe("credit cards module", () => {
  let container: StartedPostgreSqlContainer;
  let database: ReturnType<typeof createDb>;
  let app: ReturnType<typeof buildServer>;
  let userACookie: string;
  let userBCookie: string;
  let cardAccountId: string;
  let bankAccountId: string;
  let userBCardAccountId: string;

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

    userACookie = await signUp("credit-cards-user-a@example.com", "User A");
    userBCookie = await signUp("credit-cards-user-b@example.com", "User B");
    cardAccountId = await createAccount("Visa", "credit_card", userACookie);
    bankAccountId = await createAccount("Cuenta bancaria", "bank", userACookie);
    userBCardAccountId = await createAccount("Mastercard", "credit_card", userBCookie);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.close();
    await container?.stop();
  });

  it("scopes access, configures a card, and derives debt and dates", async () => {
    const genericCard = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie: userACookie },
      payload: { name: "Generic card must be dedicated", type: "credit_card", currencyCode: "COP" },
    });
    expect(genericCard.statusCode).toBe(400);
    expect(genericCard.json().error).toBe("CREDIT_CARD_DEDICATED_FLOW_REQUIRED");

    for (const request of [
      { method: "GET" as const, url: `/api/accounts/${cardAccountId}/credit-card` },
      {
        method: "PUT" as const,
        url: `/api/accounts/${cardAccountId}/credit-card`,
        payload: { creditLimit: 2_000_000, cutDay: 15, paymentDueDay: 30 },
      },
    ]) {
      expect((await app.inject(request)).statusCode).toBe(401);
    }

    const bank = await app.inject({
      method: "PUT",
      url: `/api/accounts/${bankAccountId}/credit-card`,
      headers: { cookie: userACookie },
      payload: { creditLimit: 2_000_000, cutDay: 15, paymentDueDay: 30 },
    });
    expect(bank.statusCode).toBe(400);
    expect(bank.json().message).toContain("not a credit card");

    const otherUser = await app.inject({
      method: "PUT",
      url: `/api/accounts/${userBCardAccountId}/credit-card`,
      headers: { cookie: userACookie },
      payload: { creditLimit: 2_000_000, cutDay: 15, paymentDueDay: 30 },
    });
    expect(otherUser.statusCode).toBe(404);

    const configured = await app.inject({
      method: "PUT",
      url: `/api/accounts/${cardAccountId}/credit-card`,
      headers: { cookie: userACookie },
      payload: {
        creditLimit: 2_000_000,
        cutDay: 15,
        paymentDueDay: 30,
        managementFee: 29_000,
      },
    });
    expect(configured.statusCode).toBe(200);
    expect(configured.json()).toMatchObject({
      accountId: cardAccountId,
      creditLimit: 2_000_000,
      managementFee: 29_000,
      balance: 0,
      debt: 0,
      availableCredit: 2_000_000,
    });
    const today = new Date().toISOString().slice(0, 10);
    expect(configured.json().nextCutDate).toBe(nextOccurrence(15, today));
    expect(configured.json().nextPaymentDueDate).toBe(nextOccurrence(30, today));

    const expense = await app.inject({
      method: "POST",
      url: "/api/movements",
      headers: { cookie: userACookie },
      payload: {
        accountId: cardAccountId,
        type: "expense",
        amount: 350_000,
        occurredAt: today,
      },
    });
    expect(expense.statusCode).toBe(201);

    const indebted = await app.inject({
      method: "GET",
      url: `/api/accounts/${cardAccountId}/credit-card`,
      headers: { cookie: userACookie },
    });
    expect(indebted.json()).toMatchObject({
      balance: -350_000,
      debt: 350_000,
      availableCredit: availableCredit(2_000_000, -350_000),
    });

    const payment = await app.inject({
      method: "POST",
      url: "/api/transfers",
      headers: { cookie: userACookie },
      payload: {
        fromAccountId: bankAccountId,
        toAccountId: cardAccountId,
        amountFrom: 350_000,
        occurredAt: today,
      },
    });
    expect(payment.statusCode).toBe(201);

    const paid = await app.inject({
      method: "GET",
      url: `/api/accounts/${cardAccountId}/credit-card`,
      headers: { cookie: userACookie },
    });
    expect(paid.json()).toMatchObject({ balance: 0, debt: 0, availableCredit: 2_000_000 });

    const updated = await app.inject({
      method: "PUT",
      url: `/api/accounts/${cardAccountId}/credit-card`,
      headers: { cookie: userACookie },
      payload: { creditLimit: 3_000_000, cutDay: 31, paymentDueDay: 31 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ creditLimit: 3_000_000, cutDay: 31, paymentDueDay: 31 });

    for (const invalidDay of [0, 32]) {
      const invalid = await app.inject({
        method: "PUT",
        url: `/api/accounts/${cardAccountId}/credit-card`,
        headers: { cookie: userACookie },
        payload: { creditLimit: 2_000_000, cutDay: invalidDay, paymentDueDay: 30 },
      });
      expect(invalid.statusCode).toBe(400);
    }

    const aggregate = await app.inject({
      method: "POST",
      url: "/api/credit-cards",
      headers: { cookie: userACookie },
      payload: {
        name: "Mastercard aggregate",
        currencyCode: "COP",
        creditLimit: 5_000_000,
        cutDay: 10,
        paymentDueDay: 25,
        openingDebt: { amount: 600_000, occurredAt: today },
      },
    });
    expect(aggregate.statusCode).toBe(201);
    expect(aggregate.json()).toMatchObject({ configured: true, debt: 600_000, creditBalance: 0 });

    const listed = await app.inject({
      method: "GET",
      url: "/api/credit-cards?status=active",
      headers: { cookie: userACookie },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ configured: true, account: expect.objectContaining({ id: cardAccountId }) }),
      expect.objectContaining({ configured: true, debt: 600_000 }),
    ]));

    const archive = await app.inject({
      method: "DELETE",
      url: `/api/accounts/${cardAccountId}`,
      headers: { cookie: userACookie },
    });
    expect(archive.statusCode).toBe(204);
    const archivedRead = await app.inject({
      method: "GET",
      url: `/api/accounts/${cardAccountId}/credit-card`,
      headers: { cookie: userACookie },
    });
    expect(archivedRead.statusCode).toBe(200);
    const archivedWrite = await app.inject({
      method: "PUT",
      url: `/api/accounts/${cardAccountId}/credit-card`,
      headers: { cookie: userACookie },
      payload: { creditLimit: 2_000_000, cutDay: 15, paymentDueDay: 30 },
    });
    expect(archivedWrite.statusCode).toBe(400);
    const restore = await app.inject({
      method: "POST",
      url: `/api/accounts/${cardAccountId}/restore`,
      headers: { cookie: userACookie },
    });
    expect(restore.statusCode).toBe(200);
  });

  async function signUp(email: string, name: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: { email, password: "password1234", name },
    });
    expect([200, 201]).toContain(response.statusCode);
    const setCookie = response.headers["set-cookie"];
    return Array.isArray(setCookie) ? setCookie.join("; ") : setCookie!;
  }

  async function createAccount(name: string, type: "bank" | "credit_card", cookie: string) {
    if (type === "credit_card") {
      const response = await app.inject({
        method: "POST",
        url: "/api/credit-cards",
        headers: { cookie },
        payload: {
          name,
          currencyCode: "COP",
          creditLimit: 2_000_000,
          cutDay: 15,
          paymentDueDay: 30,
        },
      });
      expect(response.statusCode).toBe(201);
      return response.json().account.id as string;
    }
    const response = await app.inject({
      method: "POST",
      url: "/api/accounts",
      headers: { cookie },
      payload: { name, type, currencyCode: "COP" },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }
});
