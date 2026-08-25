# ADR-007: Aplicar cuadre doble solo a transferencias

- Estado: Aceptado
- Fecha de registro: 2026-08-23

## Contexto

La aplicación necesita integridad al mover dinero entre cuentas, pero su modelo
es de finanzas personales y no un libro contable general con cuentas nominales
de ingreso, gasto, patrimonio y contrapartida.

## Decisión

Registrar ingresos y gastos como movimientos simples. Exigir un grupo cuadrado
y atómico únicamente cuando una operación transfiere valor entre cuentas.

## Consecuencias

- Los ingresos y gastos conservan un modelo directo para la interfaz.
- Las transferencias siempre registran las dos cuentas afectadas.
- Las comisiones forman parte del mismo grupo transaccional.
- No se crean asientos débito/crédito adicionales para movimientos simples.

## Evidencia

- `backend/src/modules/movements/movements.schema.ts`
- `backend/src/modules/movements/movements.service.ts`
- `docs/DATABASE.md`
