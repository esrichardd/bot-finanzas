# ADR-005: Modelar criptoactivos como monedas

- Estado: Aceptado
- Fecha de registro: 2026-08-23

## Contexto

Las cuentas denominadas en BTC, ETH, SOL o USDT necesitan el mismo historial de
ingresos, gastos y transferencias que las cuentas fiat.

## Decisión

Usar `currencies.kind = 'crypto'` y representar cada tenencia como una cuenta
denominada en una sola moneda. Un intercambio entre monedas es una
transferencia FX.

## Consecuencias

- No existe un ledger separado para criptoactivos.
- Una plataforma con varias monedas se representa mediante varias cuentas.
- `accounts.institution` permite agrupar visualmente cuentas de una misma
  plataforma.
- Los montos mantienen el límite de decimales configurado para cada moneda.

## Evidencia

- `backend/src/modules/accounts/accounts.schema.ts`
- `backend/src/infra/db/migrations/0008_seed-crypto-currencies.sql`
- `backend/src/modules/movements/movements.service.ts`
- `docs/DATABASE.md`
