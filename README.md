# Finanzas Personales

Aplicación web personal para administrar cuentas, categorías, ingresos, gastos,
transferencias con comisiones y tarjetas de crédito. Incluye autenticación,
interfaz en español e inglés, temas claro/oscuro y balances derivados del ledger.

## Estructura

```
docker-compose.yml        # dev: postgres + backend con hot reload
docker-compose.prod.yml   # prod: frontend + backend detrás de Caddy
backend/                  # API Fastify + Drizzle + Better Auth
  ARCHITECTURE.md         # reglas normativas específicas del backend
frontend/                 # Next.js App Router (ver frontend/README.md)
  ARCHITECTURE.md         # reglas normativas específicas del frontend
caddy/                    # reverse proxy HTTPS y routing de mismo origen
docs/
  architecture/adr/       # decisiones arquitectónicas aceptadas
  COMMITS.md              # convención de commits
  DATABASE.md             # referencia del modelo de datos vigente
  operations/             # runbooks de producción separados por responsabilidad
  specs/                  # historial de unidades de trabajo implementadas
ARCHITECTURE.md           # documento normativo del sistema
CLAUDE.md                 # instrucciones para herramientas de desarrollo
```

## Quick start

Requisitos: Docker + Docker Compose.

```bash
cp .env.example .env
docker compose up -d
curl localhost:3000/health   # → 200 { "status": "ok", "checks": { "db": "ok" } }
```

`cp` crea la configuración local, `docker compose up -d` levanta PostgreSQL y
el backend en segundo plano, y `curl` verifica la API y su conexión a la base de
datos. Postgres queda accesible para tooling local en `127.0.0.1:5432`.

En otra terminal, iniciar el frontend:

```bash
cd frontend
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`cd` entra a la aplicación Next.js, `corepack` habilita la versión de pnpm
declarada por el proyecto, `pnpm install` instala exactamente el lockfile y
`pnpm dev` sirve la web en `http://localhost:3001`.

## Producción

Producción se despliega automáticamente con GitHub Actions después de que los
checks de backend y frontend pasan en `main`. El procedimiento completo, junto
con el fallback manual, vive en `docs/operations/deployment.md`.

El entorno requiere `.env` con credenciales reales; Compose falla si falta una
variable obligatoria. Caddy es el único servicio que publica puertos (`80` y
`443`); PostgreSQL, backend y frontend permanecen dentro de las redes Docker.

`DOMAIN` controla el dominio de Caddy y por defecto es `localhost` para uso local.
En el VPS, definir `DOMAIN=finanzas.tudominio.com` en `.env`; Caddy gestionará
el certificado de Let's Encrypt automáticamente. Para producción real, ajustar
también `BETTER_AUTH_URL=https://<dominio>` en ese `.env`.

## Documentación

- **`ARCHITECTURE.md`** — arquitectura global: componentes, límites, invariantes, runtime y flujos de producción.
- **`backend/ARCHITECTURE.md`** — estructura modular y reglas normativas específicas de Fastify, Drizzle, autenticación y testing.
- **`frontend/ARCHITECTURE.md`** — reglas normativas específicas del frontend.
- **`docs/README.md`** — índice completo de documentación.
- **`docs/DATABASE.md`** — referencia vigente de entidades y relaciones.
- **`docs/architecture/adr/README.md`** — índice de decisiones arquitectónicas aceptadas.
- **`docs/operations/README.md`** — índice de infraestructura, despliegue, backups, monitoreo, seguridad y recuperación.
- **`docs/specs/README.md`** — alcance histórico de los specs y fuentes vigentes.
- **`docs/COMMITS.md`** — formato de commits (Conventional Commits recortado, en inglés).

## Flujo de trabajo

1. Definir el trabajo en un `docs/specs/SPEC-XXX-*.md`.
2. Ejecutar el spec cumpliendo `ARCHITECTURE.md` y la arquitectura específica
   de cada aplicación afectada.
3. Verificar los criterios de aceptación del spec.
4. Marcar el spec como completado (línea de estado en el propio archivo).
