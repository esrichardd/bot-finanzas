# Frontend

Frontend Next.js con App Router, ejecutado desde `frontend/`.
Los límites globales están en `../ARCHITECTURE.md` y las reglas específicas en
`frontend/ARCHITECTURE.md`.

## Desarrollo

Con Postgres y backend levantados desde la raíz:

```bash
docker compose up -d
cd frontend
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`docker compose up -d` levanta PostgreSQL y backend, `cd` entra al frontend,
`corepack enable` habilita pnpm, `pnpm install` instala el lockfile y `pnpm dev`
inicia Next. La aplicación queda en `http://localhost:3001`. En desarrollo,
Next reescribe `/api/*` hacia el backend dockerizado en
`http://localhost:3000`; el navegador mantiene un mismo origen y no requiere
CORS.

## Producción

El `Dockerfile` usa el output standalone de Next.js. El compose de producción
ejecuta el contenedor detrás de Caddy; Caddy enruta `/api/*` y `/health` al
backend y todo lo demás al frontend.

```bash
cd ..
docker compose -f docker-compose.prod.yml up --build -d
```

`cd ..` vuelve a la raíz del repositorio, donde se encuentra el archivo de
Compose. En producción normal, GitHub Actions ejecuta este proceso de forma
automática según `docs/operations/deployment.md`.
