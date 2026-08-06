# SPEC-011: Registro de ingresos, gastos y transferencias con múltiples comisiones

Estado: ✅ completado

Ejecutar cumpliendo `ARCHITECTURE.md`, `frontend/ARCHITECTURE.md`, `docs/DATABASE.md` y los contratos terminados por SPEC-009 y SPEC-010. Todos son normativos. Este spec extiende el ledger de SPEC-004 y construye `/movements`; no reemplaza las decisiones D2/D5 ni crea una segunda fuente de verdad para balances.

Este documento es deliberadamente explícito porque será ejecutado por un modelo de menor capacidad. Antes de escribir Next.js, leer completas las guías locales relevantes de `frontend/node_modules/next/dist/docs/` exigidas por `frontend/AGENTS.md`, especialmente formularios, Server Actions, revalidación, loading/error y manejo de estado cliente.

## Prerrequisito

SPEC-010 debe estar implementado y completado antes de ejecutar este spec. Este feature consume:

- `emoji` y `color` de categorías;
- listado de categorías activas y archivadas;
- cliente API de categorías;
- categorías/subcategorías propias;
- categoría del sistema `Comisiones` con UUID estable.

Si SPEC-010 sigue sólo como documento, completar primero ese spec. No duplicar sus tipos o UI dentro de movimientos.

## Objetivo

Entregar el ciclo financiero manual completo en web:

1. `/movements` muestra un historial cronológico de operaciones;
2. el usuario registra ingresos y gastos desde una sola entrada “Nuevo movimiento”;
3. selecciona cuenta, monto, categoría/subcategoría, descripción y fecha;
4. puede editar o eliminar movimientos simples;
5. crea transferencias entre cuentas de igual o distinta moneda;
6. configura cero, una o varias comisiones en origen y/o destino;
7. cada comisión de origen puede descontarse del monto o cobrarse adicionalmente;
8. el backend previsualiza el desglose exacto antes de confirmar;
9. una transferencia se presenta como una operación lógica única, no como filas técnicas separadas;
10. todos los balances se derivan de los movimientos reales persistidos.

Al terminar, un usuario puede crear cuentas y categorías, registrar toda su actividad cotidiana y comprender exactamente cuánto salió de origen, cuánto se transfirió, cuánto se cobró en comisiones y cuánto se acreditó en destino.

## Estado inicial verificado

- El schema ya tiene `transfers` y `movements`.
- Un movimiento puede enlazarse por `transfer_id`, pertenecer a cualquier cuenta del usuario y ser `expense`.
- Por tanto, la DB ya puede representar múltiples comisiones en origen y destino sin columnas nuevas.
- `createTransferInput` sólo acepta hoy `feeAmount`/`feeCategoryId`.
- El service actual crea como máximo una comisión y siempre en la cuenta origen.
- La transferencia actual crea `transfer_out`, `transfer_in` y opcionalmente un `expense`.
- Las transferencias ya son atómicas y bloquean las cuentas en orden estable.
- Los movimientos de una transferencia no pueden editarse o eliminarse individualmente.
- `GET /movements` devuelve filas técnicas planas; no es suficiente para una lista visual paginada porque un grupo puede separarse entre páginas.
- El frontend sólo tiene cliente para balances y ajustes; no existe `/movements`.
- No se requiere migración Drizzle para este feature.

## Decisiones de producto y dominio (normativas)

### 1. Operación lógica vs. filas contables

Una transferencia es una operación lógica que genera entre 2 y N movimientos:

```text
TRANSFER
├── transfer_out  en cuenta origen (principal)
├── expense       comisión origen 1 (opcional)
├── expense       comisión origen N (opcional)
├── transfer_in   en cuenta destino (bruto)
├── expense       comisión destino 1 (opcional)
└── expense       comisión destino N (opcional)
```

Todos comparten `transfer_id`, `occurred_at`, `source` y se insertan en una transacción DB. Las comisiones son gastos reales y usan por defecto la categoría del sistema `Comisiones` (`00000000-0000-4000-8000-000000000010`).

En el historial, el grupo se muestra una sola vez. En reportes futuros, cada comisión sí cuenta como gasto.

### 2. Variantes soportadas en v1

La UI soporta exactamente:

1. sin comisión;
2. comisión descontada del monto en origen;
3. comisión adicional en origen;
4. comisión sólo en destino;
5. comisión en origen y destino;
6. varias comisiones por transferencia, incluso varias en el mismo lado.

No crear campos separados como `sourceFee1`, `sourceFee2`. El contrato usa un array discriminado.

### 3. Semántica de los montos

`amountFrom` es el **monto de referencia introducido por el usuario en moneda origen**.

`amountTo` es el **crédito bruto en moneda destino antes de descontar comisiones de recepción**. Es obligatorio sólo para transferencias entre monedas diferentes.

Para comisión descontada en origen:

```text
amountFrom = 400
fee = 15 deducted_from_amount
principalFrom = 385
total debitado origen = 400
bruto destino misma moneda = 385
```

Para comisión adicional:

```text
amountFrom = 400
fee = 15 charged_additionally
principalFrom = 400
total debitado origen = 415
bruto destino misma moneda = 400
```

Para comisión sólo en destino:

```text
amountFrom = 400
principalFrom = 400
bruto destino = 400
fee destino = 15
neto acreditado = 385
```

Para ambos lados, con comisión origen descontada:

```text
amountFrom = 400
fee origen = 15
principalFrom/bruto destino = 385
fee destino = 15
neto acreditado = 370
```

### 4. Fórmula canónica

El backend implementa una función pura como única definición:

```text
sourceDeductedFees  = SUM(source + deducted_from_amount)
sourceAdditionalFees = SUM(source + charged_additionally)
destinationFees = SUM(destination)

principalFrom = amountFrom - sourceDeductedFees

grossDestination =
  misma moneda ? principalFrom : amountTo

sourceTotalDebit =
  principalFrom + sourceDeductedFees + sourceAdditionalFees
  = amountFrom + sourceAdditionalFees

destinationNetCredit = grossDestination - destinationFees

rate = grossDestination / principalFrom   // sólo FX/display
```

La UI no reimplementa estas fórmulas. Consume un preview autoritativo del backend.

### 5. Comisión de destino

En v1, toda comisión de destino usa `deducted_from_received`: se registra como `expense` en la cuenta destino y reduce el neto acreditado.

No mostrar un selector de modalidad para destino. Agregarlo sin un caso real sólo crea ambigüedad.

### 6. Varias comisiones

Cada comisión tiene monto y descripción opcional. Ejemplo:

```text
Origen
- Comisión bancaria: 10, adicional
- Impuesto: 5, adicional
- Comisión de plataforma: 6, descontada

Destino
- Comisión de recepción: 15
```

Máximo 10 comisiones por transferencia. Este límite evita payloads accidentales y mantiene una UI manejable. Cada monto es positivo y seguro como minor units.

Todas usan la categoría `Comisiones`; no se expone selector de categoría por comisión en v1. El concepto específico vive en `description`.

### 7. No persistir fórmulas ni tasas

Persistir únicamente las filas contables reales. No agregar a `transfers`:

- tasa;
- total debitado;
- neto recibido;
- suma de comisiones;
- modo de comisión;
- JSON del formulario.

Esos valores son derivados. El historial reconstruye principal, comisiones y efectos desde movimientos. Después de creada, no es necesario mostrar si una comisión fue “incluida” o “adicional”: se muestra la verdad financiera —principal, cada comisión y totales—.

### 8. Preview autoritativo antes de crear

La transferencia tiene dos pasos:

1. completar datos y solicitar preview;
2. revisar el desglose y confirmar.

Agregar `POST /api/transfers/preview`, protegido y sin escrituras. Usa el mismo input y las mismas validaciones/cálculo que create.

Al confirmar, `POST /api/transfers` vuelve a validar y calcular. Nunca confiar en totales enviados por el navegador ni persistir directamente el resultado del preview.

### 9. Read model lógico del ledger

Conservar `GET /api/movements` como listado técnico backward-compatible. Agregar `GET /api/ledger` como read model de dominio reutilizable por web/móvil:

- movimiento simple → una entrada;
- transferencia → una entrada con principal, fees y totales;
- las comisiones ligadas a transfer no aparecen aparte;
- paginación ocurre después de agrupar para no cortar transferencias;
- filtros se aplican a la operación lógica.

No es un endpoint “por pantalla”: expresa el ledger como operaciones humanas.

### 10. Movimientos simples

La UI crea directamente sólo `income` y `expense`. Los ajustes existen en el historial, pero son de sólo lectura en `/movements`; se gestionan mediante “Ajustar saldo” en cuentas.

En movimientos simples:

- `accountId` y `type` son inmutables después de crear;
- se editan monto, categoría, descripción y fecha;
- hard delete está permitido para corregir un registro manual, como decidió SPEC-004;
- una transferencia se elimina completa y nunca se edita parcialmente.

### 11. Categorías

- Crear ingreso/gasto permite categoría raíz, subcategoría o “Sin categoría”.
- Sólo categorías activas aparecen al crear/editar.
- El historial resuelve también categorías archivadas para no perder labels.
- El selector muestra emoji efectivo, color y ruta `Padre / Hija`.
- Este spec no agrega `kind: income | expense`; todas las categorías activas son seleccionables en ambos tipos.
- Fees siempre usan la categoría fija `Comisiones`.

### 12. Cuentas y monedas

- Formularios sólo permiten cuentas activas.
- Historial carga activas y archivadas para resolver nombres antiguos.
- Todas las cuentas, incluida `credit_card`, son válidas en el ledger.
- La cuenta determina moneda/decimales del input.
- No sumar montos de monedas incompatibles.
- FX muestra ambos montos y tasa derivada; nunca una suma consolidada sin valoración.

## Alcance

### Incluye

#### Backend

- tipo discriminado `TransferFee[]`;
- reemplazo de `feeAmount`/`feeCategoryId`;
- función pura de cálculo de breakdown;
- preview protegido sin escritura;
- creación atómica de N fees en origen/destino;
- errores estables para reglas de fees;
- read model `GET /ledger` agrupado y paginado;
- respuesta detallada de transferencia;
- tests unitarios e integración;
- actualización de D2 en `docs/DATABASE.md`.

#### Frontend

- ruta `/movements`, loading y error;
- historial agrupado por fecha;
- filtros y paginación;
- formulario de ingreso/gasto;
- edición/eliminación de movimiento simple;
- formulario dinámico de transferencia;
- múltiples fees por lado;
- preview y confirmación en dos pasos;
- detalle y eliminación de transferencia agrupada;
- composición de cuentas/categorías/monedas;
- i18n es/en, responsive, dark mode y accesibilidad;
- QA exhaustivo en navegador integrado de Codex.

### NO incluye

- migración DB o tabla `transfer_fees`;
- editar transferencias;
- comisión en una tercera cuenta;
- comisión cobrada en otra moneda distinta a la cuenta del lado;
- cobros posteriores o reembolsos vinculados;
- cálculo automático porcentual/fijo/mínimo/máximo;
- inferir spread FX como comisión;
- categorías por tipo income/expense;
- movimientos recurrentes;
- adjuntos/recibos;
- capabilities del agente;
- reportes o dashboard financiero;
- cursor pagination;
- importación CSV.

## Contratos HTTP finales

### Tipo de comisión

```ts
const sourceTransferFee = z.object({
  side: z.literal("source"),
  mode: z.enum(["deducted_from_amount", "charged_additionally"]),
  amount: minorUnits,
  description: z.string().trim().min(1).max(120).nullish(),
});

const destinationTransferFee = z.object({
  side: z.literal("destination"),
  mode: z.literal("deducted_from_received"),
  amount: minorUnits,
  description: z.string().trim().min(1).max(120).nullish(),
});

export const transferFeeInput = z.discriminatedUnion("side", [
  sourceTransferFee,
  destinationTransferFee,
]);
```

### Input compartido por preview/create

```ts
export const createTransferInput = z
  .object({
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    amountFrom: minorUnits,
    amountTo: minorUnits.optional(),
    fees: z.array(transferFeeInput).max(10).default([]),
    description: z.string().trim().max(300).nullish(),
    occurredAt: isoDate,
  })
  .refine(
    (value) => value.fromAccountId !== value.toAccountId,
    "Cannot transfer to the same account",
  );
```

Eliminar `feeAmount` y `feeCategoryId`. Como aún no existe consumidor frontend de transferencias, no mantener dos contratos paralelos. Actualizar todos los tests existentes.

### Preview: comisión descontada y en destino

```http
POST /api/transfers/preview
Content-Type: application/json

{
  "fromAccountId": "...",
  "toAccountId": "...",
  "amountFrom": 40000,
  "fees": [
    {
      "side": "source",
      "mode": "deducted_from_amount",
      "amount": 1500,
      "description": "Comisión de envío"
    },
    {
      "side": "destination",
      "mode": "deducted_from_received",
      "amount": 1500,
      "description": "Comisión de recepción"
    }
  ],
  "description": "Transferencia de prueba",
  "occurredAt": "2026-08-06"
}
```

Respuesta:

```json
{
  "fromAccountId": "...",
  "toAccountId": "...",
  "sameCurrency": true,
  "amountFrom": 40000,
  "principalFrom": 38500,
  "grossDestination": 38500,
  "sourceDeductedFees": 1500,
  "sourceAdditionalFees": 0,
  "destinationFees": 1500,
  "sourceTotalDebit": 40000,
  "destinationNetCredit": 37000,
  "rate": null,
  "fees": [
    {
      "side": "source",
      "mode": "deducted_from_amount",
      "amount": 1500,
      "description": "Comisión de envío"
    },
    {
      "side": "destination",
      "mode": "deducted_from_received",
      "amount": 1500,
      "description": "Comisión de recepción"
    }
  ]
}
```

### Create

`POST /api/transfers` recibe exactamente el mismo body. Responde:

```json
{
  "id": "transfer-uuid",
  "breakdown": {
    "fromAccountId": "source",
    "toAccountId": "destination",
    "sameCurrency": true,
    "amountFrom": 40000,
    "principalFrom": 38500,
    "grossDestination": 38500,
    "sourceDeductedFees": 1500,
    "sourceAdditionalFees": 0,
    "destinationFees": 1500,
    "sourceTotalDebit": 40000,
    "destinationNetCredit": 37000,
    "rate": null,
    "fees": [
      {
        "side": "source",
        "mode": "deducted_from_amount",
        "amount": 1500,
        "description": "Comisión de envío"
      },
      {
        "side": "destination",
        "mode": "deducted_from_received",
        "amount": 1500,
        "description": "Comisión de recepción"
      }
    ]
  },
  "movements": [
    { "type": "transfer_out", "accountId": "source", "amount": 38500 },
    { "type": "expense", "accountId": "source", "amount": 1500 },
    { "type": "transfer_in", "accountId": "destination", "amount": 38500 },
    { "type": "expense", "accountId": "destination", "amount": 1500 }
  ]
}
```

Cada fee movement usa su propia descripción, no la descripción general de la transferencia.

### Ledger lógico

```http
GET /api/ledger?kind=all&limit=50&offset=0
```

Query:

```ts
export const ledgerQuery = z.object({
  kind: z
    .enum(["all", "income", "expense", "transfer", "adjustment"])
    .default("all"),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
```

Respuesta discriminada:

```json
{
  "items": [
    {
      "entryKind": "movement",
      "id": "movement-uuid",
      "movementType": "expense",
      "accountId": "account-uuid",
      "amount": 50000,
      "categoryId": "category-uuid",
      "description": "Mercado semanal",
      "occurredAt": "2026-08-06",
      "source": "manual"
    },
    {
      "entryKind": "transfer",
      "id": "transfer-uuid",
      "fromAccountId": "source-account",
      "toAccountId": "destination-account",
      "principalFrom": 38500,
      "grossDestination": 38500,
      "sourceTotalDebit": 40000,
      "destinationNetCredit": 37000,
      "description": "Transferencia de prueba",
      "occurredAt": "2026-08-06",
      "source": "manual",
      "fees": [
        {
          "movementId": "fee-1",
          "side": "source",
          "accountId": "source-account",
          "amount": 1500,
          "categoryId": "00000000-0000-4000-8000-000000000010",
          "description": "Comisión de envío"
        },
        {
          "movementId": "fee-2",
          "side": "destination",
          "accountId": "destination-account",
          "amount": 1500,
          "categoryId": "00000000-0000-4000-8000-000000000010",
          "description": "Comisión de recepción"
        }
      ]
    }
  ],
  "total": 2,
  "limit": 50,
  "offset": 0
}
```

`categoryId` filtra movimientos simples y transferencias con al menos un fee de esa categoría. `accountId` incluye una transferencia si la cuenta participa en cualquier lado. `q` busca en descripción general o descripciones de fees, case-insensitive. `from/to` aplican a `occurredAt` inclusive.

## Backend

### Paso 1 — Tipos y schemas de transferencia

Modificar `movements.types.ts` con los contratos anteriores. Definir schemas de respuesta estrictos:

- `transferFeeResponse`;
- `transferBreakdownResponse`;
- `transferResponse` con `breakdown` y `movements`;
- unión discriminada de ledger entry;
- `ledgerResponse` paginado.

No usar `z.string()` genérico donde existe un enum conocido para `type`, `source`, `side` o `mode`.

### Paso 2 — Función pura de breakdown

Agregar en `movements.calc.ts`:

```ts
export type TransferFeeCalculationInput =
  | {
      side: "source";
      mode: "deducted_from_amount" | "charged_additionally";
      amount: number;
      description?: string | null;
    }
  | {
      side: "destination";
      mode: "deducted_from_received";
      amount: number;
      description?: string | null;
    };

export interface TransferBreakdown {
  amountFrom: number;
  principalFrom: number;
  grossDestination: number;
  sourceDeductedFees: number;
  sourceAdditionalFees: number;
  destinationFees: number;
  sourceTotalDebit: number;
  destinationNetCredit: number;
  rate: number | null;
}

export function computeTransferBreakdown(input: {
  amountFrom: number;
  amountTo?: number;
  sameCurrency: boolean;
  fees: ReadonlyArray<TransferFeeCalculationInput>;
}): TransferBreakdown
```

La función es pura, no conoce cuentas, DB, Zod ni errores HTTP. Para inputs inválidos puede lanzar errores de cálculo propios o retornar un resultado discriminado; escoger un patrón claro y mapearlo en service a errores de dominio. No duplicar sumas en service.

Debe proteger `Number.MAX_SAFE_INTEGER` en cada suma. No permitir overflow silencioso.

### Paso 3 — Errores estables

Extender `movements.errors.ts`:

```text
TRANSFER_SAME_ACCOUNT
TRANSFER_DESTINATION_AMOUNT_REQUIRED
TRANSFER_SAME_CURRENCY_AMOUNT_MISMATCH
TRANSFER_SOURCE_FEES_EXCEED_AMOUNT
TRANSFER_DESTINATION_FEES_EXCEED_AMOUNT
TRANSFER_AMOUNT_OVERFLOW
```

Todos status 400 con clases `AppError`. Las categorías/cuentas inexistentes mantienen 404 y cuentas archivadas 400 según contratos existentes.

Reglas exactas:

- `sourceDeductedFees >= amountFrom` → reject; principal nunca puede ser cero;
- `destinationFees >= grossDestination` → reject; neto nunca puede ser cero/negativo en v1;
- FX sin `amountTo` → reject;
- misma moneda con `amountTo` presente y diferente a `principalFrom` → reject;
- suma insegura → reject;
- fees vacías → válido.

### Paso 4 — Resolver contexto y preview

Crear helper de service que:

1. obtiene/valida ambas cuentas activas del usuario;
2. las bloquea sólo en create, no en preview;
3. determina `sameCurrency`;
4. valida la categoría `Comisiones` si hay fees;
5. llama una sola vez `computeTransferBreakdown`;
6. devuelve cuentas + breakdown.

No copiar lógica entre preview/create. Puede haber dos helpers: uno de resolución read-only y otro de locks transaccionales, ambos convergen en la misma función de cálculo.

`previewTransfer` no abre una transacción de escritura y no inserta filas.

### Paso 5 — Crear transferencia con N movimientos

Con locks en orden estable como hoy:

1. recalcular breakdown dentro de la transacción;
2. insertar `transfers`;
3. insertar `transfer_out` con `principalFrom`;
4. insertar un `expense` por cada fee source en cuenta origen;
5. insertar `transfer_in` con `grossDestination`;
6. insertar un `expense` por cada fee destination en cuenta destino;
7. todos fees con `SYSTEM_FEE_CATEGORY_ID`;
8. fee description propia; principal rows con description general;
9. devolver breakdown + movements.

Preservar el orden anterior en el array response. `deleteTransfer` ya elimina todo el grupo y debe seguir funcionando sin cambios conceptuales.

### Paso 6 — Read model `listLedgerEntries`

Agregar una función pública en el módulo movements. No consultar tablas de accounts/categories: devuelve IDs y el frontend compone nombres/visuales mediante sus APIs.

Implementación aceptada para escala personal:

1. cargar movimientos del usuario necesarios para los filtros de fecha;
2. agrupar filas con `transferId` por transfer;
3. convertir filas sin transfer a entry simple;
4. construir entry transfer identificando exactamente un `transfer_out` y un `transfer_in`;
5. tratar `expense` ligado al grupo como fee y determinar side por `accountId`;
6. calcular totales desde filas persistidas;
7. aplicar `kind`, account/category/q;
8. ordenar por `occurredAt DESC`, luego `createdAt DESC`;
9. calcular `total` antes de slice;
10. aplicar offset/limit a entries, nunca a filas.

Si un grupo corrupto no tiene exactamente un out/in, lanzar/loggear un error inesperado; no ocultar filas ni producir totales inventados.

En esta escala se permite agrupar en memoria. Dejar comentario de que cursor/SQL aggregation se reconsidera si el volumen lo exige.

### Paso 7 — Rutas

Agregar:

```text
POST /transfers/preview → 200 transferBreakdownResponse
GET  /ledger            → 200 ledgerResponse
```

Mantener routes delgadas y montadas mediante `app.register`. `POST /transfers` conserva 201. No invocar route functions directamente.

### Paso 8 — Tests puros

Extender `movements.calc.test.ts` con al menos:

1. sin fees: 400 → debit400/gross400/net400;
2. source deducted15: principal385/debit400/dest385;
3. source additional15: principal400/debit415/dest400;
4. destination15: debit400/gross400/net385;
5. both deducted15+destination15: debit400/net370;
6. both additional15+destination15: debit415/net385;
7. múltiples fees mezcladas y sumas exactas;
8. FX con rate basado en principalFrom;
9. source deducted igual/mayor al monto inválido;
10. destination igual/mayor al bruto inválido;
11. overflow seguro;
12. input no mutado.

### Paso 9 — Tests integración

Actualizar/expandir `movements.test.ts`:

- preview no cambia balances ni inserta filas;
- preview y create devuelven breakdown idéntico;
- cada una de las seis variantes persiste filas/montos/cuentas correctos;
- múltiples fees generan N expenses;
- todas usan category Comisiones;
- cada fee conserva description;
- misma moneda deriva gross destination;
- FX exige amountTo y deriva rate con principal;
- validaciones devuelven códigos estables;
- rollback total ante fee/categoría inválida;
- scoping: cuentas ajenas/archivadas rechazadas;
- delete transfer elimina principal y todas las fees;
- balances por cuenta son exactos en cada caso;
- ledger devuelve una entry por transferencia;
- fees no aparecen como entries sueltas;
- filtros de ledger y paginación trabajan por entry;
- raw `/movements` sigue disponible;
- movimientos simples CRUD no regresan;
- usuario B no ve/preview/delete datos de A.

No mockear Drizzle. Usar PostgreSQL Testcontainers.

## Frontend

### Paso 10 — Estructura

```text
frontend/src/
  app/(app)/movements/
    page.tsx
    loading.tsx
    error.tsx
  features/movements/
    action-state.ts
    action-helpers.ts
    actions.ts
    queries.ts
    schemas.ts
    components/
      movements-screen.tsx
      movements-toolbar.tsx
      ledger-list.tsx
      movement-entry-row.tsx
      transfer-entry-row.tsx
      create-movement-dialog.tsx
      movement-form.tsx
      transfer-form.tsx
      transfer-fees-editor.tsx
      transfer-preview.tsx
      edit-movement-dialog.tsx
      delete-movement-dialog.tsx
      delete-transfer-dialog.tsx
      category-select.tsx
      use-action-dialog.ts
  lib/api/movements.ts
```

Reutilizar componentes UI existentes. Agregar wrappers en `components/ui` sólo si realmente faltan primitivas; nunca importar Base UI directamente desde feature.

### Paso 11 — Cliente API

Expandir `lib/api/movements.ts` con tipos discriminados que reflejen exactamente backend:

```text
createMovement
updateMovement
deleteMovement
previewTransfer
createTransfer
deleteTransfer
listLedger
```

Conservar `listBalances`/`adjustAccountBalance`. No importar el cliente desde Client Components.

### Paso 12 — Query y composición

`getMovementsPageData(query)` obtiene en paralelo:

- ledger page;
- cuentas activas;
- cuentas archivadas;
- monedas;
- categorías activas;
- categorías archivadas.

Construye maps para display:

```text
accountById
currencyByCode
categoryById
parentCategoryById
```

No calcula balances ni breakdown. Para IDs faltantes, mostrar fallback localizado “Cuenta desconocida”/“Categoría eliminada” y conservar la entry; no ocultar datos históricos.

Filtros deben vivir en search params para que paginación/recarga sean estables. La page sólo parsea/compondrá mediante helper de feature; no contiene lógica.

### Paso 13 — Diseño de `/movements`

```text
Dinero
Movimientos                                  [+ Nuevo movimiento]
Consulta y registra lo que entra, sale y se transfiere.

[Todos] [Gastos] [Ingresos] [Transferencias] [Ajustes]
[Descripción...] [Cuenta] [Categoría] [Desde] [Hasta] [Limpiar]

Hoy
🛒 Mercado semanal
Mercado · Bancolombia                                  -$185.000 COP

⇄ Transferencia a Wise
PayPal USD → Wise USD                 Debitado $400 · Acreditado $370
2 comisiones · $30 USD
```

Reglas:

- `max-w-6xl`, dirección visual de SPEC-008/009/010;
- contenedor único con filas/separadores, no card por movimiento;
- agrupación por fecha localizada;
- ingreso muestra `+`, gasto `−`, ajuste copy específico;
- transferencia muestra ambos lados; nunca sumar monedas distintas;
- emoji/color efectivo en movimiento simple;
- fee icon `🧾` en detalle;
- responsive sin tabla horizontal;
- desktop puede usar columnas; móvil apila metadata/monto;
- paginación anterior/siguiente con total visible;
- estados: sin cuentas, sin movimientos, sin resultados.

Si no hay cuentas activas, CTA lleva a `/accounts`; no abrir formulario inutilizable.

### Paso 14 — Filtros

- tabs mapean `kind`;
- búsqueda sólo descripción/conceptos de fee;
- cuenta: activas + archivadas presentes en ledger;
- categoría: jerarquía con emoji;
- from/to fechas inclusivas;
- limpiar preserva la ruta y vuelve offset 0;
- cualquier cambio de filtro vuelve offset 0;
- filtros se envían al backend; no filtrar únicamente la página cargada en cliente.

### Paso 15 — Formulario de ingreso/gasto

Dialog con selector superior:

```text
[Gasto] [Ingreso] [Transferencia]
```

Gasto default. Campos:

1. cuenta activa;
2. monto humano según moneda;
3. categoría activa o Sin categoría;
4. descripción opcional máximo 300;
5. fecha local, hoy default.

Comportamiento:

- si existe una sola cuenta activa, seleccionarla;
- al cambiar cuenta, limpiar monto para no reinterpretar decimales;
- parsear dinero sólo mediante `parseMoney` en Server Action usando moneda confiable obtenida de API;
- input nunca negativo; type da signo;
- category select representa raíces e hijas (`emoji Padre / Hija`);
- submit “Registrar gasto/ingreso” con pending;
- éxito cierra, limpia y revalida `/movements`, `/accounts`, `/dashboard`;
- no incluir adjustments ni transfer types en `POST /movements`.

### Paso 16 — Editar/eliminar movimiento simple

Menú por entry manual/simple:

- Editar monto, categoría, descripción, fecha;
- cuenta/tipo sólo lectura;
- Eliminar abre AlertDialog destructivo;
- ajustes sin menú;
- transferencias usan su propio detalle/menu;
- error conserva dialog;
- éxito revalida rutas financieras.

### Paso 17 — Formulario de transferencia

Usar dos pasos dentro de un Dialog grande (`max-w-2xl`) o layout equivalente móvil.

#### Paso “Datos”

1. cuenta origen;
2. cuenta destino;
3. amountFrom;
4. amountTo sólo cuando monedas difieren;
5. selector de comisión: Sin / Origen / Destino / Ambas;
6. lista dinámica de fees por sección;
7. descripción general;
8. fecha.

No guardar totals en estado como fuente. El estado cliente sólo conserva inputs y filas de fee.

Cada fee origen:

```text
Concepto opcional
Monto
Descontada del monto | Cobrada adicionalmente
Eliminar
```

Cada fee destino:

```text
Concepto opcional
Monto
Texto fijo: “Se descuenta del monto recibido”
Eliminar
```

Botones “Agregar otra comisión”; máximo 10 total. Cambiar selector a Sin pide confirmación si eliminará filas ya digitadas.

#### Acción “Revisar transferencia”

El Client Component serializa fees como JSON en hidden input. La Server Action:

1. parsea JSON dentro de try/catch;
2. valida con Zod;
3. obtiene cuentas/monedas confiables;
4. convierte cada monto humano con `parseMoney` de la moneda del lado;
5. llama `previewTransfer`;
6. devuelve payload validado + breakdown serializable.

No hacer fetch directo desde cliente. No calcular preview en React.

#### Paso “Revisar”

Mostrar:

```text
Origen · PayPal USD
Monto de referencia                       $400
Comisiones descontadas                     $15
Principal enviado                          $385
Comisiones adicionales                       $0
Total debitado                             $400

Destino · Wise USD
Bruto recibido                             $385
Comisiones por recibir                      $15
Total acreditado                           $370
```

Listar cada fee con description y monto. FX agrega tasa derivada. Acciones:

```text
[Volver y editar] [Confirmar transferencia — debitar $400]
```

Confirm action revalida nuevamente el payload y llama create; no envía breakdown como autoridad. Si datos cambiaron o fallan, no crear parcialmente.

### Paso 18 — Detalle/eliminación de transferencia

Click en entry abre detalle con:

- origen/destino y monedas;
- fecha/description/source;
- principal out/in;
- cada fee por lado;
- total debitado/neto acreditado;
- tasa FX si aplica;
- botón “Eliminar transferencia”.

El delete confirma que eliminará toda la operación y comisiones. No ofrecer Editar. Tras éxito, balances y ledger se actualizan.

### Paso 19 — Schemas y Server Actions

Schemas frontend separados para:

- create direct movement;
- edit movement;
- movement/transfer id;
- transfer form human amounts;
- serialized fee rows;
- filters/search params.

Actions:

```text
createMovementAction
updateMovementAction
deleteMovementAction
previewTransferAction
createTransferAction
deleteTransferAction
```

Estados de preview deben poder representar `idle | error | preview`; mutaciones `idle | success | error`. Todo serializable.

Mapear códigos backend a keys i18n:

```text
TRANSFER_SAME_ACCOUNT
TRANSFER_DESTINATION_AMOUNT_REQUIRED
TRANSFER_SAME_CURRENCY_AMOUNT_MISMATCH
TRANSFER_SOURCE_FEES_EXCEED_AMOUNT
TRANSFER_DESTINATION_FEES_EXCEED_AMOUNT
TRANSFER_AMOUNT_OVERFLOW
```

Errores Zod se asocian a campos/fee index. No mostrar `message` técnico. Relanzar errores inesperados.

### Paso 20 — i18n

Agregar namespace `movements` idéntico es/en. Español fuente. Keys mínimas:

```text
eyebrow, title, subtitle, create, expense, income, transfer, adjustment
all, searchPlaceholder, account, category, allAccounts, allCategories
fromDate, toDate, clearFilters, previousPage, nextPage, showingResults
amount, description, date, noCategory, saving, reviewing, confirm
createExpenseTitle, createIncomeTitle, createTransferTitle
registerExpense, registerIncome, reviewTransfer, confirmTransfer
fromAccount, toAccount, amountFrom, amountTo, exchangeRate
fees, noFees, sourceFees, destinationFees, bothSides
feeConcept, feeAmount, deductedFromAmount, chargedAdditionally
deductedFromReceived, addFee, removeFee, discardFeesTitle
referenceAmount, principalSent, grossReceived, totalDebited, totalCredited
sourceDeductedFees, sourceAdditionalFees, destinationFeeTotal
backAndEdit, transferDetails, movementDetails
editMovement, deleteMovement, deleteTransfer
deleteMovementDescription, deleteTransferDescription
today, emptyTitle, emptyDescription, noResultsTitle, noResultsDescription
noAccountsTitle, noAccountsDescription, goToAccounts
unknownAccount, deletedCategory, manualSource, agentSource
createSuccess, updateSuccess, deleteSuccess, transferSuccess
errorSameAccount, errorDestinationAmountRequired, errorSameCurrencyAmount
errorSourceFeesExceed, errorDestinationFeesExceed, errorAmountOverflow
errorInvalidAmount, errorInvalidFees, errorGeneric
```

Agregar copy natural inglés para todas. Ningún string visible o aria-label hardcodeado.

## Errores comunes que NO cometer

1. No crear tabla `transfer_fees`.
2. No guardar totales/tasa derivados.
3. No conservar `feeAmount` junto al nuevo array.
4. No crear fee destino en cuenta origen.
5. No restar fee twice: el principal y expense deben seguir fórmula canónica.
6. No usar `amountFrom` como transfer_out cuando hay fees descontadas.
7. No derivar FX rate desde amountFrom si principalFrom es distinto.
8. No copiar descripción general a todas las fees.
9. No omitir category Comisiones.
10. No permitir principal/neto cero o negativo.
11. No calcular breakdown en frontend.
12. No confiar en preview al confirmar; recalcular.
13. No paginar filas antes de agrupar transfers.
14. No mostrar fees ligadas como movimientos sueltos.
15. No editar/eliminar parcialmente transfer rows.
16. No sumar monedas distintas.
17. No usar categorías archivadas en forms.
18. No perder labels históricos de cuentas/categorías archivadas.
19. No hacer fetch desde Client Components.
20. No introducir reportes, recurrencia o AI “de paso”.

## Criterios de aceptación

### Backend

- [ ] No hay migración/schema DB nuevo.
- [ ] `feeAmount`/`feeCategoryId` fueron reemplazados por `fees[]`.
- [ ] Función pura cubre todas las variantes y overflow.
- [ ] Preview no escribe y coincide con create.
- [ ] Create genera filas correctas por lado en una transacción.
- [ ] Múltiples fees conservan description/categoría.
- [ ] Balances coinciden con breakdown.
- [ ] FX usa principalFrom para rate.
- [ ] Errores tienen códigos estables.
- [ ] `/ledger` agrupa y pagina operaciones.
- [ ] Raw `/movements` y CRUD existente no regresan.
- [ ] Scoping por usuario se conserva.
- [ ] Tests unit/integration pasan.

### Frontend

- [ ] `/movements` existe con loading/error.
- [ ] Historial agrupa transfers y fechas.
- [ ] Crear ingreso/gasto funciona con categorías.
- [ ] Editar/eliminar simples funciona.
- [ ] Ajustes son read-only.
- [ ] Transfer form soporta las seis variantes.
- [ ] Se pueden agregar/eliminar hasta 10 fees.
- [ ] Preview viene del backend y precede confirmación.
- [ ] Detalle muestra principal, fees y netos.
- [ ] Delete transfer elimina grupo completo.
- [ ] Filtros/paginación usan backend/search params.
- [ ] Monedas se formatean con `lib/money.ts`.
- [ ] i18n es/en completo.
- [ ] Responsive/dark/accessibility correctos.

### Verificación automatizada

Backend:

```bash
npm run typecheck
npm test
npm run build
```

Frontend:

```bash
pnpm test
pnpm lint
pnpm build
```

## QA manual obligatorio en navegador integrado de Codex

Después de automatizados, levantar backend/frontend y usar exclusivamente el navegador integrado de Codex para flujos UI. Reutilizar el procedimiento de entorno y credenciales de SPEC-010:

```text
Email: prueba@gmail.com
Contraseña: 123456789
URL dev: http://localhost:3001
```

Si no existe, registrar una sola vez. Crear un sufijo de ejecución `QA-MOV-<fecha-hora>` para evitar colisiones. No borrar volúmenes/DB.

Registrar matriz `ID | flujo | esperado | observado | PASS/FAIL | evidencia`, capturas desktop/móvil/dark y errores encontrados. Todo FAIL debe corregirse y repetirse antes de completar.

### Flujos mínimos QA

#### Preparación

- **MOV-QA-001:** login, sidebar → Movimientos, ruta seleccionada.
- **MOV-QA-002:** crear/verificar dos cuentas COP y dos USD con saldos suficientes mediante `/accounts`.
- **MOV-QA-003:** crear/verificar categorías y subcategorías mediante `/categories`.
- **MOV-QA-004:** estado vacío/sin resultados y CTA cuando corresponda.

#### Ingresos y gastos

- **MOV-QA-010:** crear ingreso con raíz, descripción y hoy.
- **MOV-QA-011:** crear gasto con subcategoría y fecha pasada.
- **MOV-QA-012:** crear gasto Sin categoría.
- **MOV-QA-013:** validar monto vacío/cero/negativo/inválido.
- **MOV-QA-014:** editar monto/categoría/description/fecha.
- **MOV-QA-015:** cancelar edición y comprobar no cambio.
- **MOV-QA-016:** cancelar delete; luego eliminar y comprobar balance.
- **MOV-QA-017:** recargar y comprobar persistencia/formato.

#### Transferencias misma moneda

- **MOV-QA-020:** sin comisión: debit400/credit400.
- **MOV-QA-021:** source deducted15: debit400/credit385.
- **MOV-QA-022:** source additional15: debit415/credit400.
- **MOV-QA-023:** destination15: debit400/credit385.
- **MOV-QA-024:** both con source deducted15 + dest15: debit400/credit370.
- **MOV-QA-025:** both con source additional15 + dest15: debit415/credit385.
- **MOV-QA-026:** múltiples fees mezcladas, descriptions y sumas exactas.
- **MOV-QA-027:** agregar/eliminar fee row antes de preview.
- **MOV-QA-028:** cambiar selector a Sin con fees existentes y cancelar/confirmar descarte.

En cada caso verificar pantalla preview antes de confirmar y balances de ambas cuentas después.

#### FX

- **MOV-QA-030:** COP→USD con ambos montos, sin fee, tasa correcta.
- **MOV-QA-031:** FX con source deducted y destination fee.
- **MOV-QA-032:** FX sin amountTo muestra error y no crea.
- **MOV-QA-033:** cambiar cuentas/monedas limpia montos incompatibles.

#### Validaciones/atomicidad visibles

- **MOV-QA-040:** misma cuenta origen/destino bloqueada.
- **MOV-QA-041:** fees descontadas iguales/mayores al monto bloqueadas.
- **MOV-QA-042:** fees destino iguales/mayores al bruto bloqueadas.
- **MOV-QA-043:** más de 10 fees bloqueado.
- **MOV-QA-044:** doble submit crea una sola operación.
- **MOV-QA-045:** error mantiene formulario y valores.
- **MOV-QA-046:** volver desde preview permite editar y nuevo preview cambia totales.

#### Historial/detalle/delete

- **MOV-QA-050:** cada transfer aparece como una fila, nunca fee suelta.
- **MOV-QA-051:** detalle lista todos los componentes por lado.
- **MOV-QA-052:** no existe Editar transferencia.
- **MOV-QA-053:** cancelar delete conserva grupo/balances.
- **MOV-QA-054:** confirmar delete elimina grupo y revierte efectos exactos.
- **MOV-QA-055:** ajustes se ven y no tienen acciones edit/delete.

#### Filtros/paginación

- **MOV-QA-060:** tabs todos/gastos/ingresos/transfers/ajustes.
- **MOV-QA-061:** filtro cuenta incluye transfer si participa en cualquier lado.
- **MOV-QA-062:** filtro categoría y Sin categoría.
- **MOV-QA-063:** rango de fechas inclusivo.
- **MOV-QA-064:** búsqueda por descripción general y fee.
- **MOV-QA-065:** combinación, limpiar y sin resultados.
- **MOV-QA-066:** paginación no separa componentes de transfer.

#### Visual/accesibilidad/regresión

- **MOV-QA-070:** desktop 1440×900.
- **MOV-QA-071:** tablet 768×1024.
- **MOV-QA-072:** móvil 390×844 sin overflow.
- **MOV-QA-073:** light/dark con contraste.
- **MOV-QA-074:** español/inglés completo.
- **MOV-QA-075:** teclado/foco/Escape/aria-live.
- **MOV-QA-076:** `/accounts`, `/categories`, `/dashboard` sin regresiones.
- **MOV-QA-077:** logout/login conserva datos del usuario.

Entrega final del ejecutor: matriz completa, sufijo, capturas con rutas absolutas, comandos automatizados/resultados, bugs/fixes/retests y confirmación explícita de todas las variantes de comisión.

## Al completar

1. Cambiar estado a `✅ completado — YYYY-MM-DD`.
2. Actualizar D2 en `docs/DATABASE.md` indicando fees múltiples en origen/destino, sin duplicar columnas.
3. Verificar que no se generó migración.
4. Verificar diff y que ningún fee aparezca huérfano.
5. No completar sin QA de navegador y todas las variantes PASS.
