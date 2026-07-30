# Backend

API Fastify + agente de IA del sistema. Las reglas de diseño viven en `../ARCHITECTURE.md` (normativo); este README solo cubre cómo trabajar con el código.

## Correr

**Con Docker (recomendado):** desde la raíz del repo, `docker compose up`. Hot reload incluido (monta `src/`).

**Sin Docker:** requiere Node 22+ y un Postgres accesible.

```bash
npm install
# descomentar DATABASE_URL en el .env de la raíz (apunta a localhost)
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
  agent/          # (futuro) Agent Core, capabilities, prompts
  channels/       # (futuro) adapters de entrada del agente (whatsapp, web)
  infra/          # adapters de salida: db (Drizzle), ai, messaging, auth
  jobs/           # (futuro) crons
  shared/         # errores de dominio, helpers componibles
```

Estructura interna de cada módulo: `<nombre>.routes.ts`, `<nombre>.service.ts`, `<nombre>.schema.ts`, `<nombre>.types.ts`, `<nombre>.test.ts`. Ver ARCHITECTURE.md §2.

## Crear un feature

Seguir el checklist de ARCHITECTURE.md §8. Resumen: módulo con estructura estándar → schema + migración → servicio con la lógica y errores de dominio → rutas delgadas con validación → capability si el bot lo usa → tests de servicio y capability.

## Reglas que más se olvidan

- Toda query se scopea por `userId` (helper de scoping).
- Cero `process.env` fuera de `config/`.
- Rutas sin lógica de negocio; lógica de cálculo como funciones puras.
- Nunca mockear Drizzle en tests; solo se mockean adapters de infra.
- Nueva env var = schema Zod en `config/env.ts` + `.env.example` de la raíz, siempre juntos.
