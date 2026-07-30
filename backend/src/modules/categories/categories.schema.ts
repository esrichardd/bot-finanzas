import {
  boolean,
  pgTable,
  text,
  timestamp,
  type AnyPgColumn,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "../../infra/auth/auth.schema.js";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  // NULL = categoría del sistema. text porque los ids de Better Auth son strings.
  userId: text("user_id").references(() => user.id),
  // NULL = categoría raíz. AnyPgColumn evita el error de auto-referencia circular.
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
  name: text("name").notNull(),
  description: text("description"),
  // Hex "#RRGGBB". La validación de formato vive en Zod (borde), no en la DB.
  color: text("color"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
