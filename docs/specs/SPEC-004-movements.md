# SPEC-004: Movimientos y transferencias

Estado: ✅ completado 2026-07-30

Ejecutar cumpliendo `ARCHITECTURE.md`, `backend/ARCHITECTURE.md` y
`docs/DATABASE.md`, [ADR-003](../architecture/adr/ADR-003-transfers-as-ledger-groups.md)
y [ADR-007](../architecture/adr/ADR-007-pragmatic-double-entry.md). Ante una
contradicción, prevalece la documentación vigente. Este spec contiene la
primera lógica de negocio, funciones puras de dinero y transacciones de DB.

## Objetivo

El ledger: registrar ingresos, gastos y ajustes en cuentas; transferencias entre cuentas (misma o distinta moneda) con comisión, creadas atómicamente como grupo de movimientos (ADR-003); balances derivados por cuenta; listado con filtros. Al cerrar este spec, la aplicación de finanzas es funcional vía API.

## Alcance

**Incluye:** tablas `movements` + `transfers`, funciones puras de cálculo (con unit tests), servicios con transacciones de DB, endpoints (crear/listar/editar/eliminar movimientos, crear/eliminar transferencias, balances), funciones públicas nuevas en los servicios de accounts y categories para validación cross-módulo, tests de integración.

**No incluye:** reportes agregados por categoría o período, edición de
transferencias, recurrencia, adjuntos/recibos ni paginación con cursor.

## Contexto de diseño (leer antes de codificar)

- **Signo por tipo** (principio 3): montos siempre positivos (`bigint`), el `type` da el signo. Positivos: `income`, `transfer_in`, `adjustment_in`. Negativos: `expense`, `transfer_out`, `adjustment_out`. El balance de una cuenta = suma de montos con signo.
- **Transferencia = grupo atómico** (ADR-003): fila en `transfers` + movimiento `transfer_out` en la cuenta origen + `transfer_in` en la destino + opcionalmente la comisión como movimiento `expense` en la cuenta origen (categoría "Comisiones" del sistema por defecto: `00000000-0000-4000-8000-000000000010`). Todos enlazados por `transfer_id`, creados en **una transacción de DB**: o entra todo o no entra nada.
- **FX**: se guardan ambos montos reales (salió X COP, entró Y USD). La tasa NUNCA se almacena — es derivada. Misma moneda: `amountTo` opcional (default = `amountFrom`); si se envía y difiere → 400 (la diferencia se modela como comisión). Distinta moneda: `amountTo` obligatorio.
- **Los movimientos de una transferencia son intocables individualmente**: PATCH/DELETE sobre un movimiento con `transfer_id` → 400 con mensaje que apunte a `DELETE /transfers/:id` (elimina el grupo completo, atómico).
- **DELETE de movimientos simples es hard delete** — el principio 6 (archivar)
  aplica a cuentas/categorías con historial, no a corregir una fila del ledger
  propio mediante el endpoint autenticado.
- **Montos en unidades mínimas** (centavos) como `number` de JS: la columna es `bigint` con `{ mode: "number" }` en Drizzle. Rango seguro hasta 2^53 (~9×10¹⁵ centavos ≈ 90 billones de pesos) — de sobra; no usar `mode: "bigint"` (rompe la serialización JSON).
- **Validación cross-módulo por servicios públicos** (regla 4): movements NUNCA consulta las tablas `accounts` o `categories` directamente — llama funciones exportadas de esos servicios (se agregan en el Paso 1).
- `user_id` es `text`; `occurred_at` es `date` (solo fecha, sin hora — principio 4).

## Paso 1 — Funciones públicas nuevas en módulos existentes

En **`accounts.service.ts`** agregar (sin tocar lo existente):

```typescript
/** Cuenta del usuario, activa. Lanza NotFoundError si no existe/no es suya; ValidationError si está archivada. */
export async function getOwnedActiveAccount(
  db: Database,
  userId: string,
  accountId: string,
) {
  const account = orThrow(
    await db.query.accounts.findFirst({
      where: ownedBy(accounts.userId, userId, eq(accounts.id, accountId)),
    }),
    "account",
  );
  if (account.archived) {
    throw new ValidationError("Account is archived");
  }
  return account;
}
```

En **`categories.service.ts`** agregar:

```typescript
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
```

## Paso 2 — Schema Drizzle

Crear **`backend/src/modules/movements/movements.schema.ts`**:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  date,
  timestamp,
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
  // Unidades mínimas (centavos), SIEMPRE positivo. mode number: seguro hasta 2^53.
  amount: bigint("amount", { mode: "number" }).notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  transferId: uuid("transfer_id").references(() => transfers.id),
  description: text("description"),
  occurredAt: date("occurred_at", { mode: "string" }).notNull(),
  source: movementSource("source").notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Nota: importar tablas de otros módulos para **declarar FKs** está permitido (es definición de schema, no query); lo prohibido por la regla 4 es _consultarlas_. Re-exportar en `infra/db/schema.ts` y `npm run db:generate`.

## Paso 3 — Funciones puras de cálculo (regla 10)

Crear **`backend/src/modules/movements/movements.calc.ts`** — sin imports de DB, solo datos:

```typescript
export type MovementType =
  | "income"
  | "expense"
  | "transfer_in"
  | "transfer_out"
  | "adjustment_in"
  | "adjustment_out";

const POSITIVE: ReadonlySet<MovementType> = new Set([
  "income",
  "transfer_in",
  "adjustment_in",
]);

/** Monto con signo según el tipo. El monto de entrada SIEMPRE es positivo. */
export function signedAmount(type: MovementType, amount: number): number {
  return POSITIVE.has(type) ? amount : -amount;
}

/** Balance = suma de montos con signo. */
export function computeBalance(
  rows: ReadonlyArray<{ type: MovementType; amount: number }>,
): number {
  return rows.reduce((acc, r) => acc + signedAmount(r.type, r.amount), 0);
}

/** Tasa de cambio derivada de una transferencia FX (solo para display; nunca se almacena). */
export function deriveRate(amountFrom: number, amountTo: number): number {
  return amountTo / amountFrom;
}
```

**`movements.calc.test.ts`** — unit tests puros (sin Testcontainers): signo correcto para los 6 tipos; balance de una mezcla de movimientos; balance negativo (tarjeta); lista vacía = 0; deriveRate.

## Paso 4 — Types y schemas Zod

Crear **`backend/src/modules/movements/movements.types.ts`**:

```typescript
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
// Monto en unidades mínimas: entero positivo.
const minorUnits = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

// Solo tipos creables directamente: los transfer_* nacen exclusivamente vía POST /transfers.
export const directMovementTypes = [
  "income",
  "expense",
  "adjustment_in",
  "adjustment_out",
] as const;

export const createMovementInput = z.object({
  accountId: z.string().uuid(),
  type: z.enum(directMovementTypes),
  amount: minorUnits,
  categoryId: z.string().uuid().nullish(),
  description: z.string().trim().max(300).nullish(),
  occurredAt: isoDate,
});
export type CreateMovementInput = z.infer<typeof createMovementInput>;

export const updateMovementInput = z
  .object({
    amount: minorUnits,
    categoryId: z.string().uuid().nullable(),
    description: z.string().trim().max(300).nullable(),
    occurredAt: isoDate,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "At least one field is required");
export type UpdateMovementInput = z.infer<typeof updateMovementInput>;

export const createTransferInput = z
  .object({
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    amountFrom: minorUnits,
    amountTo: minorUnits.optional(),
    feeAmount: minorUnits.optional(),
    feeCategoryId: z.string().uuid().optional(),
    description: z.string().trim().max(300).nullish(),
    occurredAt: isoDate,
  })
  .refine(
    (v) => v.fromAccountId !== v.toAccountId,
    "Cannot transfer to the same account",
  );
export type CreateTransferInput = z.infer<typeof createTransferInput>;

export const listMovementsQuery = z.object({
  accountId: z.string().uuid().optional(),
  type: z
    .enum([
      "income",
      "expense",
      "transfer_in",
      "transfer_out",
      "adjustment_in",
      "adjustment_out",
    ])
    .optional(),
  categoryId: z.string().uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListMovementsQuery = z.infer<typeof listMovementsQuery>;

export const movementResponse = z.object({
  id: z.string(),
  accountId: z.string(),
  type: z.string(),
  amount: z.number(),
  categoryId: z.string().nullable(),
  transferId: z.string().nullable(),
  description: z.string().nullable(),
  occurredAt: z.string(),
  source: z.string(),
});
export const movementListResponse = z.array(movementResponse);

export const balanceResponse = z.array(
  z.object({ accountId: z.string(), balance: z.number() }),
);

export const transferResponse = z.object({
  id: z.string(),
  movements: movementListResponse,
});
```

## Paso 5 — Service

Crear **`backend/src/modules/movements/movements.service.ts`**. Constante y helper del módulo:

```typescript
export const SYSTEM_FEE_CATEGORY_ID = "00000000-0000-4000-8000-000000000010"; // 'Comisiones'
```

Funciones (firmas y reglas; el cuerpo sigue los patrones de los módulos anteriores):

**`createMovement(db, userId, input)`**

1. `getOwnedActiveAccount(db, userId, input.accountId)` (404/400 según corresponda).
2. Si `input.categoryId`: `getAccessibleCategory(db, userId, input.categoryId)`.
3. Insert con `source: "manual"`, `transferId: null`. Devolver el movimiento.

**`listMovements(db, userId, query)`**

- WHERE base: `ownedBy(movements.userId, userId, ...)`; condiciones opcionales por cada filtro presente (accountId, type, categoryId, `gte(occurredAt, from)`, `lte(occurredAt, to)`).
- Orden: `occurredAt` desc, `createdAt` desc. `limit`/`offset` del query.

**`updateMovement(db, userId, movementId, input)`**

1. Buscar con ownership (`ownedBy` + id) → orThrow.
2. Si `transferId !== null` → `ValidationError("Transfer movements are edited via their transfer")`.
3. Si viene `categoryId` (no null): validarla accesible.
4. UPDATE parcial con `set(input)` (mismo WHERE de ownership). Devolver actualizado.

**`deleteMovement(db, userId, movementId)`**

1. Buscar con ownership → orThrow.
2. Si `transferId !== null` → mismo ValidationError.
3. DELETE (hard).

**`getBalances(db, userId)`**

- Traer `{ accountId, type, amount }` de todos los movimientos del usuario (solo tabla movements) y agregar en memoria con `computeBalance` agrupando por accountId — o con `SUM(CASE ...)` en SQL. Preferir la agregación en SQL por eficiencia, PERO el mapa de signos debe salir de un solo lugar: si se hace en SQL, dejar un comentario apuntando a `movements.calc.ts` como definición canónica y un test que compare ambos caminos. La opción en memoria es aceptable a esta escala si resulta más simple.
- Devuelve `[{ accountId, balance }]` — solo cuentas con movimientos (el frontend une con `/accounts`; cuenta sin movimientos = balance 0 implícito).

**`createTransfer(db, userId, input)`** — el corazón del spec:

```typescript
export async function createTransfer(
  db: Database,
  userId: string,
  input: CreateTransferInput,
) {
  const from = await getOwnedActiveAccount(db, userId, input.fromAccountId);
  const to = await getOwnedActiveAccount(db, userId, input.toAccountId);

  const sameCurrency = from.currencyCode === to.currencyCode;
  let amountTo: number;
  if (sameCurrency) {
    if (input.amountTo !== undefined && input.amountTo !== input.amountFrom) {
      throw new ValidationError(
        "Same-currency transfers must have equal amounts; model differences as fee",
      );
    }
    amountTo = input.amountFrom;
  } else {
    if (input.amountTo === undefined) {
      throw new ValidationError(
        "amountTo is required for cross-currency transfers",
      );
    }
    amountTo = input.amountTo;
  }

  const feeCategoryId = input.feeCategoryId ?? SYSTEM_FEE_CATEGORY_ID;
  if (input.feeAmount !== undefined) {
    await getAccessibleCategory(db, userId, feeCategoryId);
  }

  return db.transaction(async (tx) => {
    const [transfer] = await tx
      .insert(transfers)
      .values({ userId })
      .returning();
    const base = {
      userId,
      transferId: transfer!.id,
      occurredAt: input.occurredAt,
      description: input.description ?? null,
      source: "manual" as const,
    };
    const rows = [
      {
        ...base,
        accountId: from.id,
        type: "transfer_out" as const,
        amount: input.amountFrom,
        categoryId: null,
      },
      {
        ...base,
        accountId: to.id,
        type: "transfer_in" as const,
        amount: amountTo,
        categoryId: null,
      },
      ...(input.feeAmount !== undefined
        ? [
            {
              ...base,
              accountId: from.id,
              type: "expense" as const,
              amount: input.feeAmount,
              categoryId: feeCategoryId,
            },
          ]
        : []),
    ];
    const created = await tx.insert(movements).values(rows).returning();
    return { id: transfer!.id, movements: created };
  });
}
```

**`deleteTransfer(db, userId, transferId)`**

1. Buscar el transfer con ownership → orThrow.
2. En una transacción: DELETE de todos los movimientos con ese `transferId`, luego DELETE del transfer.

## Paso 6 — Rutas

Crear **`backend/src/modules/movements/movements.routes.ts`** siguiendo el patrón exacto de accounts (type provider, `preHandler: requireAuth`, `opts: { db, requireAuth }`):

| Método y ruta           | Schema                                           | Servicio       | Código |
| ----------------------- | ------------------------------------------------ | -------------- | ------ |
| `GET /movements`        | `querystring: listMovementsQuery`, 200: lista    | listMovements  | 200    |
| `POST /movements`       | body: createMovementInput, 201                   | createMovement | 201    |
| `PATCH /movements/:id`  | params id, body: updateMovementInput, 200        | updateMovement | 200    |
| `DELETE /movements/:id` | params id, 204                                   | deleteMovement | 204    |
| `GET /balances`         | 200: balanceResponse                             | getBalances    | 200    |
| `POST /transfers`       | body: createTransferInput, 201: transferResponse | createTransfer | 201    |
| `DELETE /transfers/:id` | params id, 204                                   | deleteTransfer | 204    |

Registrar en `http/server.ts`: `app.register(movementsRoutes, { db, requireAuth });`

## Paso 7 — Tests

**Unit** (`movements.calc.test.ts`): descritos en el Paso 3.

**Integración de las funciones públicas del Paso 1** — en los archivos de test de SUS módulos (son contrato público consumido por otros módulos; se prueban contra Postgres real, nunca mockeando Drizzle):

En `accounts.test.ts`, agregar casos para `getOwnedActiveAccount` (llamada directa a la función, no vía HTTP):

- Cuenta propia activa → devuelve la fila (con `currencyCode`, que createTransfer necesita).
- Cuenta de otro usuario → lanza `NotFoundError`.
- Id inexistente → lanza `NotFoundError`.
- Cuenta propia archivada → lanza `ValidationError`.

En `categories.test.ts`, agregar casos para `getAccessibleCategory`:

- Categoría propia activa → la devuelve.
- Categoría del sistema (id fijo del seed) → la devuelve.
- Categoría de otro usuario → lanza `NotFoundError`.
- Categoría propia archivada → lanza `ValidationError`.

**Integración** (`movements.test.ts`, Testcontainers, dos usuarios, cuentas y categorías creadas en el setup — incluir una cuenta COP, una USD y una archivada). Casos obligatorios:

1. 401 sin cookie en `GET /movements`, `POST /movements`, `GET /balances`, `POST /transfers`.
2. Crear expense de 50000 en cuenta COP con categoría del sistema → 201; `GET /balances` → esa cuenta en −50000.
3. Crear income de 200000 → balance neto 150000.
4. `adjustment_in` de 1000000 como "balance inicial" → balance correcto.
5. Zod: amount 0, negativo o con decimales → 400; `type: "transfer_in"` en POST /movements → 400 (no es tipo directo); fecha "30/07/2026" → 400.
6. Cuenta de otro usuario → 404; cuenta archivada → 400; categoría de otro usuario → 404; categoría del sistema → OK.
7. **Transferencia misma moneda con fee**: COP→COP, amountFrom 100000, feeAmount 5000 → 201 con 3 movimientos; balances: origen −105000 respecto a su valor previo, destino +100000; los 3 movimientos comparten `transferId`; el fee tiene `categoryId` = Comisiones del sistema.
8. **Transferencia FX**: COP→USD con amountFrom 400000 y amountTo 10000 → 201; balance de cada cuenta cambia en su propia moneda.
9. Reglas de transferencia: misma cuenta → 400; FX sin amountTo → 400; misma moneda con amountTo ≠ amountFrom → 400.
10. **Inmutabilidad del grupo**: PATCH y DELETE sobre un movimiento con transferId → 400.
11. `DELETE /transfers/:id` → 204; los 3 movimientos desaparecen y los balances vuelven al estado previo (verificar con `GET /balances`).
12. PATCH parcial de un movimiento simple (solo categoryId) → 200; cambiar amount → el balance lo refleja.
13. Filtros de listado: por accountId, por type, por rango de fechas; límite y offset.
14. **Scoping**: userB no ve movimientos ni balances de userA; DELETE de userB sobre transfer de userA → 404.

## Errores comunes que NO cometer

- Guardar la tasa de cambio (se deriva; se guardan ambos montos — ADR-003).
- Crear los movimientos de una transferencia fuera de `db.transaction` (un fallo a mitad deja el ledger descuadrado).
- Permitir `transfer_in`/`transfer_out` en POST /movements, o editar/borrar movimientos de un transfer individualmente.
- Columna o campo de balance en cualquier tabla (principio 2).
- `mode: "bigint"` en la columna amount (rompe JSON); floats en cualquier monto.
- Duplicar el mapa de signos: `movements.calc.ts` es la definición canónica.
- Consultar las tablas de accounts/categories desde el service de movements (usar las funciones públicas del Paso 1).
- Aceptar montos en pesos/dólares "con decimales" — la API habla unidades mínimas, enteras, siempre.

## Criterios de aceptación

### Flujo E2E (compose levantado, sesión iniciada, con una cuenta COP y una USD creadas — ids a mano)

```bash
BASE=http://localhost:3000

# 1. Gasto → 201, y /balances lo refleja en negativo
curl -si -X POST $BASE/movements -b cookies.txt -H 'content-type: application/json' \
  -d '{"accountId":"<COP>","type":"expense","amount":50000,"categoryId":"00000000-0000-4000-8000-000000000001","description":"Mercado semanal","occurredAt":"2026-07-30"}'
curl -s $BASE/balances -b cookies.txt

# 2. Balance inicial vía adjustment_in → balance correcto
curl -si -X POST $BASE/movements -b cookies.txt -H 'content-type: application/json' \
  -d '{"accountId":"<COP>","type":"adjustment_in","amount":1000000,"occurredAt":"2026-07-01"}'

# 3. Transferencia FX con comisión → 201 con 3 movimientos
curl -si -X POST $BASE/transfers -b cookies.txt -H 'content-type: application/json' \
  -d '{"fromAccountId":"<COP>","toAccountId":"<USD>","amountFrom":400000,"amountTo":10000,"feeAmount":5000,"occurredAt":"2026-07-30"}'
curl -s $BASE/balances -b cookies.txt

# 4. Editar un movimiento del transfer → 400
curl -si -X PATCH $BASE/movements/<ID_TRANSFER_OUT> -b cookies.txt \
  -H 'content-type: application/json' -d '{"amount":1}'

# 5. Eliminar el transfer → 204 y los balances vuelven
curl -si -X DELETE $BASE/transfers/<ID_TRANSFER> -b cookies.txt
curl -s $BASE/balances -b cookies.txt

# 6. Listado con filtros
curl -s "$BASE/movements?accountId=<COP>&type=expense&from=2026-07-01&to=2026-07-31" -b cookies.txt
```

- [x] Pasos 1–6 con los comportamientos indicados (verificado mediante la integración E2E contra Postgres real, incluyendo los números de los balances).

### Criterios generales

- [x] Migraciones versionadas aplicadas por el arranque del compose (el entrypoint ejecuta `drizzle-kit migrate`; la migración `0006` también fue aplicada por los tests de integración).
- [x] Unit tests de `movements.calc.ts` + tests de las funciones públicas nuevas (en accounts y categories) + los 14 casos de integración de movements pasan; `npm run typecheck` limpio.
- [x] `/health`, auth, categories y accounts siguen funcionando.
- [x] Cero `process.env` fuera de `config/`; rutas sin lógica; cero JSON Schema a mano; cross-módulo solo vía servicios públicos.

## Al completar

**NO ejecutar `git commit` ni ningún comando de git.** Al terminar:

1. Marcar `Estado: ✅ completado <fecha>` y tildar los checkboxes verificados.
2. Confirmar que `docs/DATABASE.md`, ADR-003 y ADR-007 reflejan el ledger implementado.
3. Responder con: resumen, archivos creados/modificados, resultado de tests y typecheck, desviaciones justificadas, y el **mensaje de commit recomendado** según `docs/COMMITS.md` (base sugerida: `feat(movements): ledger with transfers, fx and derived balances`, con `SPEC-004` en el cuerpo). El commit lo hace el humano.
