import path from "node:path";
import { eq } from "drizzle-orm";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../http/server.js";
import { createDb } from "../../infra/db/client.js";
import { user } from "../../infra/auth/auth.schema.js";
import { getAccessibleCategory } from "./categories.service.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";

const SYSTEM_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";

describe("categories module", () => {
  let container: StartedPostgreSqlContainer;
  let database: ReturnType<typeof createDb>;
  let app: ReturnType<typeof buildServer>;
  let userACookie: string;
  let userBCookie: string;
  let userACategoryId: string;
  let userAActiveCategoryId: string;
  let userASubcategoryId: string;
  let userAId: string;
  let userBId: string;

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
        BETTER_AUTH_TRUSTED_ORIGINS: "",
      },
      db: database.db,
    });

    userACookie = await signUp("user-a@example.com", "User A");
    userBCookie = await signUp("user-b@example.com", "User B");
    userAId = (await database.db.query.user.findFirst({
      where: eq(user.email, "user-a@example.com"),
    }))!.id;
    userBId = (await database.db.query.user.findFirst({
      where: eq(user.email, "user-b@example.com"),
    }))!.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.close();
    await container?.stop();
  });

  it("supports scoped system and user categories", async () => {
    const unauthenticated = await app.inject({
      method: "GET",
      url: "/api/categories",
    });
    expect(unauthenticated.statusCode).toBe(401);

    const initialList = await app.inject({
      method: "GET",
      url: "/api/categories",
      headers: { cookie: userACookie },
    });
    expect(initialList.statusCode).toBe(200);
    const initialCategories = initialList.json();
    expect(initialCategories).toHaveLength(14);
    expect(initialCategories.every((category: { isSystem: boolean }) => category.isSystem)).toBe(
      true,
    );
    expect(initialCategories.every((category: { emoji: string | null }) => category.emoji)).toBe(true);

    const archivedInitially = await app.inject({
      method: "GET",
      url: "/api/categories?status=archived",
      headers: { cookie: userACookie },
    });
    expect(archivedInitially.statusCode).toBe(200);
    expect(archivedInitially.json()).toEqual([]);

    const invalidStatus = await app.inject({
      method: "GET",
      url: "/api/categories?status=unknown",
      headers: { cookie: userACookie },
    });
    expect(invalidStatus.statusCode).toBe(400);

    const create = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie: userACookie },
      payload: {
        name: "Gimnasio",
        color: "#1D9E75",
        emoji: "❤️‍🩹",
        description: "Salud y entrenamiento",
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({
      name: "Gimnasio",
      color: "#1D9E75",
      emoji: "❤️‍🩹",
      description: "Salud y entrenamiento",
      isSystem: false,
      parentId: null,
    });
    userACategoryId = create.json().id;

    const invalidColor = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie: userACookie },
      payload: { name: "Color inválido", color: "verde" },
    });
    expect(invalidColor.statusCode).toBe(400);

    for (const emoji of ["texto", "🚗🚗", ""]) {
      const invalidEmoji = await app.inject({
        method: "POST",
        url: "/api/categories",
        headers: { cookie: userACookie },
        payload: { name: `Emoji inválido ${emoji || "vacío"}`, emoji },
      });
      expect(invalidEmoji.statusCode).toBe(400);
    }

    const userBList = await app.inject({
      method: "GET",
      url: "/api/categories",
      headers: { cookie: userBCookie },
    });
    expect(userBList.statusCode).toBe(200);
    expect(userBList.json()).toHaveLength(14);
    expect(userBList.json().some((category: { name: string }) => category.name === "Gimnasio")).toBe(
      false,
    );

    const userBUpdate = await app.inject({
      method: "PATCH",
      url: `/api/categories/${userACategoryId}`,
      headers: { cookie: userBCookie },
      payload: { name: "Gimnasio ajeno" },
    });
    expect(userBUpdate.statusCode).toBe(404);

    const subcategory = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie: userACookie },
      payload: { name: "Suplementos", parentId: userACategoryId, emoji: null, color: null },
    });
    expect(subcategory.statusCode).toBe(201);
    expect(subcategory.json()).toMatchObject({
      name: "Suplementos",
      parentId: userACategoryId,
      emoji: null,
      color: null,
    });
    userASubcategoryId = subcategory.json().id;

    const thirdLevel = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie: userACookie },
      payload: { name: "Proteína", parentId: userASubcategoryId },
    });
    expect(thirdLevel.statusCode).toBe(400);

    const systemChild = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie: userACookie },
      payload: {
        name: "Gasolina de prueba",
        parentId: "00000000-0000-4000-8000-000000000003",
      },
    });
    expect(systemChild.statusCode).toBe(201);
    expect(systemChild.json()).toMatchObject({
      parentId: "00000000-0000-4000-8000-000000000003",
      isSystem: false,
    });

    const systemUpdate = await app.inject({
      method: "PATCH",
      url: `/api/categories/${SYSTEM_CATEGORY_ID}`,
      headers: { cookie: userACookie },
      payload: { name: "Hackeada" },
    });
    expect(systemUpdate.statusCode).toBe(404);

    const systemArchive = await app.inject({
      method: "DELETE",
      url: `/api/categories/${SYSTEM_CATEGORY_ID}`,
      headers: { cookie: userACookie },
    });
    expect(systemArchive.statusCode).toBe(404);

    const systemRestore = await app.inject({
      method: "POST",
      url: `/api/categories/${SYSTEM_CATEGORY_ID}/restore`,
      headers: { cookie: userACookie },
    });
    expect(systemRestore.statusCode).toBe(404);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie: userACookie },
      payload: { name: "Gimnasio" },
    });
    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json().error).toBe("CATEGORY_NAME_CONFLICT");

    const duplicateChild = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie: userACookie },
      payload: { name: "Suplementos", parentId: userACategoryId },
    });
    expect(duplicateChild.statusCode).toBe(400);
    expect(duplicateChild.json().error).toBe("CATEGORY_NAME_CONFLICT");

    const secondRoot = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie: userACookie },
      payload: { name: "Otra raíz", emoji: "🐾", color: "#D4537E" },
    });
    expect(secondRoot.statusCode).toBe(201);
    const secondRootId = secondRoot.json().id as string;
    const sameChildNameElsewhere = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie: userACookie },
      payload: { name: "Suplementos", parentId: secondRootId },
    });
    expect(sameChildNameElsewhere.statusCode).toBe(201);

    const sameNameUpdate = await app.inject({
      method: "PATCH",
      url: `/api/categories/${userACategoryId}`,
      headers: { cookie: userACookie },
      payload: { name: "Gimnasio" },
    });
    expect(sameNameUpdate.statusCode).toBe(200);
    const conflictingUpdate = await app.inject({
      method: "PATCH",
      url: `/api/categories/${userACategoryId}`,
      headers: { cookie: userACookie },
      payload: { name: "Otra raíz" },
    });
    expect(conflictingUpdate.statusCode).toBe(400);
    expect(conflictingUpdate.json().error).toBe("CATEGORY_NAME_CONFLICT");

    const archive = await app.inject({
      method: "DELETE",
      url: `/api/categories/${userACategoryId}`,
      headers: { cookie: userACookie },
    });
    expect(archive.statusCode).toBe(204);

    const afterArchive = await app.inject({
      method: "GET",
      url: "/api/categories",
      headers: { cookie: userACookie },
    });
    expect(afterArchive.statusCode).toBe(200);
    expect(afterArchive.json().some((category: { id: string }) => category.id === userACategoryId)).toBe(
      false,
    );
    expect(
      afterArchive.json().some((category: { id: string }) => category.id === userASubcategoryId),
    ).toBe(false);

    const archivedList = await app.inject({
      method: "GET",
      url: "/api/categories?status=archived",
      headers: { cookie: userACookie },
    });
    expect(archivedList.statusCode).toBe(200);
    expect(archivedList.json().map((category: { id: string }) => category.id)).toEqual(
      expect.arrayContaining([userACategoryId, userASubcategoryId]),
    );

    const archiveAgain = await app.inject({
      method: "DELETE",
      url: `/api/categories/${userACategoryId}`,
      headers: { cookie: userACookie },
    });
    expect(archiveAgain.statusCode).toBe(400);
    expect(archiveAgain.json().error).toBe("CATEGORY_ALREADY_ARCHIVED");

    const childRestoreWhileParentArchived = await app.inject({
      method: "POST",
      url: `/api/categories/${userASubcategoryId}/restore`,
      headers: { cookie: userACookie },
    });
    expect(childRestoreWhileParentArchived.statusCode).toBe(400);
    expect(childRestoreWhileParentArchived.json().error).toBe("CATEGORY_PARENT_ARCHIVED");

    const restoreConflict = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie: userACookie },
      payload: { name: "Gimnasio", emoji: "🏷️" },
    });
    expect(restoreConflict.statusCode).toBe(201);
    const restoreConflictId = restoreConflict.json().id as string;

    const rootRestore = await app.inject({
      method: "POST",
      url: `/api/categories/${userACategoryId}/restore`,
      headers: { cookie: userACookie },
    });
    expect(rootRestore.statusCode).toBe(400);
    expect(rootRestore.json().error).toBe("CATEGORY_NAME_CONFLICT");
    const archivedAfterConflict = await app.inject({
      method: "GET",
      url: "/api/categories?status=archived",
      headers: { cookie: userACookie },
    });
    expect(archivedAfterConflict.json().some((category: { id: string }) => category.id === userASubcategoryId)).toBe(true);

    const removeRestoreConflict = await app.inject({
      method: "DELETE",
      url: `/api/categories/${restoreConflictId}`,
      headers: { cookie: userACookie },
    });
    expect(removeRestoreConflict.statusCode).toBe(204);

    const restoredRoot = await app.inject({
      method: "POST",
      url: `/api/categories/${userACategoryId}/restore`,
      headers: { cookie: userACookie },
    });
    expect(restoredRoot.statusCode).toBe(200);
    expect(restoredRoot.json()).toMatchObject({ id: userACategoryId, archived: false });
    const restoredActive = await app.inject({
      method: "GET",
      url: "/api/categories",
      headers: { cookie: userACookie },
    });
    expect(restoredActive.json().some((category: { id: string }) => category.id === userASubcategoryId)).toBe(true);

    const restoreAgain = await app.inject({
      method: "POST",
      url: `/api/categories/${userACategoryId}/restore`,
      headers: { cookie: userACookie },
    });
    expect(restoreAgain.statusCode).toBe(400);
    expect(restoreAgain.json().error).toBe("CATEGORY_ALREADY_ACTIVE");

    const archiveAfterRestore = await app.inject({
      method: "DELETE",
      url: `/api/categories/${userACategoryId}`,
      headers: { cookie: userACookie },
    });
    expect(archiveAfterRestore.statusCode).toBe(204);

    const activeCategory = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie: userACookie },
      payload: { name: "Categoría activa para movimientos" },
    });
    expect(activeCategory.statusCode).toBe(201);
    userAActiveCategoryId = activeCategory.json().id;

    const archivedParentChild = await app.inject({
      method: "POST",
      url: "/api/categories",
      headers: { cookie: userACookie },
      payload: { name: "No permitido", parentId: userACategoryId },
    });
    expect(archivedParentChild.statusCode).toBe(400);
  });

  it("exposes accessible active category lookup for other modules", async () => {
    const own = await getAccessibleCategory(database.db, userAId, userAActiveCategoryId);
    expect(own.name).toBe("Categoría activa para movimientos");

    const system = await getAccessibleCategory(database.db, userAId, SYSTEM_CATEGORY_ID);
    expect(system.userId).toBeNull();

    await expect(
      getAccessibleCategory(database.db, userBId, userAActiveCategoryId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getAccessibleCategory(database.db, userAId, userACategoryId),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  async function signUp(email: string, name: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: { email, password: "password1234", name },
    });
    expect([200, 201]).toContain(response.statusCode);

    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    return Array.isArray(setCookie) ? setCookie.join("; ") : setCookie!;
  }
});
