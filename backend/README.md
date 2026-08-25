# Backend

API Fastify del sistema de finanzas personales. Usa Drizzle, PostgreSQL y
Better Auth. Los límites globales viven en `../ARCHITECTURE.md` y las reglas
específicas del backend en `ARCHITECTURE.md`.

## Correr

**Con Docker (recomendado):** desde la raíz del repo, `docker compose up`. Hot reload incluido (monta `src/`).

**Sin Docker:** requiere Node 22+ y un Postgres accesible.

```bash
npm install
# agregar DATABASE_URL=postgres://app:app@localhost:5432/app al .env de la raíz
npm run dev
```

## Scripts

| Script                | Qué hace                                                                        |
| --------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`         | Servidor con hot reload (tsx watch)                                             |
| `npm run build`       | Compila TS a `dist/`                                                            |
| `npm start`           | Corre el build (prod)                                                           |
| `npm run db:generate` | Genera migración desde cambios en el schema Drizzle                             |
| `npm run db:migrate`  | Aplica migraciones pendientes                                                   |
| `npm test`            | Tests (Vitest; los de integración levantan Postgres efímero vía Testcontainers) |
| `npm run typecheck`   | `tsc --noEmit` en strict                                                        |

## Estructura

```
src/
  index.ts        # entrypoint
  config/         # env vars validadas con Zod (único lugar con process.env)
  http/           # server Fastify + error handler global
  modules/        # dominios de negocio (vertical slices) — health/ es la plantilla de referencia
  infra/          # autenticación y acceso a PostgreSQL
  shared/         # errores de dominio, helpers componibles
```

Estructura interna de cada módulo: `<nombre>.routes.ts`,
`<nombre>.service.ts`, `<nombre>.schema.ts`, `<nombre>.types.ts` y
`<nombre>.test.ts`. Ver `backend/ARCHITECTURE.md` §3.

## Crear un feature

Seguir el checklist de `backend/ARCHITECTURE.md` §9: módulo de dominio, schema y
migración cuando corresponda, servicio con lógica de negocio, rutas delgadas y
tests unitarios o de integración.

## Reglas que más se olvidan

- Toda query se scopea por `userId` (helper de scoping).
- Cero `process.env` fuera de `config/`.
- Rutas sin lógica de negocio; lógica de cálculo como funciones puras.
- Nunca mockear Drizzle ni PostgreSQL; los tests persistentes usan una base real
  efímera mediante Testcontainers.
- Nueva env var = schema Zod en `config/env.ts` + `.env.example` de la raíz, siempre juntos.
