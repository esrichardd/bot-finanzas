# Finanzas Personales con IA

Sistema personal de control de ingresos y egresos: cuentas, movimientos y comisiones, con un agente de IA accesible por WhatsApp y web para consultar información, registrar gastos en lenguaje natural y recibir resúmenes semanales.

## Estructura

```
docker-compose.yml        # dev: postgres + backend con hot reload
docker-compose.prod.yml   # prod: red interna, healthchecks, restart policies
backend/                  # API Fastify + agente (ver backend/README.md)
frontend/                 # (futuro) Next.js
docs/
  COMMITS.md              # convención de commits
  specs/                  # specs de trabajo, numerados (SPEC-000, SPEC-001...)
ARCHITECTURE.md           # documento normativo del sistema
CLAUDE.md                 # índice de cumplimiento para agentes de IA
```

## Quick start

Requisitos: Docker + Docker Compose.

```bash
cp .env.example .env
docker compose up
curl localhost:3000/health   # → 200 { "status": "ok", "checks": { "db": "ok" } }
```

Postgres queda accesible para tooling local en `127.0.0.1:5432` (solo en dev).

## Producción

```bash
docker compose -f docker-compose.prod.yml up -d
```

Requiere `.env` con credenciales reales (el compose falla si falta alguna variable). En prod, Postgres no publica ningún puerto al host.

## Documentación

- **`ARCHITECTURE.md`** — la ley del proyecto: stack, estructura, capas, agente, testing, observabilidad. Leerlo antes de tocar código.
- **`docs/specs/`** — cada unidad de trabajo se define en un spec numerado con alcance y criterios de aceptación.
- **`docs/COMMITS.md`** — formato de commits (Conventional Commits recortado, en inglés).

## Flujo de trabajo con IA

1. Definir el trabajo en un `docs/specs/SPEC-XXX-*.md`.
2. Pedir al agente: _"ejecuta docs/specs/SPEC-XXX cumpliendo ARCHITECTURE.md"_.
3. Verificar los criterios de aceptación del spec.
4. Marcar el spec como completado (línea de estado en el propio archivo).
