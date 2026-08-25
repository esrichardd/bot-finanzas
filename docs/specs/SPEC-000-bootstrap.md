# SPEC-000: Bootstrap del proyecto

**Estado: ✅ completado — 2026-07-30**

Plan de inicialización. Ejecutar cumpliendo `ARCHITECTURE.md` y
`backend/ARCHITECTURE.md`.

## Objetivo

Dejar el proyecto corriendo end-to-end con `docker compose up`: backend Fastify + Postgres, con un endpoint `GET /health` que verifica la conexión a la DB. Nada más.

## Alcance

**Incluye:** estructura base del repo, TypeScript, Fastify, Drizzle conectado a Postgres, config validada, error handler global, logging, Docker (dev y prod), una migración inicial vacía, test del health check.

**Fuera del alcance de este bootstrap:** módulos de dominio, auth, backups
externos, Caddy y frontend. Esas piezas se implementaron en specs separados.

## Stack a instalar

- Node 22 LTS, TypeScript strict, `tsx` para dev
- `fastify`, `zod`, `pino` (incluido en Fastify)
- `drizzle-orm`, `drizzle-kit`, `postgres` (driver postgres-js)
- `vitest` + `testcontainers` (dev)

## Estructura a crear

Layout monorepo: **la raíz orquesta (compose, env, docs), cada app es autocontenida en su carpeta**. Sin package.json ni workspaces en la raíz (no hay código compartido todavía).

```
finanzas-personales-con-ia/
  ARCHITECTURE.md
  CLAUDE.md                   # instrucciones para herramientas de desarrollo
  docker-compose.yml          # dev: postgres + backend con hot reload
  docker-compose.prod.yml     # prod: build de imagen, restart policy, healthcheck
  .env.example                # TODAS las vars del sistema; el compose las inyecta a los servicios; .env en .gitignore
  .gitignore
  docs/
    specs/
      SPEC-000-bootstrap.md   # este archivo
  backend/                    # proyecto Fastify autocontenido (build context del compose: ./backend)
    Dockerfile                # multi-stage: build TS → imagen slim de runtime
    package.json
    tsconfig.json
    drizzle.config.ts
    src/
      index.ts                # entrypoint: carga config → crea server → listen
      config/
        env.ts                # Zod schema de env vars; process.env SOLO aquí; falla al arranque si inválido
      http/
        server.ts             # buildServer(): instancia Fastify, registra plugins, rutas, error handler
        error-handler.ts      # handler global: errores de dominio → HTTP; inesperados → 500 + log
      shared/
        errors.ts             # AppError base + NotFoundError, ValidationError
      infra/
        db/
          client.ts           # cliente Drizzle (postgres-js), pool
          schema.ts           # schema raíz, reexporta schemas de módulos
          migrations/         # generadas por drizzle-kit
      modules/
        health/
          health.routes.ts    # GET /health → llama al servicio, 200 o 503
          health.service.ts   # checkHealth(): SELECT 1 contra la DB, devuelve { status, checks: { db } }
          health.test.ts      # integration test contra Postgres real (Testcontainers)
```

Este spec se limita al backend y no modifica `frontend/`.

Nota: health se implementa como módulo estándar aunque sea trivial y sirve de
referencia del patrón `routes → service` usado por los demás módulos.

## Variables de entorno (`.env.example`)

```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://app:app@localhost:5432/app
LOG_LEVEL=info
```

Regla: agregar una var = agregarla al schema Zod en `config/env.ts` Y a `.env.example`. Sin excepciones.

## Docker

**`docker-compose.yml` (dev):**

- `postgres:17` (versión mayor pineada), volumen nombrado, **sin `ports:` publicado salvo `127.0.0.1:5432:5432` para tooling local** (drizzle-kit studio, psql).
- `backend`: monta `src/`, corre `tsx watch`, depende de postgres con `condition: service_healthy`.
- Healthcheck de postgres: `pg_isready`.

**`docker-compose.prod.yml`:**

- Postgres SOLO en red interna, cero puertos al host (regla de ARCHITECTURE.md).
- Backend: imagen del Dockerfile, `restart: unless-stopped`, healthcheck con `wget -q -O- http://localhost:3000/health`.
- Migraciones se aplican al arranque del backend (script de entrypoint: `drizzle-kit migrate` → `node dist/index.js`).

**`Dockerfile`:** multi-stage — stage build (deps + `tsc`), stage runtime (`node:22-slim`, solo `dist/` + prod deps + carpeta de migraciones). Usuario no-root.

## Endpoint `/health`

- `200 { status: "ok", checks: { db: "ok" } }` cuando el `SELECT 1` responde.
- `503 { status: "degraded", checks: { db: "error" } }` cuando la DB no responde (capturar el error, no crashear).
- Timeout del check de DB: 2s (un health check colgado es peor que uno que falla).
- Sin auth (lo consumirán Docker y el monitor externo).

## Scripts de `backend/package.json`

(Se ejecutan desde `backend/`; el compose de la raíz los invoca en los contenedores.)

```
dev            → tsx watch src/index.ts
build          → tsc
start          → node dist/index.js
db:generate    → drizzle-kit generate
db:migrate     → drizzle-kit migrate
test           → vitest run
typecheck      → tsc --noEmit
```

## Orden de ejecución sugerido

1. Repo: package.json, tsconfig (strict), .gitignore, .env.example.
2. `config/env.ts` con validación Zod.
3. `shared/errors.ts` y `http/error-handler.ts`.
4. `infra/db/`: cliente Drizzle + drizzle.config.ts + migración inicial.
5. Módulo `health` (routes + service).
6. `http/server.ts` + `index.ts`: componer todo.
7. Docker: compose dev primero, verificar hot reload; luego Dockerfile + compose prod.
8. Test de health con Testcontainers.

## Criterios de aceptación

- [x] `docker compose up` desde la raíz levanta todo desde cero (repo clonado + `.env` copiado) sin pasos manuales extra.
- [x] `curl localhost:3000/health` → 200 con `db: "ok"`.
- [x] Detener el contenedor de postgres → `/health` responde 503 (no crashea, no cuelga).
- [x] `cd backend && npm test` pasa (health integration test) sin depender del compose levantado.
- [x] `cd backend && npm run typecheck` limpio en strict.
- [x] En prod compose, postgres no publica ningún puerto al host.
- [x] No existe ningún `process.env` fuera de `backend/src/config/env.ts`.

> Nota: la suite de integración requiere que Docker Desktop esté iniciado para ejecutar Testcontainers.
