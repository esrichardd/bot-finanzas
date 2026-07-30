import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "../../infra/auth/auth.schema.js";

export const currencyKind = pgEnum("currency_kind", ["fiat", "crypto"]);

export const currencies = pgTable("currencies", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  decimals: integer("decimals").notNull(),
  kind: currencyKind("kind").notNull(),
});

export const accountType = pgEnum("account_type", [
  "bank",
  "cash",
  "credit_card",
  "crypto",
]);

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  name: text("name").notNull(),
  type: accountType("type").notNull(),
  currencyCode: text("currency_code")
    .notNull()
    .references(() => currencies.code),
  // Agrupación presentacional; no existe una tabla de instituciones.
  institution: text("institution"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
