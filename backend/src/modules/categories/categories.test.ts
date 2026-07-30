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
      url: "/categories",
    });
    expect(unauthenticated.statusCode).toBe(401);

    const initialList = await app.inject({
      method: "GET",
      url: "/categories",
      headers: { cookie: userACookie },
    });
    expect(initialList.statusCode).toBe(200);
    const initialCategories = initialList.json();
    expect(initialCategories).toHaveLength(14);
    expect(initialCategories.every((category: { isSystem: boolean }) => category.isSystem)).toBe(
      true,
    );

    const create = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie: userACookie },
      payload: {
        name: "Gimnasio",
        color: "#1D9E75",
        description: "Salud y entrenamiento",
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json()).toMatchObject({
      name: "Gimnasio",
      color: "#1D9E75",
      description: "Salud y entrenamiento",
      isSystem: false,
      parentId: null,
    });
    userACategoryId = create.json().id;

    const invalidColor = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie: userACookie },
      payload: { name: "Color inválido", color: "verde" },
    });
    expect(invalidColor.statusCode).toBe(400);

    const userBList = await app.inject({
      method: "GET",
      url: "/categories",
      headers: { cookie: userBCookie },
    });
    expect(userBList.statusCode).toBe(200);
    expect(userBList.json()).toHaveLength(14);
    expect(userBList.json().some((category: { name: string }) => category.name === "Gimnasio")).toBe(
      false,
    );

    const userBUpdate = await app.inject({
      method: "PATCH",
      url: `/categories/${userACategoryId}`,
      headers: { cookie: userBCookie },
      payload: { name: "Gimnasio ajeno" },
    });
    expect(userBUpdate.statusCode).toBe(404);

    const subcategory = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie: userACookie },
      payload: { name: "Suplementos", parentId: userACategoryId },
    });
    expect(subcategory.statusCode).toBe(201);
    expect(subcategory.json()).toMatchObject({
      name: "Suplementos",
      parentId: userACategoryId,
    });
    userASubcategoryId = subcategory.json().id;

    const thirdLevel = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie: userACookie },
      payload: { name: "Proteína", parentId: userASubcategoryId },
    });
    expect(thirdLevel.statusCode).toBe(400);

    const systemUpdate = await app.inject({
      method: "PATCH",
      url: `/categories/${SYSTEM_CATEGORY_ID}`,
      headers: { cookie: userACookie },
      payload: { name: "Hackeada" },
    });
    expect(systemUpdate.statusCode).toBe(404);

    const systemArchive = await app.inject({
      method: "DELETE",
      url: `/categories/${SYSTEM_CATEGORY_ID}`,
      headers: { cookie: userACookie },
    });
    expect(systemArchive.statusCode).toBe(404);

    const duplicate = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie: userACookie },
      payload: { name: "Gimnasio" },
    });
    expect(duplicate.statusCode).toBe(400);

    const archive = await app.inject({
      method: "DELETE",
      url: `/categories/${userACategoryId}`,
      headers: { cookie: userACookie },
    });
    expect(archive.statusCode).toBe(204);

    const afterArchive = await app.inject({
      method: "GET",
      url: "/categories",
      headers: { cookie: userACookie },
    });
    expect(afterArchive.statusCode).toBe(200);
    expect(afterArchive.json().some((category: { id: string }) => category.id === userACategoryId)).toBe(
      false,
    );
    expect(
      afterArchive.json().some((category: { id: string }) => category.id === userASubcategoryId),
    ).toBe(false);

    const activeCategory = await app.inject({
      method: "POST",
      url: "/categories",
      headers: { cookie: userACookie },
      payload: { name: "Categoría activa para movimientos" },
    });
    expect(activeCategory.statusCode).toBe(201);
    userAActiveCategoryId = activeCategory.json().id;

    const archivedParentChild = await app.inject({
      method: "POST",
      url: "/categories",
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
