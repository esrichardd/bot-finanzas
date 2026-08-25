# ADR-004: Modelar una tarjeta de crédito como una cuenta

- Estado: Aceptado
- Fecha de registro: 2026-08-23

## Contexto

Una tarjeta comparte con las demás cuentas el ledger, la moneda, el historial y
las transferencias, pero agrega cupo, fechas de corte y pago, y cuota de manejo.

## Decisión

Representar la tarjeta con `accounts.type = 'credit_card'` y extenderla mediante
una relación 1:1 en `credit_card_details`.

## Consecuencias

- Compras y cuotas registradas son gastos de la cuenta-tarjeta.
- Un pago es una transferencia hacia esa cuenta.
- Deuda, saldo a favor, cupo disponible y utilización se derivan del balance.
- La creación completa de cuenta, detalles y deuda inicial es transaccional.
- Archivar exige balance cero y conserva todo el historial.

## Evidencia

- `backend/src/modules/accounts/accounts.schema.ts`
- `backend/src/modules/credit-cards/credit-cards.schema.ts`
- `backend/src/modules/credit-cards/credit-cards.service.ts`
- `backend/src/modules/credit-cards/credit-cards.calc.ts`
- `docs/DATABASE.md`
