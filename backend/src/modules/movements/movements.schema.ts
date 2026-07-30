import {
  bigint,
  date,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "../../infra/auth/auth.schema.js";
import { accounts } from "../accounts/accounts.schema.js";
import { categories } from "../categories/categories.schema.js";

export const movementType = pgEnum("movement_type", [
  "income",
  "expense",
  "transfer_in",
  "transfer_out",
  "adjustment_in",
  "adjustment_out",
]);

export const movementSource = pgEnum("movement_source", ["manual", "agent"]);

export const transfers = pgTable("transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const movements = pgTable("movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  type: movementType("type").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  transferId: uuid("transfer_id").references(() => transfers.id),
  description: text("description"),
  occurredAt: date("occurred_at", { mode: "string" }).notNull(),
  source: movementSource("source").notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
