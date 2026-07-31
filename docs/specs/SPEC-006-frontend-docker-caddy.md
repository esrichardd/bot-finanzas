# SPEC-006: Frontend en Docker + Caddy

Estado: 🔲 pendiente

Ejecutar cumpliendo `ARCHITECTURE.md` (raíz) y `frontend/ARCHITECTURE.md`. Alcance de infraestructura: NO se escribe ninguna pantalla, feature ni lógica de frontend — solo containerización y routing de mismo origen.

## Prerequisitos (verificar antes de empezar; si alguno falla, DETENERSE y reportar)

- El backend sirve bajo `/api/*` con `/health` sin prefijo (refactor previo ya aplicado).
- Existe `frontend/` con el scaffold de create-next-app (App Router, `src/`, Tailwind, shadcn) y `pnpm-lock.yaml`. **NO regenerar ni reconfigurar el scaffold** — solo los archivos que este spec indica.
- Gestores por app: frontend = pnpm (vía corepack), backend = npm. No cambiar ninguno.

## Objetivo

(a) El compose de **prod** levanta el sistema completo tras Caddy en un solo origen: `/api/*` y `/health` → backend, todo lo demás → frontend. (b) En **dev**, el frontend corre en el host con `pnpm dev` proxeando `/api/*` al backend dockerizado (rewrites), sin CORS y sin tocar el compose de dev.

## Paso 1 — `next.config.ts`: standalone + proxy de dev

Modificar el `next.config.ts` del scaffold (solo agregar; no quitar lo que exista):

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autocontenido para Docker: .next/standalone con server.js propio.
  output: "standalone",
  // SOLO en dev: el frontend corre en el host (:3001) y proxea la API al
  // backend dockerizado (:3000) → mismo origen, cookies fluyen, cero CORS.
  // En prod este rewrite no aplica: Caddy hace el routing.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const backend = process.env.BACKEND_URL ?? "http://localhost:3000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
```

Y en `frontend/package.json`, fijar el puerto de dev: `"dev": "next dev -p 3001"` (el 3000 lo publica el backend en dev).

## Paso 2 — `frontend/Dockerfile`

Crear (multi-stage, standalone, non-root — espejo del patrón del backend):

```dockerfile
FROM node:22-slim AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Crear también `frontend/.dockerignore`: `node_modules`, `.next`, `.env*`.

Nota: el output standalone genera su propio `server.js` con las deps mínimas embebidas — por eso el runtime NO copia `node_modules` ni corre pnpm.

## Paso 3 — Caddy

Crear **`caddy/Caddyfile`** en la raíz del repo:

```
{$DOMAIN:localhost} {
	handle /api/* {
		reverse_proxy backend:3000
	}
	handle /health {
		reverse_proxy backend:3000
	}
	handle {
		reverse_proxy frontend:3000
	}
}
```

Comportamiento: con `DOMAIN` sin definir sirve `localhost` (HTTP local con TLS interno automático de Caddy para localhost); en el VPS, `DOMAIN=finanzas.tudominio.com` en el `.env` y Caddy emite el certificado de Let's Encrypt solo. `/health` se enruta al backend explícitamente (lo consume el monitor externo de uptime).

## Paso 4 — `docker-compose.prod.yml`

Agregar dos servicios y publicar puertos SOLO en Caddy:

```yaml
frontend:
  build:
    context: ./frontend
  environment:
    # Fetches server-side del frontend van directo al backend por la red interna del compose.
    BACKEND_URL: http://backend:3000
  restart: unless-stopped
  networks:
    - web
  depends_on:
    - backend

caddy:
  image: caddy:2
  restart: unless-stopped
  ports:
    - "80:80"
    - "443:443"
  environment:
    DOMAIN: ${DOMAIN:-localhost}
  volumes:
    - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
    - caddy_data:/data
    - caddy_config:/config
  networks:
    - web
  depends_on:
    - backend
    - frontend
```

Agregar `caddy_data` y `caddy_config` a `volumes:`. **Verificar/ajustar:** el backend ya NO debe publicar puertos en prod (si tuviera alguno, quitarlo — solo Caddy expone). Backend sigue en `internal` + `web`; frontend y caddy solo en `web`; postgres solo en `internal`.

Agregar a `.env.example`:

```bash
# Prod: dominio para Caddy (sin definir = localhost). En el VPS: finanzas.tudominio.com
# DOMAIN=
```

Nota para prod real (documentar, no aplicar aún): cuando exista dominio, `BETTER_AUTH_URL` del `.env` del VPS pasa a `https://<dominio>`.

## Paso 5 — Compose de dev: NO tocar

El `docker-compose.yml` de dev queda exactamente como está (postgres + backend). El frontend en dev corre en el host: `cd frontend && pnpm dev` → `http://localhost:3001`, con la API proxeada por el rewrite del Paso 1. No agregar el frontend ni Caddy al compose de dev.

## Paso 6 — Documentación

- `frontend/README.md` (crear, breve): cómo correr en dev (`pnpm dev` en :3001 con el backend dockerizado arriba), cómo se buildea para prod (Dockerfile standalone), y el mapa de origen (dev: rewrite; prod: Caddy).
- `README.md` de la raíz: actualizar la sección de producción con Caddy y la variable `DOMAIN`.

## Errores comunes que NO cometer

- Meter el frontend o Caddy al compose de DEV (dev del frontend es en el host).
- Copiar `node_modules` al runtime del Dockerfile (standalone no los necesita).
- Publicar puertos del backend o frontend en prod (solo Caddy: 80/443).
- Poner el frontend en la red `internal` (no habla con postgres; solo `web`).
- Hardcodear el dominio en el Caddyfile (va por env `DOMAIN` con default localhost).
- Configurar CORS en el backend "por si acaso" (mismo origen en ambos mundos = no hay CORS).
- Escribir pantallas, i18n, theming o lib/api (eso es el spec siguiente).

## Criterios de aceptación

### Dev (el flujo diario)

```bash
docker compose up -d                 # backend + postgres como siempre
cd frontend && pnpm dev              # frontend en :3001
# Verificar:
curl -s localhost:3001               # → HTML del scaffold de Next
curl -si localhost:3001/api/auth/get-session   # → respuesta del BACKEND vía rewrite (no 404 de Next)
```

- [ ] El scaffold responde en :3001 y `/api/*` llega al backend a través del rewrite.

### Prod (simulado en local)

```bash
docker compose -f docker-compose.prod.yml up --build -d
curl -sk https://localhost/health              # → 200 del backend vía Caddy
curl -sk https://localhost/                    # → HTML de Next vía Caddy
curl -sik https://localhost/api/categories     # → 401 del backend (auth requerida): routing correcto
docker compose -f docker-compose.prod.yml ps   # → ningún puerto publicado salvo caddy 80/443
```

- [ ] Los cuatro checks pasan (el `-k` es por el certificado interno de localhost; con dominio real no hará falta).

### Generales

- [ ] `docker compose -f docker-compose.prod.yml config` valida sin errores; redes correctas (postgres solo internal, frontend/caddy solo web).
- [ ] El compose de dev quedó intacto; nada del backend se modificó.
- [ ] READMEs actualizados.

## Al completar

**NO ejecutar `git commit` ni ningún comando de git.** Reportar: resumen, archivos creados/modificados, resultado de los checks de aceptación, desviaciones justificadas, y el **mensaje de commit recomendado** (base sugerida: `chore(infra): frontend container and caddy reverse proxy`, con `SPEC-006` en el cuerpo). El commit lo hace el humano.
