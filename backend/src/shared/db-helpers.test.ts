import { eq } from "drizzle-orm";
import { PgDialect, pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { ownedBy, orThrow } from "./db-helpers.js";
import { NotFoundError } from "./errors.js";

const testTable = pgTable("test_entity", {
  id: text("id"),
  userId: text("user_id"),
});

describe("database helpers", () => {
  it("returns the value from orThrow", () => {
    const value = { id: "entity-1" };

    expect(orThrow(value, "entity")).toBe(value);
  });

  it("throws NotFoundError from orThrow for nullish values", () => {
    expect(() => orThrow(undefined, "entity")).toThrow(NotFoundError);
    expect(() => orThrow(null, "entity")).toThrow("entity");
  });

  it("scopes a query by user and extra conditions", () => {
    const query = new PgDialect().sqlToQuery(
      ownedBy(testTable.userId, "user-1", eq(testTable.id, "entity-1")),
    );

    expect(query.sql).toContain('"user_id"');
    expect(query.sql).toContain('"id"');
  });
});
