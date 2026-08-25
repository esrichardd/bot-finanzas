# ADR-001: Representar dinero como enteros en unidades mínimas

- Estado: Aceptado
- Fecha de registro: 2026-08-23

## Contexto

Los montos financieros deben conservar exactitud durante persistencia,
cálculos, transferencias y presentación. Los números de punto flotante pueden
introducir errores de redondeo y distintas monedas usan cantidades diferentes
de decimales.

## Decisión

Persistir y transportar cada monto como un entero positivo en unidades mínimas.
La moneda declara cuántos decimales usa y el tipo del movimiento determina el
signo económico.

## Consecuencias

- PostgreSQL usa `bigint` para montos.
- La API intercambia unidades mínimas, no valores decimales de display.
- El backend calcula con enteros.
- `frontend/src/lib/money.ts` concentra parsing y presentación.
- Cada cuenta pertenece a una única moneda.

## Evidencia

- `backend/src/modules/movements/movements.schema.ts`
- `backend/src/modules/accounts/accounts.schema.ts`
- `frontend/src/lib/money.ts`
- `docs/DATABASE.md`
