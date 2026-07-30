import path from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../http/server.js";
import { createDb } from "../db/client.js";

describe("email and password authentication", () => {
  let container: StartedPostgreSqlContainer;
  let database: ReturnType<typeof createDb>;
  let app: ReturnType<typeof buildServer>;
  let cookie: string;

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
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.close();
    await container?.stop();
  });

  it("rejects an unauthenticated request to /me", async () => {
    const response = await app.inject({ method: "GET", url: "/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("signs up with email and password and sets a session cookie", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: {
        email: "test@test.com",
        password: "password1234",
        name: "Test",
      },
    });

    expect([200, 201]).toContain(response.statusCode);
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(response.json().user).toMatchObject({
      email: "test@test.com",
      name: "Test",
    });

    const setCookie = response.headers["set-cookie"];
    cookie = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie!;
  });

  it("returns the authenticated user from /me", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      email: "test@test.com",
      name: "Test",
    });
    expect(response.json().id).toEqual(expect.any(String));
  });

  it("rejects invalid sign-in credentials", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: {
        email: "test@test.com",
        password: "wrong-password",
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("invalidates the session on sign-out", async () => {
    const signOut = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { cookie },
    });

    expect(signOut.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/me",
      headers: { cookie },
    });

    expect(me.statusCode).toBe(401);
    expect(me.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("signs in again after the previous session is logged out", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: {
        email: "test@test.com",
        password: "password1234",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toBeDefined();

    const setCookie = response.headers["set-cookie"];
    cookie = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie!;
  });

  it("returns the session and user from Better Auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe("test@test.com");
  });

  it("does not return the session after logging out", async () => {
    const signOut = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { cookie },
    });

    expect(signOut.statusCode).toBe(200);

    const session = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { cookie },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toBeNull();
  });
});
