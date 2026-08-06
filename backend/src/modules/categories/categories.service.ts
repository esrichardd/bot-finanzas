import { and, eq, isNull, ne, or, type SQL } from "drizzle-orm";
import type { Database, DbExecutor } from "../../infra/db/client.js";
import { ValidationError } from "../../shared/errors.js";
import { orThrow } from "../../shared/db-helpers.js";
import { categories } from "./categories.schema.js";
import {
  CategoryAlreadyActiveError,
  CategoryAlreadyArchivedError,
  CategoryNameConflictError,
  CategoryParentArchivedError,
} from "./categories.errors.js";
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
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
    emoji: row.emoji,
    isSystem: row.userId === null,
    archived: row.archived,
  };
}

async function assertNoNameConflict(
  db: DbExecutor,
  userId: string,
  name: string,
  parentId: string | null,
  excludeId?: string,
) {
  const duplicate = await db.query.categories.findFirst({
    where: and(
      accessibleTo(userId),
      eq(categories.archived, false),
      eq(categories.name, name),
      parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId),
      excludeId ? ne(categories.id, excludeId) : undefined,
    ),
  });
  if (duplicate) throw new CategoryNameConflictError();
}

export async function listCategories(
  db: Database,
  userId: string,
  query: ListCategoriesQuery = { status: "active" },
) {
  const where = query.status === "archived"
    ? and(eq(categories.userId, userId), eq(categories.archived, true))
    : and(accessibleTo(userId), eq(categories.archived, false));
  const rows = await db
    .select()
    .from(categories)
    .where(where)
    .orderBy(categories.name);
  return rows.map(toResponse);
}

/** Categoría visible (propia o del sistema), activa. Lanza NotFoundError / ValidationError. */
export async function getAccessibleCategory(
  db: DbExecutor,
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

  await assertNoNameConflict(db, userId, input.name, input.parentId ?? null);

  const [created] = await db
    .insert(categories)
    .values({
      userId,
      name: input.name,
      parentId: input.parentId ?? null,
      description: input.description ?? null,
      color: input.color ?? null,
      emoji: input.emoji ?? null,
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
  const current = orThrow(
    await db.query.categories.findFirst({
      where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
    }),
    "category",
  );
  if (current.archived) throw new CategoryAlreadyArchivedError();
  if (input.name !== undefined) {
    await assertNoNameConflict(db, userId, input.name, current.parentId, categoryId);
  }

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
  await db.transaction(async (tx) => {
    const category = orThrow(
      await tx.query.categories.findFirst({
        where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
      }),
      "category",
    );
    if (category.archived) throw new CategoryAlreadyArchivedError();

    await tx
      .update(categories)
      .set({ archived: true })
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));

    if (category.parentId === null) {
      await tx
        .update(categories)
        .set({ archived: true })
        .where(and(eq(categories.parentId, categoryId), eq(categories.userId, userId)));
    }
  });
}

export async function restoreCategory(
  db: Database,
  userId: string,
  categoryId: string,
) {
  return db.transaction(async (tx) => {
    const category = orThrow(
      await tx.query.categories.findFirst({
        where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
      }),
      "category",
    );
    if (!category.archived) throw new CategoryAlreadyActiveError();

    if (category.parentId !== null) {
      const parent = orThrow(
        await tx.query.categories.findFirst({
          where: and(eq(categories.id, category.parentId), accessibleTo(userId)),
        }),
        "category",
      );
      if (parent.archived) throw new CategoryParentArchivedError();
      if (parent.parentId !== null) throw new ValidationError("Subcategories cannot have children");
      await assertNoNameConflict(tx, userId, category.name, category.parentId, category.id);
    } else {
      const children = await tx.query.categories.findMany({
        where: and(
          eq(categories.parentId, category.id),
          eq(categories.userId, userId),
          eq(categories.archived, true),
        ),
      });
      await assertNoNameConflict(tx, userId, category.name, null, category.id);
      for (const child of children) {
        await assertNoNameConflict(tx, userId, child.name, category.id, child.id);
      }
    }

    const [restored] = await tx
      .update(categories)
      .set({ archived: false })
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .returning();

    if (category.parentId === null) {
      await tx
        .update(categories)
        .set({ archived: false })
        .where(and(eq(categories.parentId, categoryId), eq(categories.userId, userId)));
    }
    return toResponse(orThrow(restored, "category"));
  });
}
