# SPEC-005: Tarjetas de crédito y monedas cripto

Estado: ✅ completado 2026-07-30

Ejecutar cumpliendo `ARCHITECTURE.md` (normativo) y `docs/DATABASE.md` (decisiones **D1** y **D3**, con el corolario una-cuenta-una-moneda). Los snippets son la implementación de referencia — ante contradicción, gana ARCHITECTURE.md y se reporta la discrepancia.

## Objetivo

Completar los tipos de cuenta: (a) el satélite `credit_card_details` con sus números derivados (deuda, cupo disponible, próximas fechas de corte y pago) para cuentas tipo `credit_card`; (b) el seed de monedas cripto (BTC, ETH, SOL, USDT) — con lo cual comprar/trackear cripto funciona hoy mismo vía transferencias FX, sin código nuevo.

## Alcance

**Incluye:** módulo nuevo `credit-cards` (tabla satélite 1:1, upsert y lectura con derivados, funciones puras de fechas con unit tests), función pública `getAccountBalance` en movements, migración de seed cripto, tests.

**NO incluye (no agregar "de paso"):** valoración de portafolio cripto ni precios (`asset_prices` es spec futuro), cobro automático de la cuota de manejo (el campo es metadata; el cobro es un gasto manual o un job futuro), alertas de fechas de pago, endpoints de borrado de detalles, intereses o amortización.

## Contexto de diseño (leer antes de codificar)

- **`credit-cards` es un módulo propio**, no parte de accounts, por una razón estructural: sus derivados necesitan el balance (módulo movements) Y la cuenta (módulo accounts). Si viviera en accounts, accounts importaría movements _y_ movements ya importa accounts → **import circular**. Como módulo aparte, depende de ambos sin ciclo (regla 4: solo vía sus servicios públicos).
- La deuda de la tarjeta ES su balance negativo (D1): `debt = max(0, -balance)`, `availableCredit = creditLimit + balance` (con balance ≤ 0 en operación normal). No hay columnas nuevas de deuda ni cupo — todo derivado.
- Fechas de corte/pago se guardan como **día del mes** (1–31); las próximas ocurrencias se calculan con funciones puras, con clampeo a fin de mes (día 31 en abril → 30; en febrero → 28/29).
- Los `decimals` de las monedas cripto definen la escala de unidades mínimas: BTC 8 (satoshis), ETH 8 (decisión de DATABASE.md: tracking a 8, no wei), SOL 9 (lamports), USDT 6 (nativo). Los montos siguen siendo enteros positivos — 0.5 BTC = `50000000`.
- Comprar cripto NO requiere endpoints nuevos: es `POST /transfers` de una cuenta USD a una cuenta BTC (D3). El E2E lo verifica.

## Paso 1 — Función pública nueva en movements

En **`movements.service.ts`** agregar (patrón del Paso 1 del SPEC-004):

```typescript
/** Balance de UNA cuenta del usuario (0 si no tiene movimientos). Solo consulta la tabla movements. */
export async function getAccountBalance(
  db: Database,
  userId: string,
  accountId: string,
): Promise<number> {
  const rows = await db
    .select({ type: movements.type, amount: movements.amount })
    .from(movements)
    .where(
      ownedBy(movements.userId, userId, eq(movements.accountId, accountId)),
    );
  return computeBalance(rows);
}
```

Agregar sus tests de integración en `movements.test.ts`: cuenta con movimientos → suma correcta; cuenta sin movimientos → 0; cuenta de otro usuario → 0 (el scoping filtra; no lanza — validar la cuenta es responsabilidad de quien llama).

## Paso 2 — Schema Drizzle

Crear **`backend/src/modules/credit-cards/credit-cards.schema.ts`**:

```typescript
import { pgTable, uuid, bigint, integer, timestamp } from "drizzle-orm/pg-core";
import { accounts } from "../accounts/accounts.schema.js";

export const creditCardDetails = pgTable("credit_card_details", {
  // 1:1 con accounts: el account_id ES la PK (D1).
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id),
  creditLimit: bigint("credit_limit", { mode: "number" }).notNull(),
  cutDay: integer("cut_day").notNull(),
  paymentDueDay: integer("payment_due_day").notNull(),
  managementFee: bigint("management_fee", { mode: "number" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

Re-exportar en `infra/db/schema.ts` y `npm run db:generate`.

## Paso 3 — Seed de monedas cripto (migración custom)

`npx drizzle-kit generate --custom --name seed-crypto-currencies`:

```sql
INSERT INTO "currencies" ("code", "name", "decimals", "kind") VALUES
('BTC', 'Bitcoin', 8, 'crypto'),
('ETH', 'Ethereum', 8, 'crypto'),
('SOL', 'Solana', 9, 'crypto'),
('USDT', 'Tether', 6, 'crypto');
```

Los `code` son contrato estable. USDT es su propia moneda (`kind: crypto`), NO un alias de USD — la distinción permite registrar swaps USDT↔USD como transferencias FX.

## Paso 4 — Funciones puras (regla 10)

Crear **`backend/src/modules/credit-cards/credit-cards.calc.ts`** — sin DB:

```typescript
/** Deuda actual: el balance negativo expresado en positivo. */
export function currentDebt(balance: number): number {
  return Math.max(0, -balance);
}

/** Cupo disponible: límite + balance (balance ≤ 0 en operación normal). Nunca negativo. */
export function availableCredit(creditLimit: number, balance: number): number {
  return Math.max(0, creditLimit + balance);
}

/**
 * Próxima ocurrencia de un día-del-mes a partir de una fecha (YYYY-MM-DD).
 * Si el día de `from` es <= day, es este mes; si no, el siguiente.
 * Clampea a fin de mes: day 31 en abril → 30; en febrero → 28/29.
 */
export function nextOccurrence(day: number, from: string): string {
  const [y, m, d] = from.split("-").map(Number);
  let year = y!;
  let month = m!; // 1-12
  if (d! > day) {
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clamped = Math.min(day, lastDayOfMonth);
  return `${year}-${String(month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}
```

**`credit-cards.calc.test.ts`** — unit tests obligatorios:

- `currentDebt`: balance −350000 → 350000; balance 0 → 0; balance positivo (pagó de más) → 0.
- `availableCredit`: límite 2000000 y balance −350000 → 1650000; balance que excede el límite → 0.
- `nextOccurrence`: día futuro del mismo mes; día ya pasado → mes siguiente; día igual a hoy → hoy; **día 31 desde abril → 2026-04-30**; **día 30 desde el 15 de febrero → 2026-02-28** (y año bisiesto → 29); cruce de diciembre → enero del año siguiente.

## Paso 5 — Types y schemas Zod

Crear **`backend/src/modules/credit-cards/credit-cards.types.ts`**:

```typescript
import { z } from "zod";

const minorUnits = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const dayOfMonth = z.number().int().min(1).max(31);

export const upsertCreditCardInput = z.object({
  creditLimit: minorUnits,
  cutDay: dayOfMonth,
  paymentDueDay: dayOfMonth,
  managementFee: minorUnits.nullish(),
});
export type UpsertCreditCardInput = z.infer<typeof upsertCreditCardInput>;

export const creditCardResponse = z.object({
  accountId: z.string(),
  creditLimit: z.number(),
  cutDay: z.number(),
  paymentDueDay: z.number(),
  managementFee: z.number().nullable(),
  balance: z.number(),
  debt: z.number(),
  availableCredit: z.number(),
  nextCutDate: z.string(),
  nextPaymentDueDate: z.string(),
});
```

## Paso 6 — Service

Crear **`backend/src/modules/credit-cards/credit-cards.service.ts`**. Reglas:

**`upsertCreditCard(db, userId, accountId, input)`**

1. `getOwnedActiveAccount(db, userId, accountId)` (de accounts).
2. Si `account.type !== "credit_card"` → `ValidationError("Account is not a credit card")`.
3. Upsert con `onConflictDoUpdate` sobre la PK (`accountId`), actualizando también `updatedAt: new Date()`:

```typescript
await db
  .insert(creditCardDetails)
  .values({ accountId, ...input, managementFee: input.managementFee ?? null })
  .onConflictDoUpdate({
    target: creditCardDetails.accountId,
    set: {
      ...input,
      managementFee: input.managementFee ?? null,
      updatedAt: new Date(),
    },
  });
```

4. Devolver el resultado de `getCreditCard` (una sola forma de respuesta).

**`getCreditCard(db, userId, accountId)`**

1. Validar cuenta (mismos pasos 1–2 del upsert).
2. Buscar detalles → `orThrow(details, "credit card details")` (tarjeta sin configurar → 404).
3. `const balance = await getAccountBalance(db, userId, accountId)` (de movements).
4. Componer la respuesta con los derivados: `currentDebt(balance)`, `availableCredit(details.creditLimit, balance)`, `nextOccurrence(details.cutDay, today)` y `nextOccurrence(details.paymentDueDay, today)` — donde `today` es la fecha actual en `YYYY-MM-DD`. Obtener `today` en el service (borde del mundo real) y pasarlo a las funciones puras; NUNCA leer la fecha dentro de `calc.ts` (mataría los unit tests deterministas).

Nota de scoping: la tabla `credit_card_details` no tiene `user_id` propio — el ownership viene de la cuenta (paso 1 valida siempre). No agregar la columna.

## Paso 7 — Rutas

Crear **`backend/src/modules/credit-cards/credit-cards.routes.ts`** (patrón estándar, `opts: { db, requireAuth }`):

| Método y ruta                   | Schema                                                                 | Servicio         | Código |
| ------------------------------- | ---------------------------------------------------------------------- | ---------------- | ------ |
| `PUT /accounts/:id/credit-card` | params id (uuid), body: upsertCreditCardInput, 200: creditCardResponse | upsertCreditCard | 200    |
| `GET /accounts/:id/credit-card` | params id, 200: creditCardResponse                                     | getCreditCard    | 200    |

PUT es upsert deliberado (crear y editar son la misma operación); el path cuelga de `/accounts/:id/` porque el recurso es una extensión de la cuenta, aunque el módulo sea aparte — los paths no mapean módulos.

Registrar en `http/server.ts`: `app.register(creditCardsRoutes, { db, requireAuth });`

## Paso 8 — Tests de integración

**`credit-cards.test.ts`** (Testcontainers, dos usuarios; en el setup: cuenta credit_card de userA, cuenta bank de userA). Casos:

1. PUT/GET sin cookie → 401.
2. PUT sobre la cuenta bank → **400** ("not a credit card").
3. PUT sobre cuenta de userB → **404**.
4. GET de tarjeta sin detalles configurados → **404**.
5. PUT válido (límite 2000000, cutDay 15, paymentDueDay 30) → 200 con `debt: 0`, `availableCredit: 2000000`, fechas próximas correctas.
6. Registrar un expense de 350000 en la cuenta tarjeta (vía POST /movements) → GET refleja `balance: -350000`, `debt: 350000`, `availableCredit: 1650000`.
7. Pagar la tarjeta: `POST /transfers` de la cuenta bank a la tarjeta por 350000 → GET refleja `debt: 0` (D1: pagar = transferir).
8. Segundo PUT con otro límite → 200 actualizado (upsert, no duplica).
9. cutDay 0 o 32 → 400 (Zod).

**Cripto** (agregar a `accounts.test.ts` o `movements.test.ts`): 10. `GET /currencies` incluye BTC/ETH/SOL/USDT con `kind: "crypto"` y sus decimales. 11. Crear cuenta `{ name: "Binance BTC", type: "crypto", currencyCode: "BTC" }` → 201. 12. **Comprar BTC**: transfer de cuenta USD a Binance BTC, amountFrom 50000000 (USD, 6... **ojo: USD tiene decimals 2** → $500.00 = 50000) y amountTo 100000000 (1 BTC en satoshis) → 201; balance de Binance BTC = 100000000.

## Errores comunes que NO cometer

- Meter el módulo dentro de accounts (crea el import circular con movements — ver contexto).
- Columnas de deuda/cupo en la DB (derivados — principio 2).
- `user_id` en credit_card_details (el ownership viene de la cuenta).
- Leer `new Date()` dentro de `calc.ts` (la fecha entra como parámetro).
- Endpoints nuevos para "comprar cripto" (es POST /transfers, D3).
- Tratar USDT como USD.
- Cobrar la cuota de manejo automáticamente (fuera de alcance).

## Criterios de aceptación

### Flujo E2E (compose levantado, sesión iniciada; crear una cuenta credit_card y tener la bank COP del QA anterior)

```bash
BASE=http://localhost:3000

# 1. Configurar la tarjeta → 200 con derivados en cero deuda
curl -si -X PUT $BASE/accounts/<ID_TARJETA>/credit-card -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"creditLimit":200000000,"cutDay":15,"paymentDueDay":30,"managementFee":2900000}'

# 2. Gasto con la tarjeta → GET muestra debt y availableCredit correctos
curl -si -X POST $BASE/movements -b cookies.txt -H 'content-type: application/json' \
  -d '{"accountId":"<ID_TARJETA>","type":"expense","amount":35000000,"categoryId":"00000000-0000-4000-8000-000000000002","occurredAt":"2026-07-30"}'
curl -s $BASE/accounts/<ID_TARJETA>/credit-card -b cookies.txt | python3 -m json.tool

# 3. Pagar la tarjeta (transferencia bank → tarjeta) → debt vuelve a 0
curl -si -X POST $BASE/transfers -b cookies.txt -H 'content-type: application/json' \
  -d '{"fromAccountId":"<ID_BANK>","toAccountId":"<ID_TARJETA>","amountFrom":35000000,"occurredAt":"2026-07-30"}'
curl -s $BASE/accounts/<ID_TARJETA>/credit-card -b cookies.txt | python3 -m json.tool

# 4. Cripto: monedas nuevas, cuenta BTC, y una compra vía transfer FX
curl -s $BASE/currencies -b cookies.txt
curl -si -X POST $BASE/accounts -b cookies.txt -H 'content-type: application/json' \
  -d '{"name":"Binance BTC","type":"crypto","currencyCode":"BTC","institution":"Binance"}'
curl -si -X POST $BASE/transfers -b cookies.txt -H 'content-type: application/json' \
  -d '{"fromAccountId":"<ID_USD>","toAccountId":"<ID_BTC>","amountFrom":50000,"amountTo":100000000,"occurredAt":"2026-07-30"}'
curl -s $BASE/balances -b cookies.txt
```

- [x] Pasos 1–4 verificando los NÚMEROS (deuda, cupo, fechas próximas, satoshis), no solo códigos HTTP.

### Criterios generales

- [x] Migraciones versionadas (tabla + seed cripto) aplicadas por el arranque del compose.
- [x] Unit tests de calc (incluidos los bordes de fechas: día 31 en meses cortos, febrero, cruce de año) + integración pasan; `npm run typecheck` limpio.
- [x] Todo lo anterior (health, auth, categories, accounts, movements) sigue funcionando.
- [x] Cero `process.env` fuera de `config/`; cross-módulo solo vía servicios públicos; rutas sin lógica.

## Al completar

**NO ejecutar `git commit` ni ningún comando de git.** Al terminar:

1. Marcar `Estado: ✅ completado <fecha>`, tildar los checkboxes verificados.
2. Actualizar la tabla de orden de construcción en `docs/DATABASE.md` (fila de credit_card_details y monedas cripto → ✅ SPEC-005).
3. Responder con: resumen, archivos creados/modificados, resultado de tests y typecheck, desviaciones justificadas, y el **mensaje de commit recomendado** (base sugerida: `feat(credit-cards): credit card details with derived metrics and crypto currencies`, con `SPEC-005` en el cuerpo). El commit lo hace el humano.
