# SPEC-001: Autenticación con Better Auth

Estado: ✅ completado — 2026-07-30

Ejecutar cumpliendo `ARCHITECTURE.md` y `backend/ARCHITECTURE.md`. Este spec
incluye snippets que reflejan su momento de implementación; ante una
contradicción, prevalecen las arquitecturas vigentes.

## Objetivo

Autenticación email/password con Better Auth: tablas de auth en el mismo Postgres vía Drizzle, endpoints de auth montados en Fastify, un preHandler `requireAuth` reutilizable, un endpoint protegido `GET /me`, y el helper de scoping por usuario en `shared/`. Los módulos de dominio usan esta identidad y su scoping.

## Alcance

**Incluye:** Better Auth + drizzle adapter, schema de auth generado con la CLI, montaje del handler en Fastify, decorador `requireAuth`, `GET /me`, helper de scoping, tests de integración.

**NO incluye (no agregar "de paso"):** OAuth/social login, 2FA, CORS (llega con el spec del frontend), verificación de email, reset de password, rate limiting, ningún módulo de dominio.

## Dependencias

```bash
cd backend
npm install better-auth @better-auth/drizzle-adapter
```

Nota: el adapter de Drizzle vive en el paquete `@better-auth/drizzle-adapter` (en versiones viejas era `better-auth/adapters/drizzle`; NO usar esa ruta).

## Paso 1 — Variables de entorno

**`backend/src/config/env.ts`** — agregar al schema Zod existente:

```typescript
BETTER_AUTH_SECRET: z.string().min(32),
BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
```

**`.env.example` (raíz)** — agregar:

```bash
# Auth
BETTER_AUTH_SECRET=change-me-generate-with-openssl-rand-base64-32
BETTER_AUTH_URL=http://localhost:3000
```

Regla recordada: nueva env var = schema Zod + `.env.example`, siempre juntos. Ningún `process.env` fuera de `config/env.ts`.

Verificación: arrancar sin `BETTER_AUTH_SECRET` en el `.env` → el proceso falla al inicio con mensaje claro.

## Paso 2 — Instancia de Better Auth (`infra/auth/`)

**`backend/src/infra/auth/auth.ts`** (nuevo):

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { Database } from "../db/client.js";
import type { Env } from "../../config/env.js";

export function createAuth(db: Database, env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg" }),
    emailAndPassword: { enabled: true },
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

Notas para el implementador:

- Factory (`createAuth`), NO singleton a nivel de módulo: sigue el patrón de DI de `createDb`/`buildServer` y permite inyectar la DB de Testcontainers en tests.
- No agregar plugins ni opciones extra: el alcance es email/password.

## Paso 3 — Schema de auth con la CLI

Better Auth define sus propias tablas (`user`, `session`, `account`, `verification`). NO escribirlas a mano: se generan con la CLI para que coincidan exactamente con la versión instalada.

1. Crear **`backend/src/infra/auth/cli-config.ts`** (solo lo usa la CLI, no se importa desde la app):

```typescript
// Config exclusiva para `npx @better-auth/cli generate`.
// La CLI solo INTROSPECCIONA la forma del config para generar el schema de
// tablas: nunca se conecta a la DB ni usa estos valores. Por eso son dummies
// fijos a propósito — la generación debe ser determinista y funcionar en
// cualquier máquina sin .env ni entorno válido. NO importar config/env.ts
// aquí ni leer process.env (regla 5 de backend/ARCHITECTURE.md).
import { createDb } from "../db/client.js";
import { createAuth } from "./auth.js";

const { db } = createDb(
  "postgres://cli:cli@localhost:5432/cli-generation-only",
);

export const auth = createAuth(db, {
  NODE_ENV: "development",
  PORT: 3000,
  LOG_LEVEL: "info",
  DATABASE_URL: "postgres://cli:cli@localhost:5432/cli-generation-only",
  BETTER_AUTH_SECRET: "cli-generation-only-secret-32-chars!!",
  BETTER_AUTH_URL: "http://localhost:3000",
});
```

2. Generar el schema:

```bash
cd backend
npx @better-auth/cli@latest generate --config src/infra/auth/cli-config.ts --output src/infra/auth/auth.schema.ts
```

3. Re-exportar en el schema raíz — **`backend/src/infra/db/schema.ts`**:

```typescript
export * from "../auth/auth.schema.js";
```

4. Generar y aplicar la migración con el flujo normal:

```bash
npm run db:generate
npm run db:migrate
```

Verificación: la migración crea las tablas `user`, `session`, `account`, `verification` (nombres exactos pueden variar levemente según versión — confiar en lo que genere la CLI, no en esta lista).

## Paso 4 — Montar los endpoints de auth en Fastify

Better Auth expone un handler estilo Web API (`Request` → `Response`); hay que puentearlo con Fastify. Crear **`backend/src/infra/auth/auth.routes.ts`**:

```typescript
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Auth } from "./auth.js";

export function toWebHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(
      key,
      Array.isArray(value) ? value.join(", ") : value.toString(),
    );
  }
  return headers;
}

export async function authRoutes(
  app: FastifyInstance,
  opts: { auth: Auth },
): Promise<void> {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const webRequest = new Request(url.toString(), {
        method: request.method,
        headers: toWebHeaders(request),
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      const response = await opts.auth.handler(webRequest);

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      reply.send(response.body ? await response.text() : null);
    },
  });
}
```

Notas:

- Se monta con `app.register(authRoutes, { auth })` (regla 12 de
  `backend/ARCHITECTURE.md`) — el registro real ocurre en el Paso 6.
- Esta ruta NO usa el type provider de Zod: el contrato de estos endpoints lo define Better Auth, no nosotros. Es la excepción documentada a la regla 11.
- No agregar try/catch aquí: los errores los maneja el error handler global.

## Paso 5 — `requireAuth` (preHandler) y tipado de `request.user`

Crear **`backend/src/infra/auth/require-auth.ts`**:

```typescript
import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import type { Auth } from "./auth.js";
import { toWebHeaders } from "./auth.routes.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export function buildRequireAuth(auth: Auth): preHandlerHookHandler {
  return async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const session = await auth.api.getSession({
      headers: toWebHeaders(request),
    });

    if (!session) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
  };
}
```

Notas:

- El `declare module` amplía el tipo de `FastifyRequest` una sola vez, aquí. No repetirlo en otros archivos.
- Las rutas protegidas usarán `preHandler: requireAuth` y leerán `request.user.id`. Este `id` es EL `userId` de todo el sistema — la fuente del scoping (regla 9).

## Paso 6 — Integración en `http/server.ts`

Modificar `buildServer` para crear el auth y registrar todo. Cambios sobre el archivo existente:

```typescript
// imports nuevos
import { createAuth, type Auth } from "../infra/auth/auth.js";
import { authRoutes } from "../infra/auth/auth.routes.js";
import { buildRequireAuth } from "../infra/auth/require-auth.js";
import { usersRoutes } from "../modules/users/users.routes.js";

export function buildServer({
  env,
  db,
  closeDb,
}: ServerDependencies): FastifyInstance {
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  // request.user existe en todo request; requireAuth lo puebla
  app.decorateRequest("user", null);

  const auth = createAuth(db, env);
  const requireAuth = buildRequireAuth(auth);

  app.register(healthRoutes, { db });
  app.register(authRoutes, { auth });
  app.register(usersRoutes, { requireAuth });

  if (closeDb) {
    app.addHook("onClose", closeDb);
  }

  return app;
}
```

Notas:

- `decorateRequest("user", null)` es obligatorio antes de que cualquier hook asigne `request.user` (requisito de Fastify para no romper la shape optimization de V8).
- `createServer` no cambia.

## Paso 7 — Módulo `users` con el endpoint protegido `GET /me`

El dominio es `users` (crecerá con preferencias y configuración); `/me` es solo la ruta REST para "el usuario autenticado". Crear **`backend/src/modules/users/users.routes.ts`**:

```typescript
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { preHandlerHookHandler } from "fastify";
import { z } from "zod";

const meResponse = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});

export async function usersRoutes(
  app: FastifyInstance,
  opts: { requireAuth: preHandlerHookHandler },
): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/me",
    {
      preHandler: opts.requireAuth,
      schema: { response: { 200: meResponse } },
    },
    async (request) => {
      // requireAuth garantiza user !== null en este punto
      return request.user!;
    },
  );
}
```

Este módulo es la plantilla de referencia de ruta protegida para los demás módulos.

**Ownership (importante):** las tablas `user`/`session`/`account`/`verification` las posee `infra/auth/` (las genera Better Auth); el módulo `users` NO las escribe ni les agrega columnas. La identidad se lee vía `request.user`. Este spec no crea tablas adicionales para `users`.

## Paso 8 — Helper de scoping en `shared/`

Crear **`backend/src/shared/db-helpers.ts`**:

```typescript
import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { NotFoundError } from "./errors.js";

/**
 * Combina la condición de ownership con condiciones extra.
 * TODA query a datos de negocio debe usarlo (regla 8 de backend/ARCHITECTURE.md).
 * Uso: db.select().from(accounts).where(ownedBy(accounts.userId, userId, eq(accounts.id, id)))
 */
export function ownedBy(
  userIdColumn: PgColumn,
  userId: string,
  ...conditions: (SQL | undefined)[]
): SQL {
  const combined = and(eq(userIdColumn, userId), ...conditions);
  if (!combined) {
    throw new Error("ownedBy: no conditions produced");
  }
  return combined;
}

/** Lanza NotFoundError si el resultado es undefined/null. */
export function orThrow<T>(value: T | undefined | null, entity: string): T {
  if (value === undefined || value === null) {
    throw new NotFoundError(entity);
  }
  return value;
}
```

Nota: `NotFoundError` debe existir en `shared/errors.ts` desde SPEC-000; si su constructor no acepta un string de entidad, ajustar la llamada, no el error. Este helper aún no tiene consumidores de negocio — su primer uso real llega en SPEC-002; los tests unitarios de abajo lo cubren mientras tanto.

## Paso 9 — Tests

**`backend/src/infra/auth/auth.test.ts`** — integración con Testcontainers (mismo patrón que `health.test.ts`):

Casos obligatorios, en este orden dentro de una suite que levanta un Postgres efímero, aplica migraciones y hace `buildServer`:

1. `GET /me` sin cookie → **401**.
2. `POST /api/auth/sign-up/email` con `{ email, password, name }` → **200/201** y header `set-cookie` presente.
3. `GET /me` con la cookie del paso 2 → **200** con `{ id, email, name }` y el email correcto.
4. `POST /api/auth/sign-in/email` con credenciales incorrectas → **401** (o el código de error que devuelva Better Auth; verificar y fijar en el test).
5. `POST /api/auth/sign-out` con la cookie válida → luego `GET /me` con esa misma cookie → **401** (la sesión invalidada no da acceso).

Esqueleto del flujo con `app.inject` (no levantar puerto real):

```typescript
const signUp = await app.inject({
  method: "POST",
  url: "/api/auth/sign-up/email",
  payload: { email: "test@test.com", password: "password1234", name: "Test" },
});
const cookie = signUp.headers["set-cookie"];

const me = await app.inject({
  method: "GET",
  url: "/me",
  headers: { cookie: Array.isArray(cookie) ? cookie.join("; ") : cookie! },
});
```

**`backend/src/shared/db-helpers.test.ts`** — unit tests puros de `orThrow` (devuelve el valor / lanza `NotFoundError`) y de que `ownedBy` produce SQL que incluye ambas condiciones.

## Errores comunes que NO cometer

- Escribir las tablas de auth a mano en vez de generarlas con la CLI.
- Importar el adapter desde `better-auth/adapters/drizzle` (ruta vieja) en vez de `@better-auth/drizzle-adapter`.
- Crear el auth como singleton importado en vez de factory inyectada.
- Olvidar `app.decorateRequest("user", null)` antes de usar `request.user`.
- Imports relativos sin extensión `.js`.
- Validar con Zod la respuesta de `getSession` (salida de librería confiable tipada — regla 12).
- Agregar CORS, OAuth o features fuera de alcance.

## Criterios de aceptación

### Flujo E2E completo (ejecutar en orden, con el compose levantado)

Cada paso indica el resultado esperado. Ejecutar como script y verificar cada expectativa; si el ejecutor no puede correr comandos, dejar el script listo y reportarlo para ejecución manual.

```bash
BASE=http://localhost:3000

# 1. Registro → 200, body con el usuario, y Set-Cookie presente (guarda sesión)
curl -i -X POST $BASE/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -c cookies.txt \
  -d '{"email":"e2e@test.com","password":"password1234","name":"E2E"}'

# 2. Logout de esa sesión inicial → 200 (para probar el sign-in limpio)
curl -i -X POST $BASE/api/auth/sign-out -b cookies.txt -c cookies.txt

# 3. Sign-in → 200 y nueva cookie de sesión
curl -i -X POST $BASE/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -c cookies.txt \
  -d '{"email":"e2e@test.com","password":"password1234"}'

# 4. getSession → 200 con { session, user } (user.email = e2e@test.com)
curl -i $BASE/api/auth/get-session -b cookies.txt

# 5. GET /me → 200 con { id, email, name } (email = e2e@test.com)
curl -i $BASE/me -b cookies.txt

# 6. Logout → 200 (invalida la sesión)
curl -i -X POST $BASE/api/auth/sign-out -b cookies.txt -c cookies.txt

# 7. GET /me con la cookie ya invalidada → 401 { "error": "UNAUTHORIZED" }
curl -i $BASE/me -b cookies.txt

# 8. getSession tras logout → sesión nula (200 con body null/vacío o 401, según versión de Better Auth; lo obligatorio es que NO devuelva la sesión)
curl -i $BASE/api/auth/get-session -b cookies.txt

rm -f cookies.txt
```

Checklist del flujo:

- [x] Paso 1: 200 + `Set-Cookie`.
- [x] Paso 3: 200 + `Set-Cookie` (sign-in funciona tras logout).
- [x] Paso 4: 200 con la sesión y el usuario correctos.
- [x] Paso 5: 200 con `{ id, email, name }` correctos.
- [x] Paso 6: logout responde éxito.
- [x] Paso 7: **401** — la cookie invalidada NO da acceso a `/me`.
- [x] Paso 8: la sesión NO se devuelve tras el logout.

### Criterios generales

- [x] Arrancar sin `BETTER_AUTH_SECRET` → falla al inicio con mensaje claro.
- [x] Las tablas de auth existen vía migración Drizzle versionada (no `push`, no SQL manual).
- [x] `npm test` pasa (auth integration + db-helpers unit) y `npm run typecheck` limpio.
- [x] `/health` sigue respondiendo 200 (no se rompió nada del SPEC-000).
- [x] Cero `process.env` fuera de `config/env.ts`; cero JSON Schema a mano; rutas montadas con `app.register`.

## Al completar

Marcar `Estado: ✅ completado <fecha>`, tildar los checkboxes, y commitear según `docs/COMMITS.md` (sugerencia: `feat(auth): better auth with email/password and protected routes` + `test(auth): ...`, con `SPEC-001` en el cuerpo).
