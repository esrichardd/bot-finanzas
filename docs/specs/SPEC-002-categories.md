# SPEC-002: Módulo de categorías

Estado: ✅ completado 2026-07-30

Ejecutar cumpliendo `ARCHITECTURE.md` (normativo) y `docs/DATABASE.md` (decisión **D4**: una tabla, jerarquía de un nivel, sistema + propias). Los snippets son la implementación de referencia — seguirlos literalmente salvo que contradigan ARCHITECTURE.md, en cuyo caso ARCHITECTURE.md gana y se reporta la discrepancia.

## Objetivo

Primer módulo de dominio completo: tabla `categories` con jerarquía de un nivel y categorías del sistema + del usuario, service con casos de uso y errores de dominio, rutas protegidas con `requireAuth` y schemas Zod, seed de categorías del sistema vía migración, y tests de integración (incluido el primer test real de scoping entre usuarios). **Este módulo es la plantilla que replicarán todos los módulos de dominio futuros.**

## Alcance

**Incluye:** schema + migración + seed, service (listar, crear, renombrar, archivar), rutas, tests unit + integration.

**NO incluye (no agregar "de paso"):** campo `kind` income/expense (lo decidirá SPEC-004 si lo necesita), iconos, capabilities del agente, endpoints de des-archivado, más de un nivel de jerarquía, delete físico.

## Contexto de diseño (leer antes de codificar)

- `user_id` **nullable**: `NULL` = categoría del sistema (visible para todos, inmutable); con valor = del usuario.
- El scoping de lectura de este módulo es especial: "mis categorías" = `user_id = :me OR user_id IS NULL`. El helper genérico `ownedBy` NO aplica para lecturas aquí; se define un helper propio del módulo (Paso 3). Las **escrituras** sí exigen ownership estricto (solo categorías propias).
- Jerarquía de un nivel: un padre no puede tener padre. Se valida en el service, no en la DB.
- **El `user_id` es `text`, no `uuid`** — los ids de Better Auth son strings tipo nanoid. Usar `uuid` en la FK rompe la referencia.

## Paso 1 — Schema Drizzle

Crear **`backend/src/modules/categories/categories.schema.ts`**:

```typescript
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  type AnyPgColumn,
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
```

Notas:

- Verificar que el import de `user` coincide con el nombre exportado en `auth.schema.ts` (puede ser `user` o `users` según lo que generó la CLI — usar el real).
- Re-exportar en el schema raíz — agregar a **`backend/src/infra/db/schema.ts`**:

```typescript
export * from "../../modules/categories/categories.schema.js";
```

Generar la migración: `cd backend && npm run db:generate`. Verificar que el `.sql` crea la tabla con las dos FKs.

## Paso 2 — Seed de categorías del sistema (migración custom)

Las categorías del sistema tienen **UUIDs fijos** (el agente y los tests dependen de ids estables). Se siembran en una migración versionada, no en un script aparte.

1. Generar migración vacía: `npx drizzle-kit generate --custom --name seed-system-categories`
2. Escribir en el `.sql` generado:

```sql
INSERT INTO "categories" ("id", "user_id", "parent_id", "name", "color") VALUES
('00000000-0000-4000-8000-000000000001', NULL, NULL, 'Mercado', '#1D9E75'),
('00000000-0000-4000-8000-000000000002', NULL, NULL, 'Restaurantes', '#D85A30'),
('00000000-0000-4000-8000-000000000003', NULL, NULL, 'Transporte', '#378ADD'),
('00000000-0000-4000-8000-000000000004', NULL, NULL, 'Vivienda', '#7F77DD'),
('00000000-0000-4000-8000-000000000005', NULL, NULL, 'Servicios', '#639922'),
('00000000-0000-4000-8000-000000000006', NULL, NULL, 'Salud', '#D4537E'),
('00000000-0000-4000-8000-000000000007', NULL, NULL, 'Entretenimiento', '#EF9F27'),
('00000000-0000-4000-8000-000000000008', NULL, NULL, 'Educación', '#534AB7'),
('00000000-0000-4000-8000-000000000009', NULL, NULL, 'Viajes', '#0F6E56'),
('00000000-0000-4000-8000-000000000010', NULL, NULL, 'Comisiones', '#888780'),
('00000000-0000-4000-8000-000000000011', NULL, NULL, 'Impuestos', '#993C1D'),
('00000000-0000-4000-8000-000000000012', NULL, NULL, 'Otros gastos', '#5F5E5A'),
('00000000-0000-4000-8000-000000000013', NULL, NULL, 'Salario', '#3B6D11'),
('00000000-0000-4000-8000-000000000014', NULL, NULL, 'Otros ingresos', '#1D9E75');
```

Nota: 'Comisiones' es obligatoria — la decisión D2 de DATABASE.md depende de ella. El resto es editable por el humano antes de aplicar; no cambiar los UUIDs después de aplicada.

## Paso 3 — Types, schemas Zod y helper de acceso

Crear **`backend/src/modules/categories/categories.types.ts`**:

```typescript
import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Expected hex color like #1D9E75");

export const createCategoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  parentId: z.string().uuid().nullish(),
  description: z.string().trim().max(300).nullish(),
  color: hexColor.nullish(),
});
export type CreateCategoryInput = z.infer<typeof createCategoryInput>;

// Update parcial: cualquier subconjunto, pero al menos un campo.
export const updateCategoryInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(300).nullable(),
    color: hexColor.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "At least one field is required");
export type UpdateCategoryInput = z.infer<typeof updateCategoryInput>;

export const categoryResponse = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  isSystem: z.boolean(),
  archived: z.boolean(),
});
export const categoryListResponse = z.array(categoryResponse);
```

En el **service** (mismo archivo del Paso 4) va el helper de acceso propio del módulo:

```typescript
/** Lectura: categorías visibles para el usuario = propias + del sistema. */
function accessibleTo(userId: string): SQL {
  return or(eq(categories.userId, userId), isNull(categories.userId))!;
}
```

## Paso 4 — Service

Crear **`backend/src/modules/categories/categories.service.ts`**:

```typescript
import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import type { Database } from "../../infra/db/client.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";
import { orThrow } from "../../shared/db-helpers.js";
import { categories } from "./categories.schema.js";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "./categories.types.js";

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
  // Escritura: ownership ESTRICTO — las del sistema (userId NULL) no matchean y dan 404.
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
```

Notas para el implementador:

- Las escrituras usan el patrón "UPDATE con ownership en el WHERE + orThrow": una categoría ajena o del sistema simplemente no matchea → 404. Nunca revelar con un 403 que el recurso existe.
- `ValidationError` debe existir en `shared/errors.ts` y mapear a **400** en el error handler global; `NotFoundError` a **404**. Si falta alguno, agregarlo siguiendo el patrón existente — no crear jerarquías nuevas de errores.
- Cero lógica en las rutas: toda regla vive aquí.

## Paso 5 — Rutas

Crear **`backend/src/modules/categories/categories.routes.ts`**:

```typescript
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Database } from "../../infra/db/client.js";
import {
  createCategoryInput,
  updateCategoryInput,
  categoryResponse,
  categoryListResponse,
} from "./categories.types.js";
import {
  listCategories,
  createCategory,
  updateCategory,
  archiveCategory,
} from "./categories.service.js";

const idParam = z.object({ id: z.string().uuid() });

export async function categoriesRoutes(
  app: FastifyInstance,
  opts: { db: Database; requireAuth: preHandlerHookHandler },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/categories",
    {
      preHandler: opts.requireAuth,
      schema: { response: { 200: categoryListResponse } },
    },
    async (request) => listCategories(opts.db, request.user!.id),
  );

  r.post(
    "/categories",
    {
      preHandler: opts.requireAuth,
      schema: {
        body: createCategoryInput,
        response: { 201: categoryResponse },
      },
    },
    async (request, reply) => {
      const created = await createCategory(
        opts.db,
        request.user!.id,
        request.body,
      );
      return reply.code(201).send(created);
    },
  );

  r.patch(
    "/categories/:id",
    {
      preHandler: opts.requireAuth,
      schema: {
        params: idParam,
        body: updateCategoryInput,
        response: { 200: categoryResponse },
      },
    },
    async (request) =>
      updateCategory(
        opts.db,
        request.user!.id,
        request.params.id,
        request.body,
      ),
  );

  // DELETE archiva (soft delete) — decisión de DATABASE.md principio 6. Nunca borra filas.
  r.delete(
    "/categories/:id",
    {
      preHandler: opts.requireAuth,
      schema: { params: idParam, response: { 204: z.null() } },
    },
    async (request, reply) => {
      await archiveCategory(opts.db, request.user!.id, request.params.id);
      return reply.code(204).send();
    },
  );
}
```

Registrar en **`http/server.ts`** (junto a los registros existentes):

```typescript
app.register(categoriesRoutes, { db, requireAuth });
```

## Paso 6 — Tests

**`backend/src/modules/categories/categories.test.ts`** — integración con Testcontainers, mismo setup que `auth.test.ts` (Postgres efímero + migraciones + `buildServer` + `app.inject`). Crear DOS usuarios vía sign-up (userA, userB) con sus cookies. Casos obligatorios:

1. `GET /categories` sin cookie → 401.
2. userA lista → contiene las 14 del sistema (`isSystem: true`), ninguna propia.
3. userA crea "Gimnasio" con `color: "#1D9E75"` y `description` → 201 devolviendo ambos; al listar la ve con `isSystem: false`. Crear con `color: "verde"` (formato inválido) → **400**.
4. **Scoping**: userB lista → ve las del sistema pero NO "Gimnasio". userB intenta `PATCH` sobre la categoría de userA → **404**.
5. userA crea subcategoría de "Gimnasio" → 201 con `parentId` correcto.
6. **Un solo nivel**: crear hija de la subcategoría → **400**.
7. **Sistema inmutable**: `PATCH` y `DELETE` sobre una categoría del sistema (id fijo del seed) → **404**.
8. Duplicado: userA crea "Gimnasio" de nuevo en el mismo nivel → **400**.
9. Archivar "Gimnasio" → 204; el listado ya no la incluye (ni a su subcategoría).
10. Crear subcategoría bajo la archivada → **400**.

Los tests de la lógica de jerarquía/duplicados quedan cubiertos por integración (la lógica involucra la DB); no hay funciones puras que ameriten unit tests en este módulo.

## Errores comunes que NO cometer

- `userId` como `uuid` en el schema (los ids de Better Auth son `text`).
- Usar `ownedBy` para las lecturas de este módulo (excluiría las del sistema); el helper correcto es `accessibleTo`, propio del módulo.
- Responder 403 cuando el recurso es ajeno (revela existencia): el patrón es 404 vía WHERE + orThrow.
- Validar jerarquía en la ruta en vez del service.
- Seed por script aparte o en el arranque de la app en vez de migración versionada.
- Borrar filas en el DELETE (archiva).
- Agregar `kind`, iconos o des-archivado (fuera de alcance).
- Validar el formato del color en la DB o en el service (es validación de borde: vive en Zod).

## Criterios de aceptación

### Flujo E2E (compose levantado; requiere una sesión — reutilizar el flujo de login del SPEC-001)

```bash
BASE=http://localhost:3000
# (login previo con -c cookies.txt como en SPEC-001)

# 1. Listar → 200 con las 14 del sistema
curl -i $BASE/categories -b cookies.txt

# 2. Crear raíz → 201
curl -i -X POST $BASE/categories -b cookies.txt \
  -H 'content-type: application/json' -d '{"name":"Gimnasio"}'

# 3. Crear subcategoría (usar el id devuelto en 2) → 201
curl -i -X POST $BASE/categories -b cookies.txt \
  -H 'content-type: application/json' -d '{"name":"Suplementos","parentId":"<ID_GIMNASIO>"}'

# 4. Tercer nivel (hija de la subcategoría) → 400
curl -i -X POST $BASE/categories -b cookies.txt \
  -H 'content-type: application/json' -d '{"name":"Proteina","parentId":"<ID_SUPLEMENTOS>"}'

# 5. Renombrar una del sistema → 404
curl -i -X PATCH $BASE/categories/00000000-0000-4000-8000-000000000001 \
  -b cookies.txt -H 'content-type: application/json' -d '{"name":"Hackeada"}'

# 6. Archivar Gimnasio → 204, y el listado ya no lo muestra (ni a Suplementos)
curl -i -X DELETE $BASE/categories/<ID_GIMNASIO> -b cookies.txt
curl -i $BASE/categories -b cookies.txt
```

- [ ] Pasos 1–6 con los códigos y comportamientos indicados. Pendiente de verificación manual con compose levantado.

### Criterios generales

- [x] Migraciones versionadas: tabla + seed (aplicadas por el arranque del compose sin pasos manuales).
- [x] Tests de integración (los 10 casos, incluido el de scoping con dos usuarios) pasan; `npm run typecheck` limpio.
- [x] `/health` y el flujo de auth del SPEC-001 siguen funcionando.
- [x] Cero `process.env` fuera de `config/`; rutas sin lógica; montaje con `app.register`; cero JSON Schema a mano.

## Al completar

**NO ejecutar `git commit` ni ningún comando de git.** Al terminar, el ejecutor debe:

1. Marcar `Estado: ✅ completado <fecha>` y tildar los checkboxes cumplidos (dejar destildado lo no verificado, con nota).
2. Actualizar la tabla de orden de construcción en `docs/DATABASE.md` (SPEC-002 → ✅).
3. Responder con: resumen de lo implementado, archivos creados/modificados, resultado de tests y typecheck, cualquier desviación del spec con su justificación, y el **mensaje de commit recomendado** según `docs/COMMITS.md` (sugerencia base: `feat(categories): categories module with hierarchy and system defaults` con `SPEC-002` en el cuerpo). El commit lo hace el humano.
