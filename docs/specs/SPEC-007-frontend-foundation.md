# SPEC-007: Fundación del frontend

Estado: ✅ completado y testeado

Ejecutar cumpliendo `frontend/ARCHITECTURE.md` (normativo del frontend) y `ARCHITECTURE.md` de la raíz. Los snippets son la implementación de referencia — ante duda con la versión instalada de una librería (especialmente next-intl), consultar su documentación oficial en vez de forzar el snippet, y reportar la diferencia.

## Prerequisitos (verificar; si falla alguno, DETENERSE y reportar)

- SPEC-006 completado: rewrites de dev funcionando (`/api/*` en :3001 llega al backend).
- Fix de `BETTER_AUTH_TRUSTED_ORIGINS` aplicado en el backend y `http://localhost:3001` presente en el `.env`.
- El código del frontend vive en `frontend/src/` (app, components, lib ya movidos).
- **NO regenerar ni reconfigurar el scaffold** (next.config solo se toca donde este spec indica; tsconfig, Tailwind y shadcn quedan como están).

## Objetivo

Montar todo lo transversal del frontend — estructura, cliente de API, dinero, i18n (es/en), theming (light/dark), middleware de auth — y demostrarlo con las pantallas de login y registro más un dashboard placeholder que saluda al usuario autenticado con toggles de idioma y tema.

## Alcance

**Incluye:** estructura de carpetas de la sección 3 del ARCHITECTURE del frontend, `lib/env.ts`, `lib/api/` base, `lib/money.ts` + unit tests (Vitest), next-intl sin routing, next-themes, middleware, feature `auth` (login/registro/logout), dashboard placeholder con header.

**NO incluye (no agregar "de paso"):** pantallas de datos (balances, movimientos, categorías — spec siguiente), forgot password / verificación de email, react-hook-form ni librerías de formularios, React Query/SWR (prohibidos por ARCHITECTURE), avatar/perfil, tests de componentes.

## Paso 1 — Dependencias

```bash
cd frontend
pnpm add next-intl next-themes better-auth
pnpm add -D vitest
pnpm dlx shadcn@latest add button input label card dropdown-menu
```

Agregar script en `frontend/package.json`: `"test": "vitest run"`.

## Paso 2 — Estructura y env

Crear los directorios (con `.gitkeep` si quedan vacíos):

```
src/
  features/auth/{components,actions.ts}
  lib/api/
  components/shared/
  messages/            # es.json, en.json (Paso 4)
  i18n/                # request.ts (Paso 4)
```

Crear **`src/lib/env.ts`** — único lugar del frontend que lee `process.env` (espejo de la regla 6 del backend):

```typescript
// Server-only. BACKEND_URL solo existe/importa en el servidor:
// - dev: el server de Next corre en el host → backend dockerizado en localhost:3000
// - prod: contenedor → http://backend:3000 (inyectado por el compose)
export const serverEnv = {
  BACKEND_URL: process.env.BACKEND_URL ?? "http://localhost:3000",
};
```

## Paso 3 — Cliente de API (`lib/api/`)

Crear **`src/lib/api/client.ts`**:

```typescript
import "server-only";
import { cookies } from "next/headers";
import { serverEnv } from "../env.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

/**
 * Fetch server-side al backend: URL absoluta interna + cookie de sesión reenviada.
 * ÚNICO punto de contacto con la API para server components y server actions.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const cookieStore = await cookies();
  const res = await fetch(`${serverEnv.BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie: cookieStore.toString(),
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
```

Notas:

- `import "server-only"` hace que importar esto desde un client component sea error de build — la protección estructural de la regla 2.
- `cache: "no-store"`: datos financieros siempre frescos; la revalidación la gobiernan las actions, no el cache de fetch.
- El browser NUNCA llama al backend directo salvo auth (Paso 6): las lecturas van por server components y las mutaciones por server actions, ambas vía este cliente.

Crear **`src/lib/api/users.ts`** (primer módulo, patrón para los siguientes):

```typescript
import { apiFetch } from "./client.js";

export interface Me {
  id: string;
  email: string;
  name: string;
}

export function getMe(): Promise<Me> {
  return apiFetch<Me>("/api/me");
}
```

## Paso 4 — i18n: next-intl SIN routing

1. **Plugin** — en `next.config.ts` (conservando lo del SPEC-006):

```typescript
import createNextIntlPlugin from "next-intl/plugin";
const withNextIntl = createNextIntlPlugin();
// ...config existente...
export default withNextIntl(nextConfig);
```

2. **`src/i18n/request.ts`** — el locale sale de una cookie, default `es`:

```typescript
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "locale";

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = raw === "en" ? "en" : "es";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

3. **Mensajes** — `src/messages/es.json` (fuente) y `en.json` (espejo, mismas keys SIEMPRE). Contenido inicial:

```json
{
  "common": {
    "appName": "Finanzas",
    "logout": "Cerrar sesión",
    "language": "Idioma",
    "theme": "Tema",
    "loading": "Cargando..."
  },
  "auth": {
    "loginTitle": "Iniciar sesión",
    "registerTitle": "Crear cuenta",
    "email": "Correo",
    "password": "Contraseña",
    "name": "Nombre",
    "loginButton": "Entrar",
    "registerButton": "Registrarme",
    "noAccount": "¿No tienes cuenta?",
    "hasAccount": "¿Ya tienes cuenta?",
    "errorInvalidCredentials": "Correo o contraseña incorrectos",
    "errorGeneric": "Algo salió mal, intenta de nuevo"
  },
  "dashboard": {
    "greeting": "Hola, {name}"
  }
}
```

(`en.json` con las traducciones equivalentes; ninguna key puede faltar.)

4. **Provider** — en `src/app/layout.tsx`, envolver children con `NextIntlClientProvider` (de `next-intl`), obteniendo locale y messages con `getLocale()`/`getMessages()` de `next-intl/server`, y poner el locale en `<html lang={locale}>`.

Si la API de la versión instalada difiere, seguir la guía oficial "App Router without i18n routing" de next-intl — NO inventar routing por locale.

## Paso 5 — Theming

1. `src/components/shared/theme-provider.tsx`: wrapper client del `ThemeProvider` de next-themes con `attribute="class"`, `defaultTheme="system"`, `enableSystem`.
2. En el root layout: `<html suppressHydrationWarning>` y el provider envolviendo children (junto al de intl).
3. `src/components/shared/theme-toggle.tsx`: client component con `useTheme()` y un dropdown-menu de shadcn (light/dark/system). Solo tokens semánticos — cero colores literales (regla 9).

## Paso 6 — Auth: cliente, middleware y actions

1. **`src/lib/auth.ts`** — cliente de Better Auth para el browser:

```typescript
import { createAuthClient } from "better-auth/react";

// Mismo origen: en dev el rewrite lleva /api/auth al backend; en prod, Caddy.
export const authClient = createAuthClient({ baseURL: "/api/auth" });
```

Nota: verificar en la doc de la versión instalada si `baseURL` relativo requiere ser path (`basePath`) — el requisito funcional es que el browser llame a `/api/auth/*` en su propio origen.

2. **`src/middleware.ts`** — chequeo optimista por cookie (rápido, sin llamar al backend; la validación real la hace el backend en cada request de datos):

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
```

3. **`src/features/auth/actions.ts`** — una server action para el locale (la única mutación no-auth de este spec):

```typescript
"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, LOCALES, type Locale } from "../../i18n/request.js";

export async function setLocale(locale: Locale) {
  if (!LOCALES.includes(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
```

(Login/registro/logout usan `authClient` directo desde el client component — auth es la excepción documentada: su flujo de cookies lo maneja Better Auth browser-side.)

## Paso 7 — Pantallas de login y registro

`src/app/login/page.tsx` y `src/app/register/page.tsx`: pages delgadas que renderizan `<LoginForm />` / `<RegisterForm />` de `features/auth/components/`.

Los forms: client components, controlados con `useState` (sin react-hook-form), usando Card/Input/Label/Button de shadcn y `useTranslations("auth")`. El submit:

```typescript
const { error } = await authClient.signIn.email({ email, password });
if (error) {
  setError(
    error.status === 401 ? t("errorInvalidCredentials") : t("errorGeneric"),
  );
  return;
}
router.push("/");
router.refresh();
```

Registro igual con `authClient.signUp.email({ email, password, name })`. Reglas: errores de la API traducidos con mensajes propios — NUNCA mostrar `error.message` crudo (regla 12); botón con estado disabled/loading durante el submit; links cruzados login↔registro con `next/link`.

## Paso 8 — Dashboard placeholder + header

1. `src/app/page.tsx` — server component:

```typescript
import { getTranslations } from "next-intl/server";
import { getMe } from "../lib/api/users.js";

export default async function DashboardPage() {
  const [t, me] = await Promise.all([getTranslations("dashboard"), getMe()]);
  return <h1 className="text-2xl font-semibold">{t("greeting", { name: me.name })}</h1>;
}
```

(Demuestra el circuito completo: cookie → apiFetch → backend → RSC. El middleware garantiza sesión; si aun así la API diera 401, dejar que el error handler de ruta lo capture — no manejarlo aquí.)

2. `src/components/shared/header.tsx`: nombre de la app, `<LocaleToggle />` (client: dropdown que llama la action `setLocale`), `<ThemeToggle />`, y `<LogoutButton />` (client: `authClient.signOut()` → `router.push("/login")`). El header se monta en el layout de la zona privada — usar un route group `(app)` con su propio layout para no mostrar header en login/register.

3. `src/app/(app)/loading.tsx` con el `<Skeleton />` de shadcn (regla 10 estrenada) y un `error.tsx` mínimo.

## Paso 9 — `lib/money.ts` + unit tests

Crear **`src/lib/money.ts`**:

```typescript
export interface CurrencyInfo {
  code: string;
  decimals: number;
}

/** Unidades mínimas → string para mostrar. Único lugar de formateo de dinero. */
export function formatMoney(
  amountMinor: number,
  currency: CurrencyInfo,
  locale: string,
): string {
  const value = amountMinor / 10 ** currency.decimals;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(value);
  return `${formatted} ${currency.code}`;
}

/**
 * Input humano → unidades mínimas (entero). Acepta "1.234,56" y "1,234.56".
 * Devuelve null si no es parseable o resulta negativo.
 */
export function parseMoney(
  input: string,
  currency: CurrencyInfo,
): number | null {
  const cleaned = input.trim().replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  // El último separador (. o ,) es el decimal; el resto son de miles.
  const lastSep = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  let normalized: string;
  if (lastSep === -1) {
    normalized = cleaned;
  } else {
    const intPart = cleaned.slice(0, lastSep).replace(/[.,]/g, "");
    const decPart = cleaned.slice(lastSep + 1);
    normalized = `${intPart}.${decPart}`;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 10 ** currency.decimals);
}
```

Nota: se usa código de moneda como sufijo, NO `style: "currency"` de Intl — BTC/USDT no son códigos ISO 4217 y reventarían el formatter. Un solo camino para fiat y cripto.

**`src/lib/money.test.ts`** (Vitest) — casos obligatorios: formateo COP/USD con decimals 2 en locale es y en; BTC con decimals 8; parseo "1.234,56" y "1,234.56" → 123456; "500" → 50000; satoshis (decimals 8); entrada basura → null; negativo → null; redondeo de exceso de decimales.

## Errores comunes que NO cometer

- Fetch al backend fuera de `lib/api/` (salvo `authClient`, la excepción documentada).
- `"use client"` en el dashboard o cualquier componente que solo muestra datos.
- Instalar react-hook-form, React Query, SWR o zustand.
- Strings visibles hardcodeados (todo vía `t()`, en ambos JSON).
- Mostrar `error.message` de la API como copy de UI.
- Colores literales de Tailwind (`bg-white`, `text-gray-900`) — solo tokens semánticos.
- Routing por locale o segmento `[locale]`.
- `style: "currency"` en Intl para montos (rompe con cripto).
- Manejar el 401 dentro de cada page (el middleware + error.tsx cubren).

## Criterios de aceptación

### QA de browser (dev: compose arriba + `pnpm dev` en :3001)

1. [ ] Sin sesión, ir a `localhost:3001/` → redirige a `/login`.
2. [ ] Registro de un usuario nuevo → redirige al dashboard → "Hola, {nombre}".
3. [ ] Logout → vuelve a login; ir a `/` de nuevo → redirige a login. Login con credenciales malas → mensaje traducido, no el texto crudo de la API.
4. [ ] Login correcto → dashboard. Con sesión, ir a `/login` → redirige a `/`.
5. [ ] Toggle de idioma → TODA la UI visible cambia es↔en (login, dashboard, header); recargar conserva el idioma (cookie).
6. [ ] Toggle de tema → light/dark sin colores rotos en ninguna pantalla (los tokens funcionan en ambos).
7. [ ] DevTools → Network: ninguna llamada del browser va a `:3000` directo; consola sin errores de CORS ni de hidratación.

### Generales

- [x] `pnpm test` (money), `pnpm lint`, TypeScript y `pnpm build` limpios en frontend.
- [x] `en.json` y `es.json` tienen exactamente las mismas keys.
- [ ] El build de prod sigue funcionando: `docker compose -f docker-compose.prod.yml up --build` sirve el login vía Caddy (verificación rápida, sin repetir todo el QA).
- [x] Nada del backend se modificó.

### Verificación realizada

- Tests unitarios de dinero: 6 casos pasando.
- Smoke test de desarrollo: `/login` responde HTTP 200.
- Se corrigieron las incompatibilidades de `better-auth 1.6.25` con URLs relativas y de `next-themes 0.4.6` con Next 16.2/React 19.
- No se registró evidencia del QA completo con compose, registro/login real,
  toggles y DevTools durante la ejecución de este spec.

## Al completar

**NO ejecutar `git commit` ni ningún comando de git.** Reportar: resumen, archivos creados/modificados, resultado de tests/lint/build, desviaciones justificadas (especialmente si alguna API de next-intl/Better Auth difirió del snippet), y el **mensaje de commit recomendado** (base sugerida: `feat(frontend): foundation with auth screens, i18n and theming`, con `SPEC-007` en el cuerpo). El commit lo hace el humano.
