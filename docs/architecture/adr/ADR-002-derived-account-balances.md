# ADR-002: Derivar balances desde movimientos

- Estado: Aceptado
- Fecha de registro: 2026-08-23

## Contexto

Guardar un saldo mutable junto con el historial exige mantener dos fuentes de
verdad sincronizadas ante creaciones, ediciones, eliminaciones, transferencias
y ajustes.

## Decisión

El balance de una cuenta se deriva de la suma firmada de sus movimientos. La
tabla `accounts` no contiene una columna de saldo.

## Consecuencias

- El ledger es la fuente de verdad financiera.
- Un saldo inicial o una corrección se registra como movimiento de ajuste.
- La deuda de una tarjeta se deriva del balance de su cuenta.
- Las operaciones que modifican varias filas deben preservar atomicidad.
- El frontend consume balances calculados por el backend.

## Evidencia

- `backend/src/modules/movements/movements.calc.ts`
- `backend/src/modules/movements/movements.service.ts`
- `backend/src/modules/accounts/account-lifecycle.service.ts`
- `docs/DATABASE.md`
