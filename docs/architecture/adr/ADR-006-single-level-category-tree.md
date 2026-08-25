# ADR-006: Usar una tabla de categorías con un nivel de jerarquía

- Estado: Aceptado
- Fecha de registro: 2026-08-23

## Contexto

Los movimientos pueden clasificarse con categorías globales del sistema o con
categorías propias. La interfaz necesita raíces y subcategorías sin convertir
la navegación en un árbol arbitrariamente profundo.

## Decisión

Usar una única tabla `categories` con `parent_id` autorreferencial. El servicio
permite como máximo un nivel de hijos. `user_id = NULL` identifica categorías
del sistema y un `user_id` identifica categorías propias.

## Consecuencias

- Una consulta combina categorías del sistema con las del usuario autenticado.
- Las categorías del sistema son visibles para todos y no son editables.
- El servicio impide un tercer nivel y valida ownership.
- Categorías con historial se archivan en lugar de borrarse.
- Nombre, descripción, color y emoji viven en la misma entidad.

## Evidencia

- `backend/src/modules/categories/categories.schema.ts`
- `backend/src/modules/categories/categories.service.ts`
- `backend/src/infra/db/migrations/0003_seed-system-categories.sql`
- `docs/DATABASE.md`
