# frontend/ARCHITECTURE.md

Documento normativo del frontend. Toda modificación DEBE seguir estas reglas.
Complementa al `ARCHITECTURE.md` de la raíz; ante conflicto, gana el de la
raíz. Describe exclusivamente la implementación actual.

## 1. Stack

| Pieza      | Elección                                             | Nota                                                                         |
| ---------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Framework  | Next.js 16 + React 19 + TypeScript strict            | App Router; Server Components por defecto                                    |
| Mutaciones | Server Actions + `revalidatePath`/`revalidateTag`    | SIN React Query, SWR ni store global de datos de servidor                    |
| UI         | Tailwind + shadcn/ui                                 | shadcn se copia a `components/ui/` — esa carpeta ES la capa de encapsulación |
| Auth       | Cliente de Better Auth (mismo origen)                | `src/proxy.ts` protege rutas privadas                                        |
| i18n       | next-intl, es/en, SIN routing por locale             | Locale = preferencia del usuario (cookie, default es). Ver reglas 11–12      |
| API        | Cliente propio tipado en `lib/api/`                  | Único lugar con fetch al backend                                             |
| Dinero     | `lib/money.ts`                                       | Único lugar que convierte unidades mínimas ↔ display                         |
| Testing    | Vitest para lógica pura de `lib/`                    | `money.test.ts` cubre formateo y parsing                                     |
| Deploy     | Contenedor en el compose de la raíz, detrás de Caddy | Mismo origen que el backend: `/api/*` → backend, resto → frontend            |

## 2. Estilo arquitectónico: server-first

El server de Next y la API viven en el mismo VPS (latencia ~0 entre ellos). Por lo tanto:

1. **Lecturas = Server Components.** Los datos se traen en el servidor vía `lib/api/`, reenviando la cookie de sesión. Una pantalla que necesita N recursos hace N fetches **en paralelo** (`Promise.all`) en el servidor — Next es el BFF; no se crean endpoints por-pantalla en el backend (las composiciones del backend son por concepto de dominio, no por UI).
2. **Mutaciones = Server Actions** que llaman a `lib/api/` y revalidan (`revalidatePath`). El estado del servidor vive en el servidor; el ciclo mutar→revalidar reemplaza el cache de cliente.
3. **Client components solo para interactividad real**: formularios,
   buscadores, filtros, menús y diálogos. `"use client"` es la excepción
   marcada, no el default. Un componente que solo muestra datos no es cliente.

## 3. Estructura

```
frontend/src/
  app/                    # rutas: layout y composición SOLAMENTE. Cero lógica (espejo de la regla 1 del backend)
  features/               # vertical slices por dominio de negocio
    accounts/
    movements/
    categories/
    credit-cards/
      components/         # UI del feature
      actions.ts          # server actions del feature (mutaciones)
      queries.ts          # lecturas para server components
  lib/
    api/                  # cliente del backend, un archivo por módulo de API (accounts.ts, movements.ts...)
    money.ts              # formateo/parseo de dinero
    auth.ts               # cliente Better Auth + helpers de sesión
  components/
    ui/                   # shadcn/ui copiado (la capa de encapsulación de UI)
    shared/               # componentes propios genéricos reutilizados por 2+ features
```

Crecimiento: mismo criterio que el backend — plano hasta que duela; un componente usado por un solo feature vive en ese feature, se promueve a `components/shared/` solo con 2+ consumidores.

## 4. Reglas

1. **`app/` no contiene lógica**: las pages componen features y layouts. Fetch, transformación o condicionales de negocio en una page = anti-patrón.
2. **`lib/api/` es la única puerta al backend.** Ningún componente, action o query hace `fetch` directo. El cliente: funciones tipadas por módulo, base URL desde env, reenvío de cookies en server-side, y traducción de errores HTTP a errores tipados del frontend (401 → redirect a login; 400 → mensaje de validación; resto → error genérico).
3. **`lib/money.ts` es el único lugar con aritmética/formateo de dinero.** La API habla unidades mínimas enteras; el display usa `Intl.NumberFormat` + los `decimals` de la moneda (de `/api/currencies`); el input del usuario se parsea de vuelta a enteros ahí mismo. Un componente que multiplica o divide montos = anti-patrón.
4. **Las features solo importan UI de `components/ui/` o `components/shared/`** — nunca de Radix ni de librerías de UI directamente. Cambiar de sistema de UI debe tocar solo `components/ui/`.
5. **Formularios**: validación con Zod en el cliente para UX, PERO la validación autoritativa es la del backend — el frontend muestra los errores 400 de la API, no los reemplaza. No duplicar reglas de negocio en el cliente.
6. **Auth**: `src/proxy.ts` redirige rutas privadas sin sesión a `/login`.
   Los Server Components y Server Actions reenvían la cookie en cada llamada a
   la API. No mantener estado manual de autenticación.
7. **Tipos de la API**: viven en los archivos por módulo de `lib/api/` y
   reflejan las respuestas del backend. No duplicarlos dentro de features o
   componentes.
8. **Nada de estado global de datos de servidor** (Redux, Zustand, Context con datos de la API). Estado de cliente permitido: UI efímera (modales, tabs) con `useState` local.
9. **Theming vía tokens semánticos de shadcn.** Colores SIEMPRE con las clases semánticas (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`...) — nunca colores literales de Tailwind (`bg-white`, `text-gray-900`) ni hex en features. Dark mode con `next-themes` (clase en `<html>`); un componente escrito con tokens funciona en ambos modos sin tocarlo. Los colores de las categorías (vienen de la API) son la excepción: son datos, se aplican como style inline.
10. **Loading y error son archivos de ruta, no estado de componente.** Estados de carga: `loading.tsx` por ruta y `<Suspense>` con el `<Skeleton>` de shadcn para streaming parcial. Errores: `error.tsx` por ruta (el error handler global del frontend) y `notFound()` para 404s. Prohibido: spinners o flags de carga con `useState` en client components para datos que vienen del servidor.

11. **Internacionalización es/en con next-intl y sin routing por locale.** No
    hay rutas `/es/...` ni segmento `[locale]`. El idioma se guarda en cookie y
    el valor predeterminado es `es`. Todo string visible usa `t()`; los mensajes
    viven en `messages/es.json` y `messages/en.json` con las mismas keys; moneda
    y fecha reciben el locale activo.
12. **Límites conocidos de i18n (no resolver, no "mejorar"):** los datos NO se traducen — las categorías del sistema están sembradas en español y así se muestran en ambos idiomas (traducir datos de seed es otro proyecto). Los mensajes de error de la API son técnicos en inglés y NO son copy de UI: el frontend traduce los casos conocidos con mensajes propios y nunca muestra el texto crudo de la API.

## 4.1 Límites vigentes

- **Routing por locale** (`/es/...`): no — el idioma es preferencia, no URL (regla 11).
- **Traducción de datos** (categorías del sistema, contenido de DB): no — límite conocido (regla 12).

## 5. El frontend es un cliente delgado

El frontend contiene presentación y orquestación de llamadas. Las reglas de
negocio y composiciones persistentes viven en el backend. Una feature no debe
compensar huecos de la API calculando balances, permisos o invariantes de
dominio en el navegador.

## 6. Anti-patrones prohibidos

- `fetch` fuera de `lib/api/`.
- Aritmética o formateo de dinero fuera de `lib/money.ts`.
- `"use client"` en componentes que solo muestran datos.
- React Query / SWR / stores de datos de servidor.
- Endpoints por-pantalla en el backend (pedirlos o crearlos).
- Importar Radix u otra librería de UI desde features.
- Reglas de negocio duplicadas en el cliente (la API es la autoridad).
- Lógica en `app/`.
- Colores literales de Tailwind o hex en features (tokens semánticos siempre).
- Spinners/flags de carga manuales para datos de servidor (loading.tsx + Suspense).
- Strings visibles al usuario hardcodeados en componentes (todo vía `t()` — regla 11).
- Mostrar mensajes de error crudos de la API como copy de UI (regla 12).
- Rutas con prefijo de locale o segmento `[locale]` (el idioma es preferencia, no URL).

## 7. Checklist para crear una feature nueva

1. Si faltan datos o composiciones, modificar primero el backend; el frontend
   no compensa huecos de la API con lógica de negocio propia.
2. Funciones de lectura en `features/<x>/queries.ts` usando `lib/api/`.
3. Server components en `app/` componiendo el feature; fetches paralelos.
4. Mutaciones como server actions en `features/<x>/actions.ts` + revalidación.
5. UI con `components/ui/`; montos siempre vía `lib/money.ts`.
6. Interactividad real → client component aislado y pequeño dentro del feature.
7. Nunca: fetch suelto, dinero a mano, lógica en pages, estado global de servidor.
