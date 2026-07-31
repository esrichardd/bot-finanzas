# Frontend

Frontend Next.js con App Router, ejecutado desde `frontend/`.

## Desarrollo

Con Postgres y backend levantados desde la raíz:

```bash
docker compose up -d
cd frontend
pnpm dev
```

La aplicación queda en `http://localhost:3001`. En desarrollo, Next reescribe
`/api/*` hacia el backend dockerizado en `http://localhost:3000`; el navegador
mantiene un mismo origen y no requiere CORS.

## Producción

El `Dockerfile` usa el output standalone de Next.js. El compose de producción
ejecuta el contenedor detrás de Caddy; Caddy enruta `/api/*` y `/health` al
backend y todo lo demás al frontend.

```bash
docker compose -f docker-compose.prod.yml up --build -d
```
