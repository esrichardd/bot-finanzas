# SPEC-003: Monedas y cuentas

Estado: 🔲 pendiente

Ejecutar cumpliendo `ARCHITECTURE.md` (normativo) y `docs/DATABASE.md` (principios 1–7 y decisiones **D1**, **D3**). Los snippets son la implementación de referencia — ante contradicción, gana ARCHITECTURE.md y se reporta la discrepancia. El módulo `categories` (SPEC-002) es la plantilla de patrón; este spec la sigue.

## Objetivo

La tabla de referencia `currencies` (seed USD y COP) y el módulo de dominio `accounts`: crear, listar, renombrar y archivar cuentas del usuario, cada una denominada en una moneda. **Sin balance todavía** — el balance es `SUM(movements)` y movements llega en SPEC-004; aquí las cuentas son solo metadata.

## Alcance

**Incluye:** tabla `currencies` + seed vía migración custom, endpoint de lectura de monedas, módulo `accounts` completo (schema, service, rutas, tests). Primer uso real del helper `ownedBy`.

**NO incluye (no agregar "de paso"):** `credit_card_details` (una cuenta tipo `credit_card` puede existir sin su satélite — decisión D1), balances ni campo de balance, monedas cripto en el seed, movimientos, CRUD de monedas (son datos de referencia del sistema), cambio de moneda o tipo de una cuenta existente, tabla de instituciones (es texto libre), capabilities del agente.

## Contexto de diseño (leer antes de codificar)

- `currencies` es **tabla de referencia global**: sin `user_id`, sin scoping, solo lectura por API. Se siembra por migración (mismo mecanismo que las categorías del sistema).
- `accounts` usa **ownership estricto** en lecturas Y escrituras — a diferencia de categories, aquí no hay filas "del sistema". Este es el primer módulo donde `ownedBy` de `shared/db-helpers.ts` aplica tal cual.
- La **moneda y el tipo de una cuenta son inmutables** después de creada (cambiar la moneda de una cuenta con movimientos futuros corrompería el ledger; se bloquea desde ya para no depender de acordarse en SPEC-004). El PATCH acepta `name` e `institution`.
- **Una cuenta = una moneda, siempre** (DATABASE.md, corolario de D3). Una plataforma con varios assets son varias cuentas ("Binance BTC", "Binance ETH"); el campo opcional `institution` (texto libre) las agrupa presentacionalmente. Sin tabla de instituciones (YAGNI).
- `user_id` es `text` (ids de Better Auth), igual que en categories.

## Paso 1 — Schema Drizzle

Crear **`backend/src/modules/accounts/accounts.schema.ts`** (currencies vive aquí también: es pequeña y su único consumidor directo es accounts; si crece, se separa):

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "../../infra/auth/auth.schema.js";

export const currencyKind = pgEnum("currency_kind", ["fiat", "crypto"]);

export const currencies = pgTable("currencies", {
  code: text("code").primaryKey(), // "USD", "COP", futuro "BTC"
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
  // Agrupación presentacional ("Binance", "Bancolombia"). Texto libre, sin tabla propia.
  institution: text("institution"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Notas:

- Verificar el nombre real del export de la tabla de auth (`user` o `users`).
- Re-exportar en **`backend/src/infra/db/schema.ts`**: `export * from "../../modules/accounts/accounts.schema.js";`
- `npm run db:generate` → verificar que el `.sql` crea los dos enums, las dos tablas y las FKs.

## Paso 2 — Seed de monedas (migración custom)

`npx drizzle-kit generate --custom --name seed-currencies` y escribir en el `.sql`:

```sql
INSERT INTO "currencies" ("code", "name", "decimals", "kind") VALUES
('USD', 'Dólar estadounidense', 2, 'fiat'),
('COP', 'Peso colombiano', 2, 'fiat');
```

No agregar monedas cripto: llegan con su spec (D3). Los `code` son contrato estable, como los UUIDs de las categorías del sistema.

## Paso 3 — Types y schemas Zod

Crear **`backend/src/modules/accounts/accounts.types.ts`**:

```typescript
import { z } from "zod";

export const accountTypeValues = [
  "bank",
  "cash",
  "credit_card",
  "crypto",
] as const;

export const createAccountInput = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(accountTypeValues),
  currencyCode: z.string().trim().toUpperCase().min(3).max(10),
  institution: z.string().trim().min(1).max(60).nullish(),
});
export type CreateAccountInput = z.infer<typeof createAccountInput>;

// Mutables: name e institution (presentacionales). Moneda y tipo son inmutables
// (ver contexto de diseño). Update parcial: al menos un campo.
export const updateAccountInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    institution: z.string().trim().min(1).max(60).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "At least one field is required");
export type UpdateAccountInput = z.infer<typeof updateAccountInput>;

export const accountResponse = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(accountTypeValues),
  currencyCode: z.string(),
  institution: z.string().nullable(),
  archived: z.boolean(),
});
export const accountListResponse = z.array(accountResponse);

export const currencyResponse = z.object({
  code: z.string(),
  name: z.string(),
  decimals: z.number(),
  kind: z.enum(["fiat", "crypto"]),
});
export const currencyListResponse = z.array(currencyResponse);
```

## Paso 4 — Service

Crear **`backend/src/modules/accounts/accounts.service.ts`**:

```typescript
import { and, eq } from "drizzle-orm";
import type { Database } from "../../infra/db/client.js";
import { ValidationError } from "../../shared/errors.js";
import { ownedBy, orThrow } from "../../shared/db-helpers.js";
import { accounts, currencies } from "./accounts.schema.js";
import type {
  CreateAccountInput,
  UpdateAccountInput,
} from "./accounts.types.js";

function toResponse(row: typeof accounts.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currencyCode: row.currencyCode,
    institution: row.institution,
    archived: row.archived,
  };
}

export async function listCurrencies(db: Database) {
  return db.select().from(currencies).orderBy(currencies.code);
}

export async function listAccounts(db: Database, userId: string) {
  const rows = await db
    .select()
    .from(accounts)
    .where(ownedBy(accounts.userId, userId, eq(accounts.archived, false)))
    .orderBy(accounts.name);
  return rows.map(toResponse);
}

export async function createAccount(
  db: Database,
  userId: string,
  input: CreateAccountInput,
) {
  // Moneda debe existir en la tabla de referencia → 400 limpio, no error de FK.
  const currency = await db.query.currencies.findFirst({
    where: eq(currencies.code, input.currencyCode),
  });
  if (!currency) {
    throw new ValidationError(`Unknown currency: ${input.currencyCode}`);
  }

  const duplicate = await db.query.accounts.findFirst({
    where: ownedBy(
      accounts.userId,
      userId,
      eq(accounts.name, input.name),
      eq(accounts.archived, false),
    ),
  });
  if (duplicate) {
    throw new ValidationError("An account with that name already exists");
  }

  const [created] = await db
    .insert(accounts)
    .values({
      userId,
      name: input.name,
      type: input.type,
      currencyCode: input.currencyCode,
      institution: input.institution ?? null,
    })
    .returning();
  return toResponse(created!);
}

export async function updateAccount(
  db: Database,
  userId: string,
  accountId: string,
  input: UpdateAccountInput,
) {
  const [updated] = await db
    .update(accounts)
    .set(input)
    .where(ownedBy(accounts.userId, userId, eq(accounts.id, accountId)))
    .returning();
  return toResponse(orThrow(updated, "account"));
}

export async function archiveAccount(
  db: Database,
  userId: string,
  accountId: string,
) {
  const [archived] = await db
    .update(accounts)
    .set({ archived: true })
    .where(ownedBy(accounts.userId, userId, eq(accounts.id, accountId)))
    .returning();
  orThrow(archived, "account");
}
```

Notas:

- Mismo patrón de seguridad que categories: escritura con ownership en el WHERE + `orThrow` → recurso ajeno da **404**, nunca 403.
- La verificación de moneda va en el service (400 con mensaje claro), aunque la FK también proteja: la FK es la red de seguridad, no la UX.

## Paso 5 — Rutas

Crear **`backend/src/modules/accounts/accounts.routes.ts`** (mismo esqueleto que categories):

```typescript
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Database } from "../../infra/db/client.js";
import {
  createAccountInput,
  updateAccountInput,
  accountResponse,
  accountListResponse,
  currencyListResponse,
} from "./accounts.types.js";
import {
  listCurrencies,
  listAccounts,
  createAccount,
  updateAccount,
  archiveAccount,
} from "./accounts.service.js";

const idParam = z.object({ id: z.string().uuid() });

export async function accountsRoutes(
  app: FastifyInstance,
  opts: { db: Database; requireAuth: preHandlerHookHandler },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/currencies",
    {
      preHandler: opts.requireAuth,
      schema: { response: { 200: currencyListResponse } },
    },
    async () => listCurrencies(opts.db),
  );

  r.get(
    "/accounts",
    {
      preHandler: opts.requireAuth,
      schema: { response: { 200: accountListResponse } },
    },
    async (request) => listAccounts(opts.db, request.user!.id),
  );

  r.post(
    "/accounts",
    {
      preHandler: opts.requireAuth,
      schema: { body: createAccountInput, response: { 201: accountResponse } },
    },
    async (request, reply) => {
      const created = await createAccount(
        opts.db,
        request.user!.id,
        request.body,
      );
      return reply.code(201).send(created);
    },
  );

  r.patch(
    "/accounts/:id",
    {
      preHandler: opts.requireAuth,
      schema: {
        params: idParam,
        body: updateAccountInput,
        response: { 200: accountResponse },
      },
    },
    async (request) =>
      updateAccount(opts.db, request.user!.id, request.params.id, request.body),
  );

  // DELETE archiva (soft delete) — DATABASE.md principio 6.
  r.delete(
    "/accounts/:id",
    {
      preHandler: opts.requireAuth,
      schema: { params: idParam, response: { 204: z.null() } },
    },
    async (request, reply) => {
      await archiveAccount(opts.db, request.user!.id, request.params.id);
      return reply.code(204).send();
    },
  );
}
```

Registrar en **`http/server.ts`**: `app.register(accountsRoutes, { db, requireAuth });`

## Paso 6 — Tests

**`backend/src/modules/accounts/accounts.test.ts`** — integración con Testcontainers, mismo setup que categories (dos usuarios con cookies). Casos obligatorios:

1. `GET /accounts` y `GET /currencies` sin cookie → 401.
2. `GET /currencies` → 200 con USD y COP (del seed), `kind: "fiat"`, `decimals: 2`.
3. userA crea cuenta `{ name: "Bancolombia Ahorros", type: "bank", currencyCode: "COP", institution: "Bancolombia" }` → 201 devolviendo `institution`.
4. Crear con `currencyCode: "EUR"` (no existe en el seed) → **400** con mensaje claro.
5. Crear con `type: "wallet"` (fuera del enum) → **400** (lo rechaza Zod).
6. Crear tres cuentas tipo `crypto` con la misma `institution: "Binance"` (currencyCode "USD" hasta que existan monedas cripto) → 201 las tres: el patrón multi-asset son N cuentas agrupadas por institución.
7. **Scoping**: userB no ve las cuentas de userA en su listado; `PATCH` de userB sobre cuenta de userA → **404**.
8. **Inmutabilidad**: `PATCH` con body `{ "currencyCode": "USD" }` o `{ "type": "cash" }` → el schema Zod de update solo acepta `name` (verificar que el server lo rechaza o lo ignora según el comportamiento del type provider — fijar el comportamiento observado en el test; lo obligatorio es que la moneda y el tipo NO cambien en la DB).
9. Duplicado activo: userA crea "Bancolombia" de nuevo → **400**.
10. Archivar → 204; el listado ya no la incluye; crear una nueva con el mismo nombre → 201 (el duplicado solo compara contra activas).

## Errores comunes que NO cometer

- Scopear `currencies` por usuario o darle endpoints de escritura (es referencia global de solo lectura).
- Permitir cambiar `currencyCode` o `type` en el PATCH.
- Agregar campo de balance a la tabla o calcularlo aquí (es `SUM(movements)`, SPEC-004 — DATABASE.md principio 2).
- Crear `credit_card_details` o monedas cripto (fuera de alcance).
- `userId` como `uuid` (es `text`).
- Responder 403 en recursos ajenos (patrón: 404 vía WHERE + orThrow).
- Dejar que el error de FK de moneda inexistente llegue como 500 (el service valida antes → 400).

## Criterios de aceptación

### Flujo E2E (compose levantado, sesión iniciada con `-c cookies.txt` como en SPEC-001)

```bash
BASE=http://localhost:3000

# 1. Monedas del seed → 200 con USD y COP
curl -s $BASE/currencies -b cookies.txt

# 2. Crear cuenta → 201 (con institution)
curl -si -X POST $BASE/accounts -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"name":"Bancolombia Ahorros","type":"bank","currencyCode":"COP","institution":"Bancolombia"}'

# 3. Moneda inexistente → 400
curl -si -X POST $BASE/accounts -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"name":"Revolut","type":"bank","currencyCode":"EUR"}'

# 4. Tipo inválido → 400
curl -si -X POST $BASE/accounts -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"name":"Algo","type":"wallet","currencyCode":"USD"}'

# 5. Update parcial (solo institution) → 200 con el resto intacto
curl -si -X PATCH $BASE/accounts/<ID> -b cookies.txt \
  -H 'content-type: application/json' -d '{"institution":"Grupo Bancolombia"}'

# 6. Archivar → 204, y el listado ya no la muestra
curl -si -X DELETE $BASE/accounts/<ID> -b cookies.txt
curl -s $BASE/accounts -b cookies.txt
```

- [ ] Pasos 1–6 con los códigos indicados.

### Criterios generales

- [ ] Migraciones versionadas (tablas + enums + seed de monedas), aplicadas por el arranque del compose.
- [ ] Los 10 casos de test pasan; `npm run typecheck` limpio.
- [ ] `/health`, auth y categories siguen funcionando.
- [ ] Cero `process.env` fuera de `config/`; rutas sin lógica; montaje con `app.register`; cero JSON Schema a mano.

## Al completar

**NO ejecutar `git commit` ni ningún comando de git.** Al terminar:

1. Marcar `Estado: ✅ completado <fecha>` y tildar los checkboxes verificados (lo no verificado queda destildado con nota).
2. Actualizar la tabla de orden de construcción en `docs/DATABASE.md` (SPEC-003 → ✅).
3. Responder con: resumen de lo implementado, archivos creados/modificados, resultado de tests y typecheck, desviaciones justificadas, y el **mensaje de commit recomendado** según `docs/COMMITS.md` (base sugerida: `feat(accounts): accounts module with currencies reference table`, con `SPEC-003` en el cuerpo). El commit lo hace el humano.
