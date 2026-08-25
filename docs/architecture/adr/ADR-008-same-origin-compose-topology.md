# ADR-008: Servir frontend y API bajo el mismo origen

- Estado: Aceptado
- Fecha de registro: 2026-08-23

## Contexto

Frontend, autenticación y API necesitan compartir cookies sin exponer los
puertos internos de los contenedores ni mantener una configuración CORS
separada.

## Decisión

Usar Caddy como única entrada en producción. Caddy enruta `/api/*` y `/health`
al backend y las demás rutas al frontend. En desarrollo, Next.js reescribe
`/api/*` hacia el backend local.

Producción usa una red `internal` para PostgreSQL y una red `web` para backend,
frontend y Caddy. El backend participa en ambas.

## Consecuencias

- El navegador usa un solo dominio para páginas, auth y API.
- Solo Caddy publica `80` y `443`.
- PostgreSQL no publica `5432` en producción.
- Backend y frontend no publican sus puertos al host.
- Las cookies de sesión funcionan bajo el mismo origen.

## Evidencia

- `caddy/Caddyfile`
- `docker-compose.prod.yml`
- `frontend/next.config.ts`
- `docs/operations/infrastructure.md`
