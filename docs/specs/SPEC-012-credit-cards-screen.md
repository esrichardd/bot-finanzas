# SPEC-012: Gestión integral de tarjetas de crédito

Estado: ✅ completado — 2026-08-06

Ejecutar cumpliendo `ARCHITECTURE.md`, `backend/ARCHITECTURE.md`,
`frontend/ARCHITECTURE.md`, `docs/DATABASE.md`,
[ADR-004](../architecture/adr/ADR-004-credit-cards-as-accounts.md) y los
contratos completados por SPEC-009, SPEC-010 y SPEC-011. Este spec amplía el
módulo `credit-cards` y construye `/credit-cards`; una tarjeta continúa siendo
una cuenta del ledger.

Este documento es deliberadamente explícito porque será ejecutado por un modelo de menor capacidad. Antes de escribir Next.js, leer completas las guías locales relevantes de `frontend/node_modules/next/dist/docs/` exigidas por `frontend/AGENTS.md`, especialmente formularios, Server Actions, search params, revalidación, loading/error y navegación.

## Prerrequisitos

Antes de ejecutar:

- SPEC-010 completado: categorías con emoji/color y categoría `Comisiones` disponible;
- SPEC-011 completado: `/movements`, ledger lógico, transferencias con comisiones y formularios prellenables;
- tests existentes de accounts, movements y credit-cards en verde.

Este feature reutiliza movimientos para compras y transferencias para pagos/avances. Si SPEC-011 sigue sólo como documento, implementarlo primero. No copiar sus formularios dentro de credit-cards.

## Objetivo

Entregar `/credit-cards` como una pantalla completa donde el usuario pueda:

1. consultar tarjetas activas y archivadas;
2. crear tarjeta + detalles + deuda inicial en una sola transacción;
3. ver deuda, saldo a favor, cupo disponible, uso, corte y pago;
4. editar nombre, institución, cupo, días y cuota de manejo atómicamente;
5. registrar compras usando el formulario de gastos de SPEC-011;
6. pagar la tarjeta mediante transferencia desde otra cuenta;
7. registrar avances mediante transferencia desde la tarjeta;
8. registrar manualmente la cuota de manejo;
9. corregir deuda/saldo mediante ajuste;
10. consultar historial filtrado por tarjeta;
11. archivar únicamente en balance cero y restaurar;
12. completar tarjetas legacy que existan sin `credit_card_details`;
13. comprobar desde UI, red, consola y PostgreSQL que cada operación realmente persistió.

Al terminar, una tarjeta puede recorrer su ciclo real completo: creación → compra → deuda → pago parcial/total → edición → archivo/restauración, sin `curl` ni escrituras manuales.

## Estado inicial verificado

- `accounts.type = credit_card` ya existe.
- `credit_card_details` ya almacena `creditLimit`, `cutDay`, `paymentDueDay` y `managementFee`.
- Deuda, cupo disponible y próximas fechas ya son derivados puros.
- El backend permite GET/PUT por `/accounts/:id/credit-card`.
- El flujo actual exige crear primero una cuenta y después configurar detalles; puede dejar tarjetas incompletas.
- El endpoint genérico de cuentas todavía acepta `credit_card`.
- No existe listado agregado de tarjetas.
- La lectura actual exige cuenta activa, por lo que no sirve para archivadas.
- Comprar ya es `expense` sobre la cuenta tarjeta.
- Pagar ya es una transferencia hacia la tarjeta.
- Avanzar efectivo ya es una transferencia desde la tarjeta.
- Archivar cuenta ya exige balance cero y conserva movimientos.
- `/accounts` excluye deliberadamente tarjetas.
- `/credit-cards` aparece en navegación pero no existe.
- No se requiere migración ni nueva tabla para este feature.

## Decisiones de producto y dominio (normativas)

### 1. Una tarjeta sigue siendo cuenta + satélite

No crear columnas de deuda, disponible, gasto mensual o pago acumulado.

```text
accounts (type=credit_card)
└── credit_card_details (1:1)

debt             = max(0, -balance)
creditBalance    = max(0, balance)
availableCredit  = max(0, creditLimit + balance)
utilization      = debt / creditLimit * 100
```

`balance` continúa siendo `SUM(movements)`. Una compra lo hace más negativo; un pago/ingreso lo acerca a cero o crea saldo a favor.

### 2. Creación agregada y atómica

Agregar `POST /api/credit-cards`. Una sola transacción debe crear:

1. cuenta `credit_card`;
2. fila `credit_card_details`;
3. opcionalmente movimiento `adjustment_out` por deuda inicial.

Si cualquier paso falla, no queda cuenta, detalle ni movimiento. Prohibido hacer tres requests desde el navegador.

### 3. Deuda inicial

El usuario ingresa deuda actual como monto no negativo. Si es mayor que cero:

```text
type: adjustment_out
amount: deuda inicial
categoryId: null
transferId: null
source: manual
description: "Deuda inicial"
occurredAt: fecha seleccionada
```

No registrar como `expense`: no representa consumo del período actual y no debe contaminar reportes.

Input vacío o cero omite el movimiento. Este spec no ofrece saldo inicial a favor en creación; puede ajustarse después.

### 4. Evitar nuevas tarjetas incompletas

Después de este spec, `POST /api/accounts` debe rechazar `type: credit_card` con error estable `CREDIT_CARD_DEDICATED_FLOW_REQUIRED`. El constructor interno `createAccount` conserva el tipo porque lo usa `openCreditCard` dentro de transacción.

El único flujo público de creación es `POST /api/credit-cards`.

### 5. Tarjetas legacy incompletas

Puede haber cuentas credit_card antiguas sin details. No ocultarlas ni romper toda la lista.

El listado devuelve unión discriminada:

- `configured: true`: tarjeta normal con derivados;
- `configured: false`: cuenta visible con balance, sin detalles.

La UI muestra “Configuración incompleta” y sólo permite:

- completar configuración;
- ver historial;
- ajustar balance;
- archivar si balance cero.

Completar usa el mismo endpoint combinado de edición y crea/upsertea details atómicamente. Una vez configurada, deja de aparecer como incompleta.

### 6. Edición combinada y atómica

Editar debe guardar juntos:

- account: nombre e institución;
- details: límite, corte, pago y cuota.

Tipo y moneda permanecen inmutables. Usar `PATCH /api/credit-cards/:id` con objeto completo de formulario. No hacer `PATCH account` seguido de `PUT details` desde frontend.

Se permite reducir cupo por debajo de deuda actual; `availableCredit` será cero y utilización puede superar 100%. La UI muestra advertencia, no bloquea: un emisor real puede reducir el límite con deuda vigente.

### 7. Cuota de manejo es metadata

`managementFee` no genera movimientos automáticamente. La UI debe decirlo claramente.

Si existe, acción “Registrar cuota de manejo” abre/navega al formulario de gasto de SPEC-011 prellenado con:

- accountId de la tarjeta;
- amount de managementFee;
- categoryId Comisiones;
- description “Cuota de manejo”.

El usuario revisa y confirma. No crear cron ni recurrencia.

### 8. Compras, pagos y avances reutilizan movements

No duplicar lógica/formularios:

```text
Registrar compra
→ /movements?create=expense&accountId=<cardId>

Pagar tarjeta
→ /movements?create=transfer&toAccountId=<cardId>

Registrar avance
→ /movements?create=transfer&fromAccountId=<cardId>

Ver movimientos
→ /movements?accountId=<cardId>
```

SPEC-011 debe aceptar estos search params, abrir el dialog correspondiente una vez y preseleccionar datos. Tras cerrar/guardar, limpiar `create` de la URL para evitar reapertura o loops al revalidar/volver atrás.

Un pago puede superar la deuda y producir saldo a favor. No bloquearlo en backend; el preview de transferencia hace visible el efecto.

### 9. Corrección de deuda

Acción “Corregir saldo” reutiliza `POST /accounts/:id/balance-adjustments` desde un dialog propio de tarjetas.

El usuario elige estado objetivo:

- Deuda: direction `out`;
- Sin deuda: amount 0;
- Saldo a favor: direction `in`.

El backend calcula diferencia. La UI nunca calcula qué movimiento crear.

### 10. Ciclo de vida

- Archivar sólo con balance exactamente cero.
- Deuda y saldo a favor bloquean archivo.
- Archivar conserva details y movements.
- Restaurar conserva configuración e historial.
- Archivada: sólo restaurar/ver historial; no compra, pago, avance, cuota, edición ni ajuste.
- No existe hard delete.

### 11. Fechas

Conservar `cutDay` y `paymentDueDay` independientes, ambos 1–31, con clampeo existente a último día del mes.

No inferir ciclo de facturación, extracto, pago mínimo ni relación contractual corte→pago. “Próxima fecha” es metadata orientativa calculada con la función existente.

### 12. Utilización y saldo a favor

Agregar funciones puras:

```ts
export function creditBalance(balance: number): number {
  return Math.max(0, balance);
}

export function creditUtilization(
  debt: number,
  creditLimit: number,
): number {
  return (debt / creditLimit) * 100;
}
```

El porcentaje real puede superar 100. La barra visual se clampa a 100 sólo para ancho, pero el texto muestra el porcentaje real formateado.

### 13. Dirección visual

Pantalla sobria, consistente con SPEC-008–011:

- cards financieras abstractas, no imitaciones de plástico con números falsos;
- tokens semánticos, sin colores bancarios hardcodeados;
- deuda como cifra principal;
- cupo/uso y fechas con jerarquía clara;
- barra de utilización accesible con label textual;
- sin gradientes, glow, glass ni sombras dramáticas;
- responsive y dark mode;
- acciones críticas en menús/dialogs, CTAs frecuentes visibles.

## Alcance

### Incluye

#### Backend

- creación transaccional aggregate;
- rechazo de creación genérica incompleta;
- listado activo/archivado configurado/incompleto;
- lectura de archivadas;
- edición combinada atómica;
- nuevos derivados creditBalance/utilization;
- errores estables;
- tests de rollback, scoping, lifecycle y cálculos;
- actualización del modelo de tarjetas en DATABASE.md.

#### Frontend

- `/credit-cards`, loading/error;
- grid y filtros active/archived;
- crear/completar/editar;
- deuda inicial;
- comprar/pagar/avance/cuota/historial mediante SPEC-011;
- ajuste, archive/restore;
- feedback, estados vacíos/incompletos;
- i18n es/en, responsive, dark, accesibilidad;
- QA real en navegador + consola + red + PostgreSQL;
- teardown seguro de procesos iniciados por el ejecutor.

### NO incluye

- nueva migración o columnas;
- números de tarjeta, CVV, fecha de expiración o franquicia;
- información sensible bancaria;
- pago mínimo;
- compras a cuotas/amortización;
- intereses;
- extractos/ciclos de facturación;
- cobro automático de cuota;
- recordatorios/alertas;
- débito automático;
- recompensas/puntos/cashback;
- hard delete;
- dashboard;

## Contratos HTTP finales

### Schemas base

```ts
const minorUnits = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonNegativeMinorUnits = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);
const dayOfMonth = z.number().int().min(1).max(31);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const creditCardDetailsInput = z.object({
  creditLimit: minorUnits,
  cutDay: dayOfMonth,
  paymentDueDay: dayOfMonth,
  managementFee: minorUnits.nullish(),
});
```

### Crear

```ts
export const openCreditCardInput = creditCardDetailsInput.extend({
  name: z.string().trim().min(1).max(60),
  currencyCode: z.string().trim().toUpperCase().min(3).max(10),
  institution: z.string().trim().min(1).max(60).nullish(),
  openingDebt: z
    .object({
      amount: nonNegativeMinorUnits,
      occurredAt: isoDate,
    })
    .optional(),
});
```

El frontend omite `openingDebt` cuando amount es 0/vacío; backend tolera objeto con 0 tratándolo como sin movimiento.

```http
POST /api/credit-cards
```

```json
{
  "name": "Visa Platinum",
  "currencyCode": "COP",
  "institution": "Bancolombia",
  "creditLimit": 800000000,
  "cutDay": 15,
  "paymentDueDay": 30,
  "managementFee": 3500000,
  "openingDebt": {
    "amount": 120000000,
    "occurredAt": "2026-08-06"
  }
}
```

Respuesta 201 configurada.

### Listar

```http
GET /api/credit-cards?status=active
GET /api/credit-cards?status=archived
```

Query default `active`.

Respuesta configurada:

```json
{
  "configured": true,
  "account": {
    "id": "uuid",
    "name": "Visa Platinum",
    "type": "credit_card",
    "currencyCode": "COP",
    "institution": "Bancolombia",
    "archived": false
  },
  "creditLimit": 800000000,
  "cutDay": 15,
  "paymentDueDay": 30,
  "managementFee": 3500000,
  "balance": -120000000,
  "debt": 120000000,
  "creditBalance": 0,
  "availableCredit": 680000000,
  "utilizationPercentage": 15,
  "nextCutDate": "2026-08-15",
  "nextPaymentDueDate": "2026-08-30"
}
```

Respuesta incomplete:

```json
{
  "configured": false,
  "account": {
    "id": "uuid",
    "name": "Tarjeta legacy",
    "type": "credit_card",
    "currencyCode": "COP",
    "institution": null,
    "archived": false
  },
  "balance": 0
}
```

Usar unión Zod discriminada por `configured`.

### Editar/completar

```ts
export const updateCreditCardInput = creditCardDetailsInput.extend({
  name: z.string().trim().min(1).max(60),
  institution: z.string().trim().min(1).max(60).nullable(),
});
```

```http
PATCH /api/credit-cards/:id
```

Sólo activa. Actualiza account + upsert details dentro de transacción y responde tarjeta configurada.

### Lectura individual

Conservar backward-compatible:

```http
GET /api/accounts/:id/credit-card
PUT /api/accounts/:id/credit-card
```

GET puede leer activa o archivada y devuelve 404 si incompleta. PUT sólo activa y mantiene details-only para clientes existentes. La UI nueva usa POST/list/PATCH combinados.

### Archive/restore/adjust

Reutilizar sin endpoints duplicados:

```text
DELETE /api/accounts/:id
POST   /api/accounts/:id/restore
POST   /api/accounts/:id/balance-adjustments
```

## Backend

### Paso 1 — Acceso a cuenta activa/archivada

Agregar en accounts service:

```ts
export async function getOwnedAccount(
  db: DbExecutor,
  userId: string,
  accountId: string,
) {
  return orThrow(
    await db.query.accounts.findFirst({
      where: ownedBy(accounts.userId, userId, eq(accounts.id, accountId)),
    }),
    "account",
  );
}
```

`getOwnedActiveAccount` puede reutilizarlo y luego validar archived. No duplicar query.

### Paso 2 — Bloquear creación genérica

Crear error `CreditCardDedicatedFlowRequiredError` en accounts errors:

```text
status: 400
code: CREDIT_CARD_DEDICATED_FLOW_REQUIRED
message: Credit cards must be created through POST /credit-cards
```

En `openAccount`, antes de abrir/escribir la transacción, rechazar `input.type === "credit_card"`. No quitar credit_card de `CreateAccountInput`, porque `createAccount` interno y otros tipos dependen del enum.

Actualizar tests de accounts y cualquier fixture que creaba tarjeta vía endpoint genérico.

### Paso 3 — Tipos/responses

En `credit-cards.types.ts` agregar schemas anteriores y:

- account response anidada;
- `configuredCreditCardResponse` literal true;
- `incompleteCreditCardResponse` literal false;
- unión y list response;
- list query status;
- create/update inputs.

Mantener `upsertCreditCardInput` para PUT legacy.

### Paso 4 — Derivados puros

Agregar `creditBalance` y `creditUtilization` con tests:

- deuda 0 → utilization 0;
- deuda mitad límite → 50;
- deuda mayor límite → >100, no clamp;
- balance positivo → creditBalance positivo/debt0;
- límite siempre positivo por Zod.

No leer fecha/DB en calc.

### Paso 5 — Componer response

Crear helper de service que recibe account, details nullable, balance y `currentDate`:

- sin details → incomplete;
- con details → configured + derivados.

Una sola función canónica para get/list/create/update. No repetir fórmulas.

### Paso 6 — Listar tarjetas

`listCreditCards(db,userId,status)`:

1. llamar `listAccounts` público y filtrar `type=credit_card`;
2. obtener balances mediante `getBalances` público una vez y crear map;
3. consultar sólo tabla propia `credit_card_details` para ids de tarjetas (`inArray`); si lista vacía no ejecutar IN vacío;
4. componer configured/incomplete;
5. ordenar por account.name;
6. calcular currentDate una vez por request.

No hacer N llamadas getAccountBalance. No consultar tabla accounts desde credit-cards.

### Paso 7 — Crear aggregate

`openCreditCard(db,userId,input)` abre una transacción:

1. `createAccount(tx,userId,{name,type:"credit_card",currencyCode,institution})`;
2. insertar details, no upsert;
3. si openingDebt.amount > 0, `createMovement(tx,...)` adjustment_out;
4. obtener/componer response usando balance conocido `-amount` o `getAccountBalance(tx,...)`;
5. devolver configured.

La función vive en credit-cards porque ya depende de accounts y movements sin crear ciclo.

### Paso 8 — Editar/completar aggregate

`updateCreditCard(db,userId,id,input)` en transacción:

1. lock owned active account;
2. validar type credit_card;
3. `updateAccount(tx,...)` con name/institution;
4. upsert details;
5. leer balance y devolver composed;
6. rollback total ante name conflict/details failure.

PUT legacy puede reutilizar helper details-only, pero nunca actualizar nombre.

### Paso 9 — Lectura individual archivada

Cambiar get para usar `getOwnedAccount`, validar type y permitir archived. Escrituras continúan usando active/lock.

### Paso 10 — Rutas

Agregar:

```text
POST  /credit-cards      201
GET   /credit-cards      200
PATCH /credit-cards/:id  200
```

Mantener GET/PUT legacy. Routes sólo validan/llaman service.

### Paso 11 — Tests backend

Unit puros y Testcontainers. Casos mínimos:

1. POST/list/PATCH sin auth → 401;
2. open crea exactamente account + details;
3. openingDebt0 no crea movement;
4. openingDebt positivo crea adjustment_out correcto;
5. fallo en details/movement revierte account;
6. nombre duplicado no deja orphan;
7. generic POST accounts credit_card devuelve código dedicado;
8. list active/archived scope correcto;
9. list usa configured/incomplete;
10. user B no ve/edita A;
11. update modifica account/details y updatedAt;
12. update name conflict rollback details;
13. limit menor a debt permitido, available0/utilization>100;
14. expense aumenta debt/disminuye available;
15. payment parcial/total/sobrepago deriva correctamente;
16. creditBalance ante sobrepago;
17. archive con deuda/saldo favor falla;
18. archive en cero conserva details/movements;
19. restore conserva todo;
20. GET archived funciona, PUT archived falla;
21. días 0/32 y money inválido fallan;
22. scoping legacy endpoints se conserva;
23. list vacío evita query inválida;
24. tests existentes de fechas y movimientos siguen verdes.

Para probar rollback no mockear Drizzle: provocar constraint/error real dentro de transacción o crear helper testeable que falle después de account sólo en una ruta de integración controlada; no introducir flags de test en producción. Preferir nombre duplicado y constraint DB real.

## Frontend

### Paso 12 — Estructura

```text
frontend/src/
  app/(app)/credit-cards/
    page.tsx
    loading.tsx
    error.tsx
  features/credit-cards/
    action-state.ts
    action-helpers.ts
    actions.ts
    queries.ts
    schemas.ts
    components/
      credit-cards-screen.tsx
      credit-cards-toolbar.tsx
      credit-cards-grid.tsx
      credit-card-panel.tsx
      credit-card-actions.tsx
      create-credit-card-dialog.tsx
      edit-credit-card-dialog.tsx
      adjust-card-balance-dialog.tsx
      archive-credit-card-dialog.tsx
      use-action-dialog.ts
  lib/api/credit-cards.ts
```

No importar código de `features/accounts` o `features/movements`. Navegar a movements para sus flujos; reutilizar sólo `components/ui/shared` y `lib/api` desde actions.

### Paso 13 — Cliente API/query

`lib/api/credit-cards.ts` refleja unión discriminada y expone:

```text
listCreditCards(status)
openCreditCard(payload)
updateCreditCard(id,payload)
```

Actions también reutilizan `archiveAccount`, `restoreAccount`, `adjustAccountBalance` existentes.

Query trae en paralelo:

- active cards;
- archived cards;
- currencies.

No necesita balances aparte: list response ya los incluye. Filtrar monedas no: cualquier currency existente es válida, aunque lo habitual sea fiat.

### Paso 14 — Page/loading/error

Page mínima compone `CreditCardsScreen`. Loading aproxima header, toolbar y cuatro panels. Error boundary con retry. Sin spinner manual.

### Paso 15 — Diseño `/credit-cards`

```text
Crédito
Tarjetas de crédito                         [+ Nueva tarjeta]
Controla deuda, cupo y próximas fechas.

[Activas] [Archivadas]
[Buscar nombre o banco...] [Moneda] [Orden: próxima fecha de pago]

┌──────────────────────────────────┐
│ Visa Platinum        Bancolombia │
│                                  │
│ Deuda                    $1.2 M  │
│ Cupo disponible          $6.8 M  │
│ ███░░░░░░░ 15%                   │
│                                  │
│ Corte 15 ago · Pago 30 ago       │
│ Cuota de manejo        $35.000   │
│                                  │
│ [Registrar compra] [Pagar]  [...]│
└──────────────────────────────────┘
```

Grid exacto `grid-cols-1 lg:grid-cols-2`. No tres columnas: cada panel necesita cifras/acciones legibles.

Panel:

- nombre/institución/moneda;
- deuda o “Sin deuda”; si balance>0, “Saldo a favor”;
- límite/disponible;
- utilization texto + progress accesible;
- próximas fechas localizadas;
- management fee o “Sin cuota registrada”;
- CTAs compra/pago;
- menú: avance, cuota, historial, corregir, editar, archivar.

No usar números de tarjeta ficticios. Positive balance no se pinta como deuda.

### Paso 16 — Toolbar/estados

- tabs active/archived;
- búsqueda tolerante a tildes por name/institution;
- filtro currency;
- orden name, debt desc, utilization desc, next payment asc;
- sin cards active: CTA primera tarjeta;
- no results: limpiar;
- archived empty: copy específico;
- incomplete visible primero o con badge warning, no oculto.

### Paso 17 — Crear tarjeta

Dialog campos:

1. name;
2. institution opcional;
3. currency;
4. creditLimit;
5. cutDay;
6. paymentDueDay;
7. managementFee opcional;
8. sección “Deuda actual (opcional)” amount/date.

Money inputs humanos y parseados en Server Action con currency confiable obtenida de API. Vacío/0 de debt y fee → null/omit. Días input number min1 max31 con errors.

Copy explica:

- deuda inicial crea ajuste, no gasto;
- cuota no se cobra automáticamente;
- moneda no cambia después.

Una sola action llama POST aggregate. Éxito cierra/revalida cards/accounts/movements/dashboard.

### Paso 18 — Editar/completar

Edit configurada precarga todo excepto moneda (read-only). Guardar full PATCH.

Si limit nuevo < debt, mostrar warning visual con deuda/límite, pero permitir confirmar. No calcular available en frontend; sólo comparar inputs para warning presentacional y backend recalcula response.

Incomplete usa dialog “Completar configuración” con account name/institution y details. Al guardar cambia inmediatamente a panel normal.

### Paso 19 — Acciones que navegan a movements

Construir links con `URLSearchParams`, no concatenación insegura.

- purchase: create expense + account;
- payment: create transfer + to;
- advance: create transfer + from;
- management fee: expense + account + amount + category Comisiones + description;
- history: filter account only.

Para montos prellenados usar `amountMinor=<integer>` en la URL, nunca un string humano ambiguo. Movements resuelve la moneda de la cuenta y llama `formatMoneyInput` para llenar el control editable. Para texto usar `description`, y para categoría `categoryId`. Todos los params son sugerencias no confiables: se validan contra cuentas/categorías accesibles antes de usarse.

SPEC-011 movements screen debe:

1. consumir search params una vez;
2. validar ids contra datos activos;
3. prellenar pero permitir cambiar;
4. abrir dialog sólo después de datos cargados;
5. remover `create` con `router.replace` al cerrar/éxito;
6. no reabrir por `router.refresh`, back/forward o revalidation;
7. ignorar params inválidos con feedback, no loop/error.

### Paso 20 — Ajustar, archivar, restaurar

Adjust dialog muestra balance/debt actual y pide target debt/balance nature/date. Usa endpoint existente. Después revalida cards/accounts/movements.

Archive:

- disabled con balance !=0;
- copy diferente para deuda vs saldo a favor;
- confirm en cero;
- backend autoridad.

Archived panel sólo muestra historial + restore. Restore action conserva details.

### Paso 21 — Server Actions

```text
openCreditCardAction
updateCreditCardAction
adjustCreditCardBalanceAction
archiveCreditCardAction
restoreCreditCardAction
```

Mismo patrón serializable de specs anteriores. Validar FormData, parseMoney, ids; ApiError conocido a i18n; inesperado se relanza. Revalidar rutas financieras pertinentes.

Map mínimo:

```text
ACCOUNT_NAME_CONFLICT
ACCOUNT_BALANCE_NOT_ZERO
ACCOUNT_ALREADY_ACTIVE
ACCOUNT_ALREADY_AT_TARGET_BALANCE
CREDIT_CARD_DEDICATED_FLOW_REQUIRED
```

No mostrar backend message.

### Paso 22 — i18n

Namespace `creditCards` igual es/en. Keys mínimas:

```text
eyebrow, title, subtitle, create, createTitle, createDescription
active, archived, status, searchPlaceholder, currency, allCurrencies
sort, sortName, sortDebt, sortUtilization, sortPaymentDate, clearFilters
name, institution, institutionOptional, creditLimit, cutDay, paymentDueDay
managementFee, managementFeeOptional, managementFeeDisclaimer
openingDebt, openingDebtHint, amount, date, debt, noDebt, creditBalance
availableCredit, utilization, nextCutDate, nextPaymentDueDate
purchase, pay, cashAdvance, registerManagementFee, history
edit, editTitle, completeSetup, incompleteTitle, incompleteDescription
adjust, adjustTitle, targetState, targetDebt, noDebtOption, creditBalanceOption
archive, archiveTitle, archiveDescription, archiveDebtBlocked, archiveCreditBlocked
restore, actionsFor, immutableCurrency, lowerLimitWarning
emptyTitle, emptyDescription, emptyArchivedTitle, emptyArchivedDescription
noResultsTitle, noResultsDescription, saving
createSuccess, updateSuccess, adjustSuccess, archiveSuccess, restoreSuccess
errorNameConflict, errorBalanceNotZero, errorAlreadyActive
errorAlreadyAtBalance, errorInvalidAmount, errorInvalidDay, errorGeneric
```

Strings de params/labels/aria también localizados. `creditCards` ya tiene nav key; extender mismo namespace sin duplicarlo.

## Errores comunes que NO cometer

1. No crear tabla/tipo de tarjeta paralelo.
2. No almacenar debt/available/utilization.
3. No crear account/details/debt con requests separados.
4. No dejar POST accounts crear credit_card incompleta.
5. No ocultar legacy incomplete.
6. No consultar accounts table desde credit-cards.
7. No hacer N getAccountBalance al listar.
8. No bloquear limit menor a debt.
9. No cobrar management fee automáticamente.
10. No duplicar forms de movements.
11. No abrir dialog infinitamente por search params.
12. No limpiar create param con push repetido/effect sin guard.
13. No permitir acciones financieras en archived.
14. No archivar con debt o credit balance.
15. No borrar details al archivar.
16. No mostrar datos sensibles/ficticios.
17. No calcular money en componentes.
18. No mostrar errores técnicos.
19. No marcar QA sólo por ver UI; verificar DB/red/consola.
20. No dejar dev servers iniciados por el ejecutor después del QA.

## Criterios de aceptación

### Backend

- [ ] No hay migración/schema nuevo.
- [ ] Open aggregate es atómico.
- [ ] Generic accounts rechaza credit_card.
- [ ] List maneja active/archived/incomplete sin N+1 balances.
- [ ] Update account/details es atómico.
- [ ] GET archived y PUT active-only correctos.
- [ ] Derivados debt/credit balance/available/utilization correctos.
- [ ] Expense/payment/overpayment reflejados.
- [ ] Archive/restore conserva details/history.
- [ ] Scoping y errores estables.
- [ ] Tests pasan.

### Frontend

- [ ] `/credit-cards` completa y responsive.
- [ ] Crear realmente persiste aggregate/debt.
- [ ] Completar legacy funciona.
- [ ] Edit realmente persiste account/details.
- [ ] Purchase/payment/advance/fee reutilizan movements y persisten.
- [ ] Adjust/archive/restore persisten.
- [ ] Historial filtra card.
- [ ] Search/filter/sort/empty states.
- [ ] No loops por query params/revalidation.
- [ ] Consola sin errores/hydration/unhandled.
- [ ] Red sin 4xx/5xx inesperados ni requests repetitivos.
- [ ] i18n/dark/mobile/accessibility.

### Automatizados

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

## QA manual profundo en navegador integrado de Codex

Este QA es obligatorio y debe probar persistencia real, no sólo apariencia. Usar navegador integrado de Codex (`iab`) y revisar estado visible, consola y requests. No sustituir por Chrome externo o Playwright standalone.

### 1. Entorno y procesos

Usar:

```text
URL: http://localhost:3001
Email: prueba@gmail.com
Contraseña: 123456789
```

1. levantar `docker compose up -d postgres backend`;
2. esperar health/migrations;
3. iniciar `pnpm dev` en frontend en sesión persistente;
4. anotar qué procesos/sesiones inició el ejecutor;
5. abrir in-app browser, login/register si falta;
6. crear sufijo `QA-CC-<fecha-hora>`;
7. no borrar volumen DB.

Al terminar, detener sólo frontend/backend/postgres iniciados por el ejecutor: enviar Ctrl-C a la sesión frontend y `docker compose stop backend postgres`. No usar `down -v`. Si servicios ya estaban activos antes del QA, no detenerlos; registrar esa condición.

### 2. Observación de consola/red

Antes de flujos:

- leer la documentación del navegador integrado y habilitar explícitamente observación de consola y red;
- abrir/capturar consola del navegador;
- registrar baseline de errores existentes;
- observar requests relevantes y status;
- limpiar/establecer cursor de observación para atribuir nuevos errores.

Si no es posible inspeccionar consola **y** red desde el navegador integrado, el QA queda bloqueado y no se puede marcar el spec como completo. No afirmar “sin errores” basándose sólo en que la pantalla renderiza; logs del backend complementan pero no reemplazan la consola del navegador.

Después de cada bloque mayor:

- no debe haber `console.error`, hydration mismatch, unhandled rejection, duplicate key, controlled/uncontrolled warning;
- no debe haber 4xx/5xx inesperado;
- errores de validación intencionales pueden producir 400, pero UI debe manejarlos sin console error;
- esperar al menos 5 segundos idle y confirmar que no se repite indefinidamente GET/RSC/action;
- abrir/cerrar dialog y navegar atrás para detectar reapertura/loop;
- comprobar que botones salen de pending y vuelven a habilitarse.

Un loop, request repetitivo o pending permanente es FAIL aunque los datos terminen guardados.

### 3. Verificación SQL read-only

Después de acciones clave, consultar PostgreSQL desde terminal sin modificar filas, salvo la única fixture legacy controlada descrita más adelante. Adaptar usuario/db a `.env`; ejemplo dev:

```bash
docker compose exec -T postgres psql -U app -d app
```

Queries de referencia:

```sql
SELECT a.id, a.name, a.type, a.currency_code, a.institution, a.archived,
       c.credit_limit, c.cut_day, c.payment_due_day, c.management_fee,
       c.updated_at
FROM accounts a
JOIN "user" u ON u.id = a.user_id
LEFT JOIN credit_card_details c ON c.account_id = a.id
WHERE u.email = 'prueba@gmail.com'
  AND a.name LIKE 'QA-CC-%'
ORDER BY a.created_at;

SELECT m.id, m.account_id, m.type, m.amount, m.category_id,
       m.transfer_id, m.description, m.occurred_at
FROM movements m
JOIN accounts a ON a.id = m.account_id
JOIN "user" u ON u.id = a.user_id
WHERE u.email = 'prueba@gmail.com'
  AND a.name LIKE 'QA-CC-%'
ORDER BY m.created_at;
```

Balance SQL de comprobación:

```sql
SELECT m.account_id,
       SUM(CASE
         WHEN m.type IN ('income','transfer_in','adjustment_in') THEN m.amount
         ELSE -m.amount
       END) AS balance
FROM movements m
WHERE m.account_id = '<CARD_ID>'
GROUP BY m.account_id;
```

No imprimir session/token/password. Capturas SQL pueden mostrar ids/montos de QA.

#### Única fixture controlada para tarjeta legacy

Para probar “Completar configuración” en navegador hace falta una cuenta antigua sin details, estado que la API nueva ya no permite crear. Preparar exactamente una fixture con nombre único antes de ese flujo:

```sql
INSERT INTO accounts (
  user_id, name, type, currency_code, institution
)
SELECT id,
       'QA-CC-Legacy-<SUFIJO>',
       'credit_card',
       'COP',
       'Banco legacy'
FROM "user"
WHERE email = 'prueba@gmail.com'
RETURNING id;
```

Esta es la única escritura SQL manual permitida en QA. No insertar details: la UI debe hacerlo. No ejecutar UPDATE/DELETE manual y no usar esta excepción para simular compras, pagos, edición, archivo o restore.

### 4. Matriz obligatoria

Registrar `ID | acción UI | esperado UI | request/status | verificación DB | consola | PASS/FAIL | evidencia`.

#### Acceso/estado inicial

- **CC-QA-001:** login y sidebar→Tarjetas; ruta activa, no 404.
- **CC-QA-002:** empty/active/archived states correctos.
- **CC-QA-003:** consola/red estable 5s sin loop al cargar.

#### Crear de verdad

- **CC-QA-010:** cancelar create con campos llenos; DB sin fila.
- **CC-QA-011:** validaciones nombre/límite/días/montos; dialog queda abierto.
- **CC-QA-012:** crear `QA-CC-Visa-<sufijo>` COP con limit8M, debt1.2M, fee35k, días15/30.
- **CC-QA-013:** verificar POST único 201, no secuencia account/details desde browser.
- **CC-QA-014:** SQL: exactamente una account credit_card, un details, un adjustment_out deuda inicial.
- **CC-QA-015:** UI deuda1.2M/disponible6.8M/utilization15%, fechas/fee correctos.
- **CC-QA-016:** reload y logout/login: card persiste.
- **CC-QA-017:** crear segunda `QA-CC-Master-<sufijo>` sin debt/fee; SQL sin opening movement.
- **CC-QA-018:** duplicar nombre; error UI y SQL sin account/details orphan extra.
- **CC-QA-019:** consola/red estables, sin doble submit.

#### Editar/completar

- **CC-QA-019A:** insertar la única fixture legacy controlada y recargar cards.
- **CC-QA-019B:** UI muestra panel Configuración incompleta, sin romper las demás cards.
- **CC-QA-019C:** completar desde UI límite/días/cuota; request 200 y SQL details_count1.
- **CC-QA-019D:** reload confirma que ahora es panel configurado normal.
- **CC-QA-020:** cancelar edit; SQL unchanged.
- **CC-QA-021:** editar name/institution/limit/days/fee; PATCH 200.
- **CC-QA-022:** SQL confirma account + details y updated_at nuevo.
- **CC-QA-023:** reload confirma display.
- **CC-QA-024:** reducir limit debajo de debt: warning, permitido, utilization>100/available0.
- **CC-QA-025:** restaurar limit mayor para continuar.
- **CC-QA-026:** error name conflict rollback: details no cambian.

#### Compra/gasto real

- **CC-QA-030:** CTA compra navega movements y abre expense una vez prefilled.
- **CC-QA-031:** cerrar sin guardar limpia create param y no reabre.
- **CC-QA-032:** registrar compra `QA compra <sufijo>` con categoría/subcategoría, monto500k.
- **CC-QA-033:** request 201, regreso/card refresh muestra debt +500k y available reducido.
- **CC-QA-034:** SQL confirma expense exacto, account/category/description/date/source.
- **CC-QA-035:** historial card muestra compra una vez.
- **CC-QA-036:** refresh/back no reabre dialog ni duplica expense.

#### Cuota de manejo real

- **CC-QA-040:** CTA cuota prellena amount35k, category Comisiones, description.
- **CC-QA-041:** confirmar y verificar expense SQL/category UUID estable.
- **CC-QA-042:** debt aumenta35k y operación aparece una vez.

#### Pago parcial/total/sobrepago

- **CC-QA-050:** preparar cuenta bancaria COP con saldo suficiente desde Accounts.
- **CC-QA-051:** CTA pagar abre transfer una vez con toAccount card.
- **CC-QA-052:** pago parcial; preview correcto y SQL transfer_out/in group.
- **CC-QA-053:** card debt disminuye exactamente; source balance también.
- **CC-QA-054:** pagar resto; card debt0/available full.
- **CC-QA-055:** sobrepagar100k; debt0, creditBalance100k, available limit+100k.
- **CC-QA-056:** SQL balance positivo coincide UI.
- **CC-QA-057:** volver a cero mediante ajuste o gasto controlado para archive posterior.

#### Avance con comisiones

- **CC-QA-060:** CTA avance abre transfer con fromAccount card.
- **CC-QA-061:** destino bank, monto400k, comisión adicional origen15k y destino5k.
- **CC-QA-062:** preview muestra debit card415k/net bank395k.
- **CC-QA-063:** confirmar; SQL grupo incluye out/in y dos expenses en lados correctos.
- **CC-QA-064:** card debt aumenta415k; bank net aumenta395k.
- **CC-QA-065:** detalle/history agrupa una operación, fees no sueltas.

#### Ajustar saldo

- **CC-QA-070:** corregir a deuda200k; SQL adjustment y UI debt200k.
- **CC-QA-071:** corregir a mismo valor produce error conocido, no fila nueva.
- **CC-QA-072:** corregir a saldo a favor50k; UI/SQL correctos.
- **CC-QA-073:** corregir a cero para lifecycle.

#### Archivo/restauración

- **CC-QA-080:** desde balance cero registrar gasto pequeño, intentar archive con debt: bloqueado; ajustar de nuevo a cero.
- **CC-QA-081:** ajustar a saldo a favor pequeño, intentar archive: bloqueado; ajustar de nuevo a cero.
- **CC-QA-082:** balance cero archive 204; SQL archived=true, details/movements existen.
- **CC-QA-083:** archived tab muestra card; sólo history/restore.
- **CC-QA-084:** restore; SQL false, configuración/deuda/history conservados.
- **CC-QA-085:** reload confirma.

#### Filtros/visual/accesibilidad

- **CC-QA-090:** búsqueda name/institution, currency, sort, limpiar/no results.
- **CC-QA-091:** desktop1440×900, tablet768×1024, mobile390×844 sin overflow.
- **CC-QA-092:** light/dark panels/progress/dialogs legibles.
- **CC-QA-093:** es/en completo; datos no traducidos.
- **CC-QA-094:** teclado, foco, Escape, aria-live.
- **CC-QA-095:** long names/institution y utilization>100 no rompen layout.

#### Consola/red/loops/regresión final

- **CC-QA-100:** inspeccionar consola final: cero errores nuevos relevantes.
- **CC-QA-101:** inspeccionar requests: cero 5xx y cero repetición infinita.
- **CC-QA-102:** cada action termina pending y no duplica rows.
- **CC-QA-103:** `/accounts`, `/categories`, `/movements`, `/dashboard` cargan.
- **CC-QA-104:** navegación back/forward entre cards/movements no reabre dialogs.
- **CC-QA-105:** SQL uniqueness por suffix y ningún card QA sin details.

Query final integridad:

```sql
SELECT a.id, a.name,
       COUNT(DISTINCT c.account_id) AS details_count,
       COUNT(DISTINCT m.id) AS movement_count
FROM accounts a
JOIN "user" u ON u.id = a.user_id
LEFT JOIN credit_card_details c ON c.account_id = a.id
LEFT JOIN movements m ON m.account_id = a.id
WHERE u.email = 'prueba@gmail.com'
  AND a.name LIKE 'QA-CC-%'
GROUP BY a.id, a.name
ORDER BY a.name;
```

Cada card creada por QA debe tener `details_count=1`; movimiento count coincide con acciones confirmadas. Revisar además que no existan dos accounts con el mismo nombre activo.

### 5. Evidencia y corrección

Capturas mínimas:

- create form;
- panel después de creación;
- panel con deuda/uso;
- purchase/payment preview;
- avance con fees/desglose;
- archived;
- mobile dark;
- SQL de integridad sin secretos.

Si falla UI, persistencia, consola o red:

1. marcar FAIL;
2. diagnosticar con consola/logs/DB;
3. corregir implementación;
4. ejecutar tests afectados;
5. repetir flujo completo que produjo el fallo;
6. repetir regresiones relacionadas;
7. actualizar evidencia a PASS.

No aceptar “se ve bien” sin row DB, request/status y balance. No marcar spec completo con casos omitidos.

La entrega del ejecutor debe incluir:

- matriz completa CC-QA con todos los estados PASS/FAIL;
- sufijo e ids de cards/accounts/transfers creados;
- capturas enlazadas mediante rutas absolutas;
- resumen de consola con baseline y estado final;
- requests/status relevantes y confirmación de ausencia de loops;
- resultados SQL que prueban account/details/movements/transfers;
- bugs encontrados, fix aplicado y casos repetidos;
- resultados de test/typecheck/lint/build;
- procesos iniciados y teardown realizado.

### 6. Teardown

Después de evidencia:

1. anotar ids/sufijo y estado final;
2. conservar datos QA (no hard delete);
3. cerrar tabs de prueba si corresponde;
4. detener sesión frontend iniciada por el ejecutor con Ctrl-C;
5. detener sólo servicios compose iniciados por el ejecutor, sin borrar volumes;
6. comprobar que no queda proceso `next dev` iniciado por esta ejecución;
7. reportar explícitamente teardown realizado o por qué servicios se dejaron activos.

## Al completar

1. Cambiar estado a `✅ completado — YYYY-MM-DD`.
2. Actualizar `docs/DATABASE.md` con aggregate/lifecycle, sin duplicar schema.
3. Confirmar que no se generó migración.
4. Entregar resultados automatizados y matriz CC-QA completa.
5. Incluir consola/red/SQL y teardown en reporte.
6. No completar con orphans, loops, pending infinito, duplicados o procesos olvidados.
