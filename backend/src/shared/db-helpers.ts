import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { NotFoundError } from "./errors.js";

/**
 * Combina la condición de ownership con condiciones extra.
 * TODA query a datos de negocio debe usarlo (regla 9 de ARCHITECTURE.md).
 * Uso: db.select().from(accounts).where(ownedBy(accounts.userId, userId, eq(accounts.id, id)))
 */
export function ownedBy(
  userIdColumn: PgColumn,
  userId: string,
  ...conditions: (SQL | undefined)[]
): SQL {
  const combined = and(eq(userIdColumn, userId), ...conditions);
  if (!combined) {
    throw new Error("ownedBy: no conditions produced");
  }
  return combined;
}

/** Lanza NotFoundError si el resultado es undefined/null. */
export function orThrow<T>(value: T | undefined | null, entity: string): T {
  if (value === undefined || value === null) {
    throw new NotFoundError(entity);
  }
  return value;
}
