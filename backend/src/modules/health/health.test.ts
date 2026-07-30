import path from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Database } from "../../infra/db/client.js";
import { checkHealth } from "./health.service.js";

describe("health check", () => {
  let container: StartedPostgreSqlContainer;
  let database: ReturnType<typeof createDb>;
  let db: Database;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17")
      .withDatabase("app")
      .withUsername("app")
      .withPassword("app")
      .start();

    database = createDb(container.getConnectionUri());
    db = database.db;
    await migrate(db, {
      migrationsFolder: path.resolve("src/infra/db/migrations"),
    });
  }, 60_000);

  afterAll(async () => {
    await database?.close();
    await container?.stop();
  });

  it("returns ok when Postgres responds", async () => {
    await expect(checkHealth(db)).resolves.toEqual({
      status: "ok",
      checks: { db: "ok" },
    });
  });

  it("returns degraded when the database connection is unavailable", async () => {
    await database.close();

    await expect(checkHealth(db)).resolves.toEqual({
      status: "degraded",
      checks: { db: "error" },
    });
  });
});
