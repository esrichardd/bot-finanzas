import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import type { Database } from "../../infra/db/client.js";
import { ValidationError } from "../../shared/errors.js";
import { orThrow } from "../../shared/db-helpers.js";
import { categories } from "./categories.schema.js";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "./categories.types.js";

/** Lectura: categorías visibles para el usuario = propias + del sistema. */
function accessibleTo(userId: string): SQL {
  return or(eq(categories.userId, userId), isNull(categories.userId))!;
}

function toResponse(row: typeof categories.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    description: row.description,
    color: row.color,
    isSystem: row.userId === null,
    archived: row.archived,
  };
}

export async function listCategories(db: Database, userId: string) {
  const rows = await db
    .select()
    .from(categories)
    .where(and(accessibleTo(userId), eq(categories.archived, false)))
    .orderBy(categories.name);
  return rows.map(toResponse);
}

/** Categoría visible (propia o del sistema), activa. Lanza NotFoundError / ValidationError. */
export async function getAccessibleCategory(
  db: Database,
  userId: string,
  categoryId: string,
) {
  const category = orThrow(
    await db.query.categories.findFirst({
      where: and(eq(categories.id, categoryId), accessibleTo(userId)),
    }),
    "category",
  );
  if (category.archived) {
    throw new ValidationError("Category is archived");
  }
  return category;
}

export async function createCategory(
  db: Database,
  userId: string,
  input: CreateCategoryInput,
) {
  if (input.parentId) {
    // El padre debe existir, ser visible para el usuario y ser raíz (un solo nivel).
    const parent = orThrow(
      await db.query.categories.findFirst({
        where: and(eq(categories.id, input.parentId), accessibleTo(userId)),
      }),
      "category",
    );
    if (parent.parentId !== null) {
      throw new ValidationError("Subcategories cannot have children");
    }
    if (parent.archived) {
      throw new ValidationError("Cannot create under an archived category");
    }
  }

  const duplicate = await db.query.categories.findFirst({
    where: and(
      accessibleTo(userId),
      eq(categories.name, input.name),
      input.parentId
        ? eq(categories.parentId, input.parentId)
        : isNull(categories.parentId),
      eq(categories.archived, false),
    ),
  });
  if (duplicate) {
    throw new ValidationError(
      "A category with that name already exists at this level",
    );
  }

  const [created] = await db
    .insert(categories)
    .values({
      userId,
      name: input.name,
      parentId: input.parentId ?? null,
      description: input.description ?? null,
      color: input.color ?? null,
    })
    .returning();
  return toResponse(created!);
}

export async function updateCategory(
  db: Database,
  userId: string,
  categoryId: string,
  input: UpdateCategoryInput,
) {
  // Escritura: ownership estricto — sistema o categoría ajena dan 404.
  const [updated] = await db
    .update(categories)
    .set(input)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .returning();
  return toResponse(orThrow(updated, "category"));
}

export async function archiveCategory(
  db: Database,
  userId: string,
  categoryId: string,
) {
  const [archived] = await db
    .update(categories)
    .set({ archived: true })
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .returning();
  orThrow(archived, "category");

  // Archivar en cascada las subcategorías propias.
  await db
    .update(categories)
    .set({ archived: true })
    .where(
      and(eq(categories.parentId, categoryId), eq(categories.userId, userId)),
    );
}
