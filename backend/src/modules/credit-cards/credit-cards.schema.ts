import { bigint, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { accounts } from "../accounts/accounts.schema.js";

export const creditCardDetails = pgTable("credit_card_details", {
  // 1:1 con accounts: el account_id es la PK.
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id),
  creditLimit: bigint("credit_limit", { mode: "number" }).notNull(),
  cutDay: integer("cut_day").notNull(),
  paymentDueDay: integer("payment_due_day").notNull(),
  managementFee: bigint("management_fee", { mode: "number" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
