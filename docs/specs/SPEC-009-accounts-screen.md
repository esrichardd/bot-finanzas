# SPEC-009: Pantalla de cuentas y saldo inicial transaccional

Estado: ✅ completado — 2026-08-06

Ejecutar cumpliendo `ARCHITECTURE.md` y `frontend/ARCHITECTURE.md`. Ambos documentos son normativos. Este spec toca backend y frontend porque el saldo inicial debe crearse de forma atómica con la cuenta: no se permite resolver esa garantía con dos escrituras independientes desde el navegador ni desde una Server Action.

Este documento es deliberadamente explícito. Los snippets muestran la intención y la estructura esperadas; deben adaptarse sólo cuando los tipos exactos de la versión instalada lo exijan. Antes de escribir código Next.js, leer las guías relevantes incluidas en `frontend/node_modules/next/dist/docs/`, como exige `frontend/AGENTS.md` (en particular formularios, Server Actions, manejo de errores y revalidación). No sustituir los patrones de este spec por librerías o arquitecturas distintas.

## Objetivo

Entregar la primera pantalla financiera funcional del frontend:

1. `/accounts` permite consultar y administrar cuentas bancarias, efectivo y cripto.
2. El usuario puede buscar, filtrar y ordenar sus cuentas.
3. El usuario puede crear una cuenta con un saldo inicial opcional.
4. Cuenta + saldo inicial se guardan en una sola transacción de PostgreSQL.
5. El saldo inicial se representa como un movimiento `adjustment_in` o `adjustment_out`; nunca se almacena en una columna de balance.
6. El usuario puede editar nombre e institución, ajustar el saldo actual, archivar una cuenta en cero y restaurar una cuenta archivada.
7. Las tarjetas de crédito quedan completamente fuera de esta pantalla. Tendrán una UI y un spec separados.

Al terminar, un usuario nuevo puede crear su primera cuenta, indicar cuánto dinero tiene, verla con el saldo correcto y administrar su ciclo de vida sin usar `curl`.

## Decisiones de producto y dominio (normativas)

### 1. Tarjetas de crédito separadas en UI

Aunque `credit_card` siga siendo un valor válido de `accounts.type` en la API y comparta las tablas `accounts` y `movements`, `/accounts` NO debe:

- listar tarjetas de crédito;
- ofrecer `credit_card` en el formulario de creación;
- mostrar cupo, deuda, corte, fecha de pago ni cuota de manejo;
- enlazar a la configuración de tarjetas;
- contener condicionales visuales propios de tarjetas.

La navegación existente conserva `/credit-cards`. Un spec posterior implementará allí toda la experiencia de tarjetas. El backend genérico de cuentas puede seguir aceptando `credit_card` para que esa futura pantalla reutilice los servicios de dominio.

En este spec, la pantalla `/accounts` muestra los tipos:

- `bank` — cuenta bancaria;
- `cash` — efectivo;
- `crypto` — cuenta o wallet de un único activo cripto.

### 2. Una cuenta tiene exactamente una moneda

Se mantiene el corolario de `docs/DATABASE.md`: una cuenta nunca es multimoneda. No agregar ni inferir restricciones nuevas entre `accounts.type` y `currencies.kind`.

El comportamiento actual permite, de forma deliberada, una cuenta de plataforma cripto denominada en fiat, por ejemplo “Binance USD” con `type: "crypto"` y `currencyCode: "USD"`. También permite wallets como “Binance BTC”. Este spec debe conservar ese contrato y todos sus tests existentes.

El selector de moneda muestra todas las monedas disponibles, agrupadas o etiquetadas por `kind` si el componente lo permite sin complejidad extra. Cambiar el tipo de cuenta NO filtra ni invalida la moneda seleccionada.

### 3. El saldo sigue siendo derivado

No agregar columnas `balance`, `initial_balance` ni equivalentes a `accounts`.

El saldo inicial es un movimiento normal del ledger:

| Elección semántica | Movimiento persistido | Efecto en saldo |
| --- | --- | --- |
| Saldo disponible | `adjustment_in` | positivo |
| Saldo negativo | `adjustment_out` | negativo |
| Sin saldo inicial | ninguno | cero |

El objeto de saldo inicial sólo se envía cuando el monto es mayor que cero. Un input vacío o `0` significa “crear la cuenta sin movimiento inicial”. El monto almacenado siempre es positivo; el signo lo determina el tipo de movimiento.

El movimiento inicial usa:

- `categoryId: null`;
- `transferId: null`;
- `source: "manual"`;
- `description: "Saldo inicial"`;
- `occurredAt`: fecha elegida por el usuario.

Los futuros reportes de ingresos/gastos deben excluir ajustes, por lo que este movimiento NO se registra como `income`.

### 4. La creación es atómica

El frontend realiza una sola mutación: `POST /api/accounts`.

El backend crea la cuenta y el movimiento inicial dentro de una única llamada a `db.transaction`. Si falla cualquiera de las dos operaciones, no queda persistida ninguna. Está prohibido implementar:

```text
POST /accounts
POST /movements
```

como dos escrituras consecutivas desde el frontend. También está prohibido crear endpoints artificiales como `/accounts-with-balance`.

### 5. El saldo inicial no se “edita”

Editar una cuenta sólo cambia `name` e `institution`. Tipo y moneda continúan inmutables.

Si el saldo mostrado es incorrecto, el usuario utiliza la acción separada “Ajustar saldo”. Esa acción pide el saldo actual correcto (valor objetivo) y el backend calcula la diferencia. El frontend nunca calcula cuánto debe sumar o restar.

Ejemplo:

- saldo actual: `100000`;
- saldo objetivo: `70000`;
- backend crea `adjustment_out` por `30000`.

### 6. Archivar requiere saldo cero

Una cuenta con saldo distinto de cero no puede archivarse. Esta es una regla de dominio del backend, no una validación exclusiva de la interfaz.

Para archivarla, el usuario primero debe transferir el dinero o usar “Ajustar saldo” para llevarla a cero. Así una cuenta con activos o deuda no desaparece silenciosamente de las vistas activas.

Archivar conserva todos sus movimientos. No existe hard delete de cuentas.

Las cuentas archivadas se pueden consultar desde la pestaña “Archivadas” y restaurar. Restaurar falla si ya existe una cuenta activa del mismo usuario con el mismo nombre.

### 7. No sumar monedas incompatibles

Esta pantalla muestra el saldo de cada cuenta en su propia moneda. No mostrar un “saldo total” mezclando COP, USD y BTC. Una valoración consolidada requiere precios/tasas y queda fuera de alcance.

## Alcance

### Incluye

- Extensión backwards-compatible de `POST /api/accounts` con `openingBalance` opcional.
- Orquestación transaccional cuenta + movimiento inicial.
- Tipo DB reutilizable por servicios que deben correr con DB normal o transacción Drizzle.
- Códigos de error de dominio estables para que el frontend no dependa de mensajes técnicos.
- Listado de cuentas activas o archivadas.
- Restauración de cuentas archivadas.
- Bloqueo de archivo cuando el saldo no sea cero.
- Endpoint para ajustar una cuenta a un saldo objetivo.
- Función pura que calcula el movimiento de ajuste requerido.
- Cliente API frontend para cuentas, monedas, balances y ajustes.
- `/accounts` como Server Component con fetches paralelos.
- Listado responsive, búsqueda, filtros, orden, estados vacíos y menús de acciones.
- Formularios de crear, editar y ajustar; confirmación de archivo y restauración.
- i18n completo es/en y funcionamiento light/dark.
- Tests backend y QA manual de navegador.

### NO incluye

- Pantalla o formularios de tarjetas de crédito.
- Configuración de cupo, corte, pago o cuota de manejo.
- Pantalla general de movimientos o transferencias.
- CRUD de categorías.
- Dashboard con reportes.
- Precios o valoración de cripto.
- Cuentas multimoneda.
- Cambio de tipo o moneda después de crear una cuenta.
- Eliminación física de cuentas o movimientos.
- Paginación de cuentas: una persona tendrá pocas; no introducir complejidad sin necesidad.
- React Query, SWR, Redux, Zustand o contextos con datos de API.
- Formularios con React Hook Form: seguir el patrón existente y usar Server Actions + `useActionState`.
- Un endpoint específico por pantalla o un BFF adicional en Fastify.

## Contratos HTTP finales

Al terminar, estos son los contratos relevantes:

```text
GET    /api/currencies
GET    /api/accounts?status=active
GET    /api/accounts?status=archived
POST   /api/accounts
PATCH  /api/accounts/:id
DELETE /api/accounts/:id
POST   /api/accounts/:id/restore
GET    /api/balances
POST   /api/accounts/:id/balance-adjustments
```

`status` admite únicamente `active | archived` y por defecto es `active`, conservando el comportamiento actual de `GET /api/accounts`.

### Crear una cuenta sin saldo inicial

Request:

```json
{
  "name": "Bancolombia",
  "type": "bank",
  "currencyCode": "COP",
  "institution": "Bancolombia"
}
```

Response `201`: se conserva `accountResponse` actual.

```json
{
  "id": "uuid",
  "name": "Bancolombia",
  "type": "bank",
  "currencyCode": "COP",
  "institution": "Bancolombia",
  "archived": false
}
```

No se crea ningún movimiento y su saldo derivado es cero.

### Crear una cuenta con saldo inicial positivo

```json
{
  "name": "Bancolombia",
  "type": "bank",
  "currencyCode": "COP",
  "institution": "Bancolombia",
  "openingBalance": {
    "amount": 250000000,
    "direction": "in",
    "occurredAt": "2026-08-02"
  }
}
```

El response sigue siendo `201 accountResponse`. El backend crea adicionalmente un `adjustment_in` por `250000000` y `/api/balances` devuelve ese saldo.

### Crear una cuenta con saldo inicial negativo

```json
{
  "name": "Cuenta sobregirada",
  "type": "bank",
  "currencyCode": "COP",
  "openingBalance": {
    "amount": 5000000,
    "direction": "out",
    "occurredAt": "2026-08-02"
  }
}
```

Se crea `adjustment_out` por `5000000`; el balance derivado es `-5000000`.

### Ajustar al saldo objetivo

```json
{
  "targetBalance": {
    "amount": 7000000,
    "direction": "in"
  },
  "occurredAt": "2026-08-02"
}
```

El backend convierte el objetivo a un entero con signo, compara contra el saldo actual y crea exactamente un movimiento por la diferencia. Response: `201 movementResponse`.

Para objetivo cero usar:

```json
{
  "targetBalance": {
    "amount": 0,
    "direction": "in"
  },
  "occurredAt": "2026-08-02"
}
```

Cuando el saldo actual ya es igual al objetivo, responder `400` con `ACCOUNT_ALREADY_AT_TARGET_BALANCE`; no crear un movimiento de monto cero.

## Backend

### Paso 1 — Tipo DB compatible con transacciones

Problema: `Database` incluye detalles de la conexión raíz que una transacción Drizzle puede no exponer con el mismo tipo, aunque ambas permitan `select`, `insert`, `update`, `delete` y `query`.

En `backend/src/infra/db/client.ts`, agregar un tipo estructural común. Snippet de referencia:

```ts
export type Database = ReturnType<typeof createDb>["db"];

/** Operaciones disponibles tanto en la DB raíz como dentro de db.transaction. */
export type DbExecutor = Pick<
  Database,
  "select" | "insert" | "update" | "delete" | "query"
>;
```

Si la versión instalada de Drizzle exige una forma ligeramente distinta, inferir el tipo de `tx` desde `Database["transaction"]`, pero mantener el objetivo: los servicios de dominio reciben una interfaz estructural mínima; NO usar `any`, casts dobles ni duplicar las inserciones dentro del orquestador.

Cambiar a `DbExecutor` sólo las funciones que deben poder participar en esta transacción:

- `accounts.service.ts`: `createAccount`, `getOwnedActiveAccount`, `archiveAccount` y helpers internos que estas llamen.
- `movements.service.ts`: `createMovement`, `getAccountBalance` y helpers internos que estas llamen.
- `categories.service.ts`: `getAccessibleCategory`, porque `createMovement` la puede invocar.

Las funciones que abren su propia transacción, como `createTransfer`, siguen recibiendo `Database`. No hacer un reemplazo mecánico indiscriminado.

### Paso 2 — Schemas Zod de cuentas

En `backend/src/modules/accounts/accounts.types.ts`, conservar `createAccountInput` como schema base del servicio de cuenta y agregar el comando público `openAccountInput`:

```ts
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const minorUnits = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

export const openingBalanceInput = z.object({
  amount: minorUnits,
  direction: z.enum(["in", "out"]),
  occurredAt: isoDate,
});

export const openAccountInput = createAccountInput.extend({
  openingBalance: openingBalanceInput.optional(),
});

export type OpenAccountInput = z.infer<typeof openAccountInput>;

export const listAccountsQuery = z.object({
  status: z.enum(["active", "archived"]).default("active"),
});

export type ListAccountsQuery = z.infer<typeof listAccountsQuery>;
```

No aceptar `amount: 0` dentro de `openingBalance`. Cero se representa omitiendo el objeto completo.

En `backend/src/modules/movements/movements.types.ts` agregar:

```ts
const nonNegativeMinorUnits = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);

export const adjustAccountBalanceInput = z.object({
  targetBalance: z.object({
    amount: nonNegativeMinorUnits,
    direction: z.enum(["in", "out"]),
  }),
  occurredAt: isoDate,
});

export type AdjustAccountBalanceInput = z.infer<
  typeof adjustAccountBalanceInput
>;
```

`direction` con monto `0` se ignora semánticamente: ambos representan cero. La UI enviará `in` por consistencia.

### Paso 3 — Errores de dominio estables

No hacer que el frontend compare el texto inglés de `message`. Crear errores tipados con códigos estables, por ejemplo en `backend/src/modules/accounts/accounts.errors.ts`:

```ts
import { AppError } from "../../shared/errors.js";

export class AccountNameConflictError extends AppError {
  constructor() {
    super(
      "An active account with that name already exists",
      400,
      "ACCOUNT_NAME_CONFLICT",
    );
  }
}

export class AccountBalanceNotZeroError extends AppError {
  constructor() {
    super(
      "Account balance must be zero before archiving",
      400,
      "ACCOUNT_BALANCE_NOT_ZERO",
    );
  }
}

export class AccountAlreadyActiveError extends AppError {
  constructor() {
    super(
      "Account is already active",
      400,
      "ACCOUNT_ALREADY_ACTIVE",
    );
  }
}
```

Y en `backend/src/modules/movements/movements.errors.ts`:

```ts
import { AppError } from "../../shared/errors.js";

export class AccountAlreadyAtTargetBalanceError extends AppError {
  constructor() {
    super(
      "Account already has the requested balance",
      400,
      "ACCOUNT_ALREADY_AT_TARGET_BALANCE",
    );
  }
}
```

Reutilizar `NotFoundError` para ids inexistentes o ajenos. Nunca revelar si una cuenta pertenece a otro usuario.

### Paso 4 — Reglas del servicio base de cuentas

Actualizar `createAccount`:

1. Buscar la moneda.
2. Si no existe, mantener el error de moneda desconocida.
3. Validar nombre duplicado entre cuentas activas del mismo usuario.
4. Insertar la cuenta.

No agregar una validación `account.type` ↔ `currency.kind`: rompería cuentas válidas ya cubiertas por el proyecto, como `type: "crypto"` con USD.

Actualizar también `updateAccount`: cuando `input.name` cambie, verificar que no exista otra cuenta activa del mismo usuario con ese nombre, excluyendo el id actual. Actualmente la creación protege duplicados, pero un PATCH puede introducirlos; cerrar ese hueco aquí.

Actualizar `listAccounts` para recibir `status` y filtrar explícitamente:

```ts
export async function listAccounts(
  db: Database,
  userId: string,
  status: "active" | "archived",
) {
  return db
    .select()
    .from(accounts)
    .where(
      ownedBy(
        accounts.userId,
        userId,
        eq(accounts.archived, status === "archived"),
      ),
    )
    .orderBy(accounts.name);
}
```

Agregar `restoreAccount`:

1. Buscar por `id + userId`; ajena/inexistente → 404.
2. Exigir que esté archivada; si ya está activa responder 400 con `ACCOUNT_ALREADY_ACTIVE`.
3. Verificar que no exista cuenta activa con el mismo nombre.
4. Cambiar `archived` a `false`.
5. Devolver `accountResponse`.

### Paso 5 — Función pura para calcular ajustes

En `backend/src/modules/movements/movements.calc.ts`, agregar una función pura. No hacer el cálculo dentro de la ruta ni del frontend.

```ts
export interface BalanceAdjustment {
  type: "adjustment_in" | "adjustment_out";
  amount: number;
}

export function computeBalanceAdjustment(
  currentBalance: number,
  targetBalance: number,
): BalanceAdjustment | null {
  const difference = targetBalance - currentBalance;

  if (difference === 0) return null;

  return {
    type: difference > 0 ? "adjustment_in" : "adjustment_out",
    amount: Math.abs(difference),
  };
}
```

Agregar unit tests como mínimo:

- `100 → 150` produce `adjustment_in 50`;
- `100 → 70` produce `adjustment_out 30`;
- `-100 → 0` produce `adjustment_in 100`;
- `50 → -25` produce `adjustment_out 75`;
- `0 → 0` produce `null`;
- todos los montos producidos son positivos.

### Paso 6 — Servicio de ajuste a saldo objetivo

Agregar en `movements.service.ts` una función pública `adjustAccountBalance`:

```ts
export async function adjustAccountBalance(
  db: Database,
  userId: string,
  accountId: string,
  input: AdjustAccountBalanceInput,
) {
  return db.transaction(async (tx) => {
    await getOwnedActiveAccount(tx, userId, accountId);

    const currentBalance = await getAccountBalance(tx, userId, accountId);
    const targetBalance =
      input.targetBalance.amount === 0
        ? 0
        : input.targetBalance.direction === "in"
          ? input.targetBalance.amount
          : -input.targetBalance.amount;

    const adjustment = computeBalanceAdjustment(
      currentBalance,
      targetBalance,
    );

    if (!adjustment) {
      throw new AccountAlreadyAtTargetBalanceError();
    }

    return createMovement(tx, userId, {
      accountId,
      type: adjustment.type,
      amount: adjustment.amount,
      categoryId: null,
      description: "Ajuste manual de saldo",
      occurredAt: input.occurredAt,
    });
  });
}
```

No aceptar un delta desde el frontend; el contrato recibe el saldo objetivo. La lectura del saldo y la inserción del ajuste ocurren en la misma transacción.

### Paso 7 — Servicio de ciclo de vida sin dependencia circular

Crear `backend/src/modules/accounts/account-lifecycle.service.ts`.

Este archivo es el orquestador superior. Puede importar servicios públicos de cuentas y movimientos. Ni `accounts.service.ts` ni `movements.service.ts` lo importan.

Grafo permitido:

```text
accounts.routes
       |
       v
account-lifecycle.service
       |-----------------> accounts.service
       `-----------------> movements.service
                                  |
                                  `------------> accounts.service
```

No existe ciclo porque `accounts.service` no importa `movements.service` y ninguno importa al orquestador.

Implementar `openAccount`:

```ts
import type { Database } from "../../infra/db/client.js";
import { createMovement } from "../movements/movements.service.js";
import { createAccount } from "./accounts.service.js";
import type { OpenAccountInput } from "./accounts.types.js";

export async function openAccount(
  db: Database,
  userId: string,
  input: OpenAccountInput,
) {
  const { openingBalance, ...accountInput } = input;

  return db.transaction(async (tx) => {
    const account = await createAccount(tx, userId, accountInput);

    if (openingBalance) {
      await createMovement(tx, userId, {
        accountId: account.id,
        type:
          openingBalance.direction === "in"
            ? "adjustment_in"
            : "adjustment_out",
        amount: openingBalance.amount,
        categoryId: null,
        description: "Saldo inicial",
        occurredAt: openingBalance.occurredAt,
      });
    }

    return account;
  });
}
```

Implementar también `archiveEmptyAccount` en el mismo archivo:

```ts
export async function archiveEmptyAccount(
  db: Database,
  userId: string,
  accountId: string,
) {
  return db.transaction(async (tx) => {
    await getOwnedActiveAccount(tx, userId, accountId);
    const balance = await getAccountBalance(tx, userId, accountId);

    if (balance !== 0) {
      throw new AccountBalanceNotZeroError();
    }

    await archiveAccount(tx, userId, accountId);
  });
}
```

Reglas estrictas:

- El orquestador nunca importa `accounts.schema.ts` ni `movements.schema.ts`.
- No duplica inserts o queries de los módulos.
- Sólo coordina servicios públicos y la transacción.
- No usar callbacks inyectados, service locators ni clases genéricas.

### Paso 8 — Rutas backend

Actualizar `accounts.routes.ts`:

- `GET /accounts`: validar `listAccountsQuery` y pasar `status` al servicio.
- `POST /accounts`: validar `openAccountInput` y llamar `openAccount`.
- `PATCH /accounts/:id`: conservar `updateAccountInput`.
- `DELETE /accounts/:id`: llamar `archiveEmptyAccount`.
- `POST /accounts/:id/restore`: llamar `restoreAccount`, response `200 accountResponse`.

Snippet de referencia para POST:

```ts
r.post(
  "/accounts",
  {
    preHandler: opts.requireAuth,
    schema: {
      body: openAccountInput,
      response: { 201: accountResponse },
    },
  },
  async (request, reply) => {
    const account = await openAccount(
      opts.db,
      request.user!.id,
      request.body,
    );
    return reply.code(201).send(account);
  },
);
```

Actualizar `movements.routes.ts` con:

```ts
r.post(
  "/accounts/:id/balance-adjustments",
  {
    preHandler: opts.requireAuth,
    schema: {
      params: idParam,
      body: adjustAccountBalanceInput,
      response: { 201: movementResponse },
    },
  },
  async (request, reply) => {
    const movement = await adjustAccountBalance(
      opts.db,
      request.user!.id,
      request.params.id,
      request.body,
    );
    return reply.code(201).send(movement);
  },
);
```

Las rutas siguen delgadas. No calcular signos, saldos o diferencias en ellas.

### Paso 9 — Tests backend

Extender los tests reales contra PostgreSQL. Seguir la infraestructura existente de Testcontainers; no mockear Drizzle.

Casos mínimos:

1. Crear sin `openingBalance` → cuenta 201, sin movimiento, balance implícito 0.
2. Crear con `direction: in` → un `adjustment_in` exacto, descripción, fecha y source correctos; balance positivo exacto.
3. Crear con `direction: out` → un `adjustment_out`; balance negativo exacto.
4. Payload de saldo con monto cero, negativo, float, unsafe integer o fecha inválida → 400 y no crea cuenta.
5. `type: "crypto"` sigue aceptando tanto USD como BTC; conservar el caso existente “Binance USD”.
6. Duplicado de nombre durante creación → `ACCOUNT_NAME_CONFLICT`; no aparece un movimiento extra.
7. Renombrar a un nombre activo existente → `ACCOUNT_NAME_CONFLICT`.
8. `GET /accounts` sin status y `status=active` sólo muestran activas.
9. `status=archived` sólo muestra archivadas.
10. Status inválido → 400.
11. Scoping: usuario B no lista, edita, ajusta, archiva ni restaura cuentas de A.
12. Ajustar `100 → 70` crea sólo `adjustment_out 30` y el balance termina exactamente en 70.
13. Ajustar `-100 → 0` crea `adjustment_in 100`.
14. Ajustar a saldo idéntico → `ACCOUNT_ALREADY_AT_TARGET_BALANCE`, sin movimiento.
15. Archivar con saldo distinto de cero → `ACCOUNT_BALANCE_NOT_ZERO`; sigue activa.
16. Llevar a cero y archivar → 204; desaparece de activas, aparece en archivadas y conserva movimientos.
17. Restaurar → 200 y vuelve a activas.
18. Restaurar una cuenta ya activa → `ACCOUNT_ALREADY_ACTIVE`.
19. Restaurar cuando existe otra activa con el mismo nombre → `ACCOUNT_NAME_CONFLICT`.
20. Todos los tests existentes de auth, categorías, cuentas, movimientos y tarjetas siguen pasando.

Verificar además que el error ocurrido después de comenzar `openAccount` causa rollback. Si resulta impráctico inducir un fallo posterior al insert sin alterar producción, la prueba de integración exitosa más la inspección de que ambas llamadas reciben el mismo `tx` es aceptable; no introducir hooks de test ni mocks sólo para forzar el rollback.

Ejecutar:

```bash
cd backend
npm test
npm run typecheck
npm run build
```

## Frontend

### Paso 10 — Dependencias y componentes UI

Desde `frontend/`:

```bash
pnpm add zod
pnpm dlx shadcn@latest add alert-dialog dialog select table tabs
```

Antes de instalar, verificar qué componentes ya existen y no regenerarlos innecesariamente. Conservar la configuración actual de shadcn/Base UI. No importar Base UI o Radix directamente desde features; siempre usar `components/ui/`.

No agregar librería de toast. Los formularios muestran éxito/error mediante estado accesible (`aria-live`) y se cierran al completar correctamente.

### Paso 11 — Estructura frontend

Crear:

```text
frontend/src/
  app/(app)/accounts/
    page.tsx
    loading.tsx
  features/accounts/
    actions.ts
    queries.ts
    schemas.ts
    components/
      accounts-screen.tsx
      accounts-toolbar.tsx
      accounts-list.tsx
      account-row-actions.tsx
      create-account-dialog.tsx
      edit-account-dialog.tsx
      adjust-balance-dialog.tsx
      archive-account-dialog.tsx
  lib/api/
    accounts.ts
    movements.ts
```

Los nombres pueden ajustarse levemente si un componente queda trivial, pero respetar:

- `app/` sólo compone;
- lecturas y transformación de respuesta viven en `queries.ts`;
- mutaciones viven en `actions.ts`;
- `lib/api/` es el único lugar con fetch;
- filtros interactivos y diálogos son Client Components aislados;
- ningún componente de sólo display lleva `"use client"`.

No crear `accounts-context`, stores globales ni hooks de fetching.

### Paso 12 — Tipos y cliente API

En `lib/api/accounts.ts` definir los tipos que espejan la API:

```ts
import { apiFetch } from "./client";

export type AccountType = "bank" | "cash" | "credit_card" | "crypto";
export type AccountStatus = "active" | "archived";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currencyCode: string;
  institution: string | null;
  archived: boolean;
}

export interface Currency {
  code: string;
  name: string;
  decimals: number;
  kind: "fiat" | "crypto";
}

export interface OpeningBalance {
  amount: number;
  direction: "in" | "out";
  occurredAt: string;
}

export interface OpenAccountPayload {
  name: string;
  type: AccountType;
  currencyCode: string;
  institution?: string | null;
  openingBalance?: OpeningBalance;
}

export function listAccounts(status: AccountStatus): Promise<Account[]> {
  return apiFetch<Account[]>(`/api/accounts?status=${status}`);
}

export function listCurrencies(): Promise<Currency[]> {
  return apiFetch<Currency[]>("/api/currencies");
}

export function openAccount(input: OpenAccountPayload): Promise<Account> {
  return apiFetch<Account>("/api/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
```

Agregar funciones equivalentes tipadas para update, archive y restore. No concatenar valores sin `encodeURIComponent` cuando provengan del usuario; `status` es enum cerrado.

En `lib/api/movements.ts`:

```ts
export interface AccountBalance {
  accountId: string;
  balance: number;
}

export function listBalances(): Promise<AccountBalance[]> {
  return apiFetch<AccountBalance[]>("/api/balances");
}

export function adjustAccountBalance(
  accountId: string,
  input: AdjustAccountBalancePayload,
): Promise<Movement> {
  return apiFetch<Movement>(
    `/api/accounts/${encodeURIComponent(accountId)}/balance-adjustments`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
```

No importar estos archivos desde Client Components: contienen `apiFetch`, que es server-only. Los Client Components llaman Server Actions.

### Paso 13 — Completar manejo de 401 del cliente API

`frontend/ARCHITECTURE.md` exige traducir 401 a login. El cliente actual sólo lanza `ApiError`.

Actualizar `apiFetch` para redirigir en una respuesta 401 antes de construir `ApiError`:

```ts
import { redirect } from "next/navigation";

// ...después del fetch:
if (res.status === 401) {
  redirect("/login");
}
```

`redirect` lanza una excepción de control de flujo. En las Server Actions, capturar sólo instancias de `ApiError` y relanzar cualquier otro error. Nunca convertir la excepción de redirect en `errorGeneric`.

El body conocido de error se modela así:

```ts
export interface ApiErrorBody {
  error?: string;
  message?: string;
}
```

Los actions comparan `body.error` contra los códigos estables del backend. Nunca muestran `body.message` al usuario.

### Paso 14 — Query y read model de la pantalla

`features/accounts/queries.ts` hace todos los fetches en paralelo:

```ts
export async function getAccountsPageData() {
  const [active, archived, balances, currencies] = await Promise.all([
    listAccounts("active"),
    listAccounts("archived"),
    listBalances(),
    listCurrencies(),
  ]);

  const balanceByAccount = new Map(
    balances.map((item) => [item.accountId, item.balance]),
  );
  const currencyByCode = new Map(
    currencies.map((currency) => [currency.code, currency]),
  );

  const toViewModel = (account: Account) => ({
    ...account,
    balance: balanceByAccount.get(account.id) ?? 0,
    currency: currencyByCode.get(account.currencyCode),
  });

  return {
    active: active
      .filter((account) => account.type !== "credit_card")
      .map(toViewModel),
    archived: archived
      .filter((account) => account.type !== "credit_card")
      .map(toViewModel),
    currencies,
  };
}
```

Si una moneda referenciada no aparece, no usar non-null assertion silenciosa. Lanzar un error claro para que `error.tsx` lo capture: sería inconsistencia de datos.

Este join es composición de presentación, no lógica contable. No suma, convierte ni recalcula balances. `/api/balances` omite cuentas sin movimientos, por eso el default correcto es `0`.

### Paso 15 — Page y loading

`app/(app)/accounts/page.tsx` debe ser mínimo:

```tsx
import { getTranslations } from "next-intl/server";

import { AccountsScreen } from "../../../features/accounts/components/accounts-screen";
import { getAccountsPageData } from "../../../features/accounts/queries";

export default async function AccountsPage() {
  const [data, t] = await Promise.all([
    getAccountsPageData(),
    getTranslations("accounts"),
  ]);

  return (
    <AccountsScreen
      data={data}
      title={t("title")}
      subtitle={t("subtitle")}
    />
  );
}
```

Puede ajustarse el contrato de props para usar `useTranslations` dentro del Client Component. Lo importante es que la page no filtre, formatee dinero ni contenga formularios.

`loading.tsx` usa Skeletons que aproximen el layout final: encabezado, toolbar y 3 filas. No usar spinner ni texto saltando de tamaño.

### Paso 16 — Diseño de `/accounts`

Mantener la dirección visual del SPEC-008:

- fondo y texto con tokens semánticos;
- verde sólo para acción primaria, foco y elemento activo;
- sin gradientes, glass, blur, glow ni sombras dramáticas;
- cifras de saldo pueden usar `font-serif`;
- iconos lucide 16–20 px;
- `MoreHorizontal` para el menú por cuenta;
- responsive mobile-first.

Estructura:

```text
Cuentas                                      [Nueva cuenta]
Administra dónde guardas y mueves tu dinero.

[Buscar por nombre o institución...] [Tipo] [Moneda] [Institución] [Orden]
[Activas] [Archivadas]                                  [Limpiar filtros]

Nombre / institución       Tipo       Moneda       Saldo       [...]
------------------------------------------------------------------------
Bancolombia                Banco      COP          2.500.000 COP   ...
Efectivo                                COP            80.000 COP   ...
Binance BTC                Cripto     BTC          0.01200000 BTC   ...
```

En móvil no forzar una tabla horizontal. Renderizar cada cuenta como una fila/bloque vertical con:

- nombre + menú en la primera línea;
- institución/tipo/moneda como metadata;
- saldo destacado debajo.

No usar una Card completa por cada dato si produce cards anidadas o ruido. Un contenedor único con separadores es suficiente.

Saldo negativo puede usar `text-destructive`; saldo positivo usa `text-foreground`, no verde. Cero usa `text-muted-foreground`.

### Paso 17 — Búsqueda, filtros y orden

La interactividad vive en `accounts-screen.tsx` o `accounts-toolbar.tsx`, marcados `"use client"`. Reciben arrays ya cargados; no hacen fetch.

Estado local mínimo:

```ts
type AccountTab = "active" | "archived";
type TypeFilter = "all" | "bank" | "cash" | "crypto";
type SortOption = "name" | "balance-asc" | "balance-desc";
```

Filtros requeridos:

- búsqueda por `name` o `institution`, case-insensitive y tolerante a tildes;
- tipo: todos, banco, efectivo, cripto;
- moneda: todas + monedas presentes;
- institución: todas + instituciones no nulas presentes;
- pestaña activas/archivadas;
- orden: nombre A–Z, saldo menor–mayor, saldo mayor–menor.

Normalización de búsqueda de referencia:

```ts
function normalize(value: string, locale: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase(locale)
    .trim();
}
```

Usar `useMemo` para la lista derivada sólo si mejora claridad; no usar `useEffect` para mantener una copia filtrada en estado.

“Limpiar filtros” restaura búsqueda vacía, tipo/moneda/institución en `all` y orden por nombre. La pestaña actual puede conservarse.

Estados distintos:

1. Nunca ha creado cuentas activas: estado vacío con CTA “Crear mi primera cuenta”.
2. Tiene cuentas pero los filtros no coinciden: “No encontramos cuentas” + limpiar filtros.
3. No tiene archivadas: mensaje específico, sin CTA de creación.

### Paso 18 — Schemas frontend y formulario de creación

Crear `features/accounts/schemas.ts` con Zod para UX. La API sigue siendo la autoridad.

El formulario muestra:

1. Nombre — requerido, trim, 1–60.
2. Tipo — banco, efectivo o cripto. No tarjeta.
3. Moneda — requerida y filtrada por tipo.
4. Institución — opcional, máximo 60.
5. Separador y sección “Saldo inicial (opcional)”.
6. Monto visible en unidades humanas.
7. Naturaleza: “Saldo disponible” / “Saldo negativo”.
8. Fecha, por defecto hoy en la zona local del navegador.

Reglas:

- Todos los tipos visibles pueden elegir cualquiera de las monedas sembradas; esto conserva casos como “Binance USD”.
- El selector puede agrupar visualmente fiat y crypto, pero no deshabilita combinaciones.
- Cambiar la moneda limpia el monto digitado para no reinterpretar decimales.
- Input vacío o valor cero omite `openingBalance`.
- Input negativo es inválido; el signo se elige con direction.
- Usar `parseMoney` de `lib/money.ts`. No multiplicar por `10 ** decimals` dentro del componente o action.
- Errores bajo el campo correspondiente; resumen genérico sólo para error no asociado.
- Submit disabled y copy de guardado mientras `pending`.
- Éxito cierra el diálogo, limpia el estado y muestra feedback accesible.

No usar `new Date().toISOString().slice(0, 10)` para la fecha local: cerca de medianoche puede producir el día anterior/siguiente según zona. Crear un helper pequeño que arme `YYYY-MM-DD` usando `getFullYear()`, `getMonth()` y `getDate()` locales.

### Paso 19 — Server Actions

`features/accounts/actions.ts` empieza con `"use server"` y exporta:

```ts
openAccountAction
updateAccountAction
adjustBalanceAction
archiveAccountAction
restoreAccountAction
```

Usar un resultado serializable y explícito:

```ts
export type AccountActionState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      errorKey: string;
      fieldErrors?: Record<string, string[]>;
    };
```

Cada action:

1. Trata todo `FormData` como no confiable.
2. Valida en servidor con Zod.
3. Para montos visibles, obtiene la moneda/decimales confiables desde la API y usa `parseMoney`.
4. Llama una función de `lib/api/`; nunca hace `fetch` directo.
5. Traduce `body.error` conocido a `errorKey`; nunca retorna `body.message`.
6. Después de éxito llama `revalidatePath("/accounts")`.
7. Para creación/ajuste/archivo también revalida `/dashboard` y `/movements`, porque cambian saldos o ledger, aunque esas pantallas aún sean placeholders/404.
8. Relanza errores que no sean `ApiError` para que `error.tsx` capture fallos inesperados.

Mapa mínimo:

```ts
const API_ERROR_KEYS: Record<string, string> = {
  ACCOUNT_NAME_CONFLICT: "errorNameConflict",
  ACCOUNT_BALANCE_NOT_ZERO: "errorBalanceNotZero",
  ACCOUNT_ALREADY_ACTIVE: "errorAlreadyActive",
  ACCOUNT_ALREADY_AT_TARGET_BALANCE: "errorAlreadyAtBalance",
};
```

Los errores Zod del backend o códigos desconocidos se traducen a `errorGeneric`.

Usar `useActionState` en los Client Components, siguiendo la guía local de Next 16/React 19. No implementar `isLoading` manual alrededor de una lectura de servidor.

### Paso 20 — Editar, ajustar, archivar y restaurar

#### Editar

Menú `...` de una cuenta activa:

- “Editar cuenta” abre Dialog.
- Campos editables: nombre e institución.
- Mostrar tipo y moneda como información de sólo lectura, no como selects disabled que luego se esperen en FormData.
- No mostrar ni editar saldo inicial.

#### Ajustar saldo

- Mostrar saldo actual formateado.
- Pedir “Saldo correcto” como monto no negativo + dirección disponible/negativo.
- Pedir fecha, default hoy local.
- Explicar que se agregará un movimiento de ajuste y no se reescribirá el historial.
- El frontend envía el objetivo; no calcula el delta.
- Si el objetivo coincide, mostrar `errorAlreadyAtBalance`.

#### Archivar

- Usar AlertDialog.
- Mostrar nombre y saldo actual.
- Explicar que se conserva el historial.
- Si el balance recibido por UI no es cero, deshabilitar confirmación y ofrecer cerrar para usar “Ajustar saldo”.
- Aun así el backend vuelve a verificar el saldo: la UI puede estar desactualizada.
- La acción destructiva visual usa `variant="destructive"`.

#### Restaurar

Una cuenta archivada sólo ofrece “Restaurar”. No permitir editar o ajustar mientras esté archivada. Al restaurar, vuelve a la pestaña de activas después de la revalidación o muestra feedback suficiente para encontrarla allí.

### Paso 21 — i18n

Agregar el namespace `accounts` con paridad exacta en `es.json` y `en.json`. También agregar a `common` las keys reutilizables que falten (`cancel`, `save`, `actions`, `close`).

Fragmento mínimo esperado en español:

```json
{
  "accounts": {
    "title": "Cuentas",
    "subtitle": "Administra dónde guardas y mueves tu dinero.",
    "create": "Nueva cuenta",
    "createFirst": "Crear mi primera cuenta",
    "searchPlaceholder": "Buscar por nombre o institución...",
    "active": "Activas",
    "archived": "Archivadas",
    "allTypes": "Todos los tipos",
    "allCurrencies": "Todas las monedas",
    "allInstitutions": "Todas las instituciones",
    "bank": "Banco",
    "cash": "Efectivo",
    "crypto": "Cripto",
    "sortName": "Nombre A–Z",
    "sortBalanceAsc": "Saldo: menor a mayor",
    "sortBalanceDesc": "Saldo: mayor a menor",
    "clearFilters": "Limpiar filtros",
    "name": "Nombre",
    "institution": "Institución",
    "institutionOptional": "Institución (opcional)",
    "type": "Tipo",
    "currency": "Moneda",
    "balance": "Saldo",
    "openingBalance": "Saldo inicial (opcional)",
    "openingBalanceHint": "Crearemos un movimiento de ajuste con este valor.",
    "amount": "Monto",
    "positiveBalance": "Saldo disponible",
    "negativeBalance": "Saldo negativo",
    "date": "Fecha",
    "edit": "Editar cuenta",
    "editTitle": "Editar cuenta",
    "immutableFieldsHint": "El tipo y la moneda no pueden cambiarse.",
    "adjust": "Ajustar saldo",
    "adjustTitle": "Ajustar saldo",
    "adjustHint": "Se agregará un movimiento de ajuste sin modificar el historial.",
    "currentBalance": "Saldo actual",
    "targetBalance": "Saldo correcto",
    "archive": "Archivar cuenta",
    "archiveTitle": "¿Archivar esta cuenta?",
    "archiveDescription": "La cuenta dejará de aparecer entre las activas, pero conservaremos todo su historial.",
    "archiveRequiresZero": "El saldo debe estar en cero antes de archivar.",
    "restore": "Restaurar cuenta",
    "emptyTitle": "Aún no tienes cuentas",
    "emptyDescription": "Crea tu primera cuenta para comenzar a registrar tu dinero.",
    "emptyArchivedTitle": "No tienes cuentas archivadas",
    "emptyArchivedDescription": "Las cuentas que archives aparecerán aquí.",
    "noResultsTitle": "No encontramos cuentas",
    "noResultsDescription": "Prueba cambiando o limpiando los filtros.",
    "saving": "Guardando...",
    "createSuccess": "Cuenta creada correctamente.",
    "updateSuccess": "Cuenta actualizada correctamente.",
    "adjustSuccess": "Saldo ajustado correctamente.",
    "archiveSuccess": "Cuenta archivada correctamente.",
    "restoreSuccess": "Cuenta restaurada correctamente.",
    "errorNameConflict": "Ya existe una cuenta activa con ese nombre.",
    "errorBalanceNotZero": "Debes llevar el saldo a cero antes de archivar.",
    "errorAlreadyActive": "La cuenta ya está activa.",
    "errorAlreadyAtBalance": "La cuenta ya tiene ese saldo.",
    "errorInvalidAmount": "Ingresa un monto válido.",
    "errorGeneric": "No pudimos completar la operación. Intenta de nuevo."
  }
}
```

Traducción mínima equivalente en inglés:

```json
{
  "accounts": {
    "title": "Accounts",
    "subtitle": "Manage where you keep and move your money.",
    "create": "New account",
    "createFirst": "Create my first account",
    "searchPlaceholder": "Search by name or institution...",
    "active": "Active",
    "archived": "Archived",
    "allTypes": "All types",
    "allCurrencies": "All currencies",
    "allInstitutions": "All institutions",
    "bank": "Bank",
    "cash": "Cash",
    "crypto": "Crypto",
    "sortName": "Name A–Z",
    "sortBalanceAsc": "Balance: low to high",
    "sortBalanceDesc": "Balance: high to low",
    "clearFilters": "Clear filters",
    "name": "Name",
    "institution": "Institution",
    "institutionOptional": "Institution (optional)",
    "type": "Type",
    "currency": "Currency",
    "balance": "Balance",
    "openingBalance": "Opening balance (optional)",
    "openingBalanceHint": "We will create an adjustment movement with this value.",
    "amount": "Amount",
    "positiveBalance": "Available balance",
    "negativeBalance": "Negative balance",
    "date": "Date",
    "edit": "Edit account",
    "editTitle": "Edit account",
    "immutableFieldsHint": "Account type and currency cannot be changed.",
    "adjust": "Adjust balance",
    "adjustTitle": "Adjust balance",
    "adjustHint": "An adjustment movement will be added without rewriting history.",
    "currentBalance": "Current balance",
    "targetBalance": "Correct balance",
    "archive": "Archive account",
    "archiveTitle": "Archive this account?",
    "archiveDescription": "The account will leave the active list, but its full history will be preserved.",
    "archiveRequiresZero": "The balance must be zero before archiving.",
    "restore": "Restore account",
    "emptyTitle": "You do not have any accounts yet",
    "emptyDescription": "Create your first account to start tracking your money.",
    "emptyArchivedTitle": "You do not have archived accounts",
    "emptyArchivedDescription": "Accounts you archive will appear here.",
    "noResultsTitle": "No accounts found",
    "noResultsDescription": "Try changing or clearing the filters.",
    "saving": "Saving...",
    "createSuccess": "Account created successfully.",
    "updateSuccess": "Account updated successfully.",
    "adjustSuccess": "Balance adjusted successfully.",
    "archiveSuccess": "Account archived successfully.",
    "restoreSuccess": "Account restored successfully.",
    "errorNameConflict": "An active account with that name already exists.",
    "errorBalanceNotZero": "Bring the balance to zero before archiving the account.",
    "errorAlreadyActive": "The account is already active.",
    "errorAlreadyAtBalance": "The account already has that balance.",
    "errorInvalidAmount": "Enter a valid amount.",
    "errorGeneric": "We could not complete the operation. Try again."
  }
}
```

El implementador puede agregar keys necesarias para labels accesibles, placeholders y validaciones, siempre en ambos idiomas. Ningún string visible nuevo queda hardcodeado en TSX.

### Paso 22 — Dashboard vacío

Sin convertir el dashboard en un reporte, mejorar únicamente su estado inicial:

- si el usuario no tiene cuentas activas que no sean tarjetas, mostrar un texto breve y CTA a `/accounts`;
- si ya tiene cuentas, conservar el saludo placeholder actual;
- esta lectura debe reutilizar `lib/api/accounts.ts` o una query del feature, nunca hacer fetch desde `page.tsx`.

No agregar cards de métricas ni cálculos al dashboard en este spec.

## Errores comunes que NO cometer

- Hacer dos POST desde el frontend para cuenta y saldo.
- Insertar en `movements` directamente desde `accounts.service.ts` o el orquestador.
- Importar `movements.service.ts` desde `accounts.service.ts`, creando un ciclo.
- Agregar una columna de saldo a `accounts`.
- Registrar saldo inicial como `income` o `expense`.
- Permitir monto negativo en la columna `movements.amount`.
- Calcular el delta de ajuste en React o en una Server Action.
- Permitir archivar con saldo distinto de cero sólo porque el botón estaba deshabilitado: el backend debe verificar.
- Mostrar tarjetas de crédito en `/accounts` o en sus filtros/formularios.
- Sumar balances de monedas distintas.
- Mostrar `ApiError.body.message` al usuario.
- Hacer `fetch` fuera de `lib/api/`.
- Formatear o parsear dinero fuera de `lib/money.ts`.
- Usar `Number(input) * 100`, `parseFloat` o decimales hardcodeados.
- Usar `toISOString()` para el default de fecha local.
- Convertir toda la page en Client Component.
- Guardar una copia de los datos del servidor en un store global.
- Construir modales/selects desde cero cuando shadcn ya provee primitivas.
- Introducir colores literales, gradientes, glass o sombras grandes.
- Dejar strings sin traducción o keys distintas entre es/en.
- Modificar la experiencia de `/credit-cards` “de paso”.

## Criterios de aceptación

### Backend automatizado

- [ ] `POST /api/accounts` sin opening balance conserva compatibilidad y no crea movimiento.
- [ ] Opening balance positivo/negativo crea exactamente un ajuste con monto, fecha, source y descripción correctos.
- [ ] Cuenta + ajuste usan el mismo `tx`; una falla revierte la operación.
- [ ] Se conserva compatibilidad con cuentas crypto denominadas tanto en fiat como en crypto.
- [ ] Listado active/archived y restauración respetan scoping.
- [ ] Renombrar o restaurar no permite duplicados activos.
- [ ] Ajuste recibe objetivo, calcula delta en función pura y deja balance exacto.
- [ ] Archivo con saldo no cero falla con código estable; archivo en cero funciona.
- [ ] Tests unitarios e integración pasan contra PostgreSQL real.
- [ ] `npm run typecheck` y `npm run build` limpios.

### Frontend funcional

- [ ] Sidebar “Cuentas” abre `/accounts`; ya no produce 404.
- [ ] Nunca aparece una cuenta `credit_card` en esta pantalla.
- [ ] Crear banco/efectivo/cripto sin saldo funciona.
- [ ] Crear con saldo positivo o negativo muestra el saldo exacto tras guardar.
- [ ] El selector ofrece todas las monedas sin romper casos como “Binance USD”.
- [ ] Editar sólo permite nombre e institución.
- [ ] Ajustar saldo pide el valor objetivo y produce un movimiento real.
- [ ] Archivo se bloquea con saldo no cero y funciona en cero.
- [ ] Pestaña Archivadas lista y restaura cuentas.
- [ ] Buscador encuentra por nombre e institución ignorando mayúsculas y tildes.
- [ ] Filtros de tipo, moneda e institución funcionan combinados.
- [ ] Los tres órdenes funcionan y “Limpiar filtros” restaura defaults.
- [ ] Se diferencian estado vacío real, archivadas vacías y cero resultados.
- [ ] Todos los montos usan `formatMoney` con decimals de `/api/currencies`.
- [ ] Ningún texto técnico del backend llega a la UI.
- [ ] i18n es/en tiene paridad y toda la pantalla cambia de idioma.
- [ ] Light/dark no rompe contraste y sólo usa tokens semánticos.

### QA manual de navegador

Con compose levantado y usuario autenticado:

1. Abrir `/accounts` en 375 px: sin scroll horizontal; toolbar usable; CTA visible.
2. Crear “Bancolombia” COP con saldo disponible `1.234.567,89` y fecha elegida.
3. Confirmar que muestra `1.234.567,89 COP` en español y formato equivalente en inglés.
4. Consultar `/api/movements?accountId=<id>` y verificar un único `adjustment_in` por `123456789`.
5. Crear una wallet BTC con `0.01234567`; verificar `1234567` unidades mínimas y display con 8 decimales.
6. Crear “Binance USD” con tipo crypto y USD; confirmar que sigue siendo válido.
7. Ajustar Bancolombia a `1.000.000,00`; verificar `adjustment_out 23456789` y saldo final exacto.
8. Intentar archivar: con saldo no cero debe fallar incluso llamando API directamente.
9. Ajustar a cero, archivar, encontrar en Archivadas y restaurar.
10. Crear al menos tres cuentas y probar búsqueda, filtros combinados y todos los órdenes.
11. Crear/configurar una tarjeta mediante API existente y confirmar que nunca aparece en `/accounts`.
12. Repetir create/edit/adjust en light y dark, español e inglés.
13. Probar expiración de sesión: una llamada 401 redirige a `/login`, no muestra error genérico.

### Verificación final

```bash
cd backend
npm test
npm run typecheck
npm run build

cd ../frontend
pnpm test
pnpm lint
pnpm build
```

Verificar paridad de JSON con un script o comparación de keys; no confiar sólo en inspección visual.

## Al completar

1. Cambiar el estado a `✅ completado — <fecha>` sólo cuando los criterios automatizados y el QA posible estén verificados. Lo no ejecutado queda destildado con nota explícita.
2. No ejecutar `git commit` ni otros comandos git que cambien estado.
3. Reportar:
   - resumen backend y frontend;
   - archivos creados/modificados;
   - contratos finales y cualquier desviación justificada;
   - tests, typecheck, lint y build;
   - QA manual ejecutado/no ejecutado;
   - mensaje de commit recomendado.

Commit sugerido:

```text
feat(accounts): add accounts screen with transactional opening balance

SPEC-009
```
