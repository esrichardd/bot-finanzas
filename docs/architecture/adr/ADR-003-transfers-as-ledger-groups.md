# ADR-003: Representar transferencias como grupos del ledger

- Estado: Aceptado
- Fecha de registro: 2026-08-23

## Contexto

Una transferencia afecta por lo menos dos cuentas y puede incluir conversión
de moneda y varias comisiones en origen o destino. Cada afectación debe formar
parte del historial y del balance de su propia cuenta.

## Decisión

Crear una fila en `transfers` y enlazarle movimientos de salida, entrada y
comisiones mediante `transfer_id`. Todas las filas se crean dentro de una misma
transacción de PostgreSQL.

## Consecuencias

- Los balances continúan siendo sumas de movimientos.
- Las comisiones son gastos consultables del ledger.
- En FX se guardan ambos montos reales y la tasa se deriva.
- `/api/ledger` agrupa las filas antes de filtrar y paginar para presentar una
  sola operación lógica.
- Eliminar una transferencia elimina el grupo completo de forma controlada.

## Evidencia

- `backend/src/modules/movements/movements.schema.ts`
- `backend/src/modules/movements/movements.service.ts`
- `backend/src/modules/movements/movements.calc.ts`
- `docs/DATABASE.md`
