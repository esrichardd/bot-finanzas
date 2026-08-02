# SPEC-008: Diseño visual — landing, auth y shell del dashboard

Estado: ✅ completado — 2026-08-02

Ejecutar cumpliendo `frontend/ARCHITECTURE.md`. Este spec define una **dirección de arte concreta y cerrada** — no es una invitación a diseñar: los tokens, fuentes y prohibiciones de abajo son normativos. Ante la duda estética, elegir SIEMPRE la opción más sobria.

## Objetivo

(a) Landing pública en `/` con una sección hero y CTAs a login/registro; (b) login y registro re-estilizados; (c) al autenticarse, un **shell de dashboard** en `/dashboard` con sidebar de navegación (colapsable, drawer en móvil) listo para irse llenando. Todo mobile-first, light/dark, y con la identidad visual definida aquí.

## Alcance

**Incluye:** tokens de diseño (paleta + tipografía), reestructura de rutas y middleware (la raíz pasa a ser pública), landing, restyle de auth, sidebar + layout del área privada, i18n de todo lo nuevo.

**NO incluye:** pantallas de datos (spec siguiente), contenido real del dashboard (queda un placeholder dentro del shell), animaciones complejas o librerías de animación, ilustraciones/imágenes stock, más secciones de landing.

## Dirección de arte (normativa)

**Concepto: minimalismo editorial.** Una app financiera personal que parece una publicación bien tipografiada, no un SaaS. Se logra con: neutros cálidos, UN acento verde profundo, títulos en serif, muchísimo aire, bordes hairline, casi nada más.

### Prohibiciones absolutas (los clichés del "dashboard hecho por IA")

- Gradientes violeta/azul, glassmorphism, blur decorativo, glows de neón.
- Sombras dramáticas (`shadow-lg`+); máximo `shadow-sm` y solo en elementos flotantes (drawer, dropdown).
- Emojis como iconografía. Iconos: `lucide-react` (ya viene con shadcn), tamaño 16–20px, stroke fino.
- Cards anidadas en cards; badges de colores por doquier; 3+ colores de acento.
- Texto gris-sobre-gris ilegible: el contraste manda.

### Tokens (Paso 1 los implementa)

- **Neutros cálidos** (familia stone) para fondo/texto/bordes.
- **Acento único**: verde profundo — en light `oklch(0.45 0.09 165)`, en dark `oklch(0.75 0.11 165)`. Se usa con moderación: CTAs primarios, links, el item activo del sidebar, foco. NADA más es verde.
- **Tipografía**: títulos y cifras destacadas en **Instrument Serif** (Google Fonts, weight 400, vía `next/font`); todo lo demás en la sans del scaffold (Geist). La serif es el rasgo identitario — usarla en h1/h2 del landing, títulos de las cards de auth, y el saludo del dashboard.
- **Radios**: `--radius: 0.5rem` — contenidos, no pastilla.
- **Espaciado**: generoso. El landing respira (padding vertical amplio); los forms de auth no se pegan a los bordes.

## Paso 1 — Tokens en `globals.css` y fuentes

1. Reemplazar los valores de las variables de shadcn en `src/app/globals.css` (ambos bloques, `:root` y `.dark`), manteniendo los NOMBRES de las variables intactos (los componentes de shadcn dependen de ellos):

```css
:root {
  --background: oklch(0.985 0.004 85);
  --foreground: oklch(0.22 0.01 85);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.22 0.01 85);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.22 0.01 85);
  --primary: oklch(0.45 0.09 165);
  --primary-foreground: oklch(0.98 0.005 165);
  --secondary: oklch(0.955 0.006 85);
  --secondary-foreground: oklch(0.32 0.01 85);
  --muted: oklch(0.955 0.006 85);
  --muted-foreground: oklch(0.52 0.012 85);
  --accent: oklch(0.94 0.02 165);
  --accent-foreground: oklch(0.35 0.08 165);
  --destructive: oklch(0.55 0.19 25);
  --border: oklch(0.9 0.008 85);
  --input: oklch(0.9 0.008 85);
  --ring: oklch(0.45 0.09 165);
}

.dark {
  --background: oklch(0.185 0.008 85);
  --foreground: oklch(0.92 0.006 85);
  --card: oklch(0.22 0.009 85);
  --card-foreground: oklch(0.92 0.006 85);
  --popover: oklch(0.22 0.009 85);
  --popover-foreground: oklch(0.92 0.006 85);
  --primary: oklch(0.75 0.11 165);
  --primary-foreground: oklch(0.18 0.03 165);
  --secondary: oklch(0.26 0.01 85);
  --secondary-foreground: oklch(0.85 0.008 85);
  --muted: oklch(0.26 0.01 85);
  --muted-foreground: oklch(0.62 0.012 85);
  --accent: oklch(0.28 0.03 165);
  --accent-foreground: oklch(0.85 0.06 165);
  --destructive: oklch(0.62 0.17 25);
  --border: oklch(0.29 0.01 85);
  --input: oklch(0.29 0.01 85);
  --ring: oklch(0.75 0.11 165);
}
```

(Si el globals del scaffold tiene variables adicionales — chart, sidebar —, derivarlas de esta misma familia: sidebar = background/secondary, nunca colores nuevos.)

2. Fuente serif — en el root layout, junto a las Geist existentes:

```typescript
import { Instrument_Serif } from "next/font/google";
const serif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-serif",
});
// agregar serif.variable al className de <html>
```

Y exponerla en Tailwind (`globals.css`, bloque `@theme inline` del scaffold): `--font-serif: var(--font-serif);` → usable como `font-serif`.

## Paso 2 — Reestructura de rutas y middleware

La raíz deja de ser el dashboard:

```
src/app/
  (public)/
    layout.tsx          # layout mínimo público (sin sidebar/header privado)
    page.tsx            # landing
    login/page.tsx
    register/page.tsx
  (app)/
    layout.tsx          # shell: sidebar + contenido (Paso 5)
    dashboard/page.tsx  # el saludo existente se muda aquí
    loading.tsx / error.tsx (se mudan del spec anterior)
```

Middleware — actualizar la lógica:

```typescript
const PUBLIC_PATHS = ["/", "/login", "/register"];
// sin sesión y NO público → /login
// con sesión y pathname ∈ ["/login", "/register"] → /dashboard
// con sesión en "/" (landing): PERMITIDO ver la landing; el CTA lleva a /dashboard
```

Actualizar los redirects post-login/registro/logout de los forms del SPEC-007: éxito → `/dashboard`.

## Paso 3 — Landing (`(public)/page.tsx`)

Server component, UNA sección hero, mobile-first:

- Estructura: mini-nav superior (nombre de la app en serif + botón ghost "Iniciar sesión") · hero centrado con `h1` en `font-serif` grande (text-4xl móvil / text-6xl desktop), un párrafo `text-muted-foreground` de 1–2 líneas, y dos CTAs (`<Button>` primario → registro, `variant="outline"` → login).
- Fondo: `bg-background` plano con UN detalle sutil permitido — una grilla de puntos tenue en CSS:

```tsx
<div
  aria-hidden
  className="absolute inset-0 -z-10 bg-[radial-gradient(circle,_var(--border)_1px,_transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]"
/>
```

- Copy vía i18n (namespace `landing`: `title`, `subtitle`, `ctaRegister`, `ctaLogin`) en ambos JSON. Título sugerido es: "Tus finanzas, claras." / en: "Your money, made clear." (editable por el humano).
- Nada más: sin features-grid, sin testimonios, sin footer elaborado (una línea de footer opcional).

## Paso 4 — Restyle de login y registro

- Layout compartido de auth dentro de `(public)`: pantalla completa centrada, el mismo fondo de puntos del landing, y la card del form (`max-w-sm`, `border`, `shadow-sm` como única sombra permitida).
- La card: título en `font-serif`, inputs con labels (ya existen del SPEC-007 — esto es restyle, NO reescritura de la lógica), botón primario full-width, link cruzado login↔registro en `text-muted-foreground` con el link en color primario.
- Un toque identitario: el nombre de la app en serif arriba de la card, linkeando a `/`.
- Estados: error en `text-destructive` bajo el form (los mensajes traducidos existentes); botón disabled+loading durante submit (existente).
- Mobile-first: en móvil la card ocupa el ancho con padding lateral; sin breakpoints exóticos.

## Paso 5 — Shell del dashboard con sidebar

1. Instalar el sistema de sidebar de shadcn: `pnpm dlx shadcn@latest add sidebar` (trae sheet, tooltip, etc. como dependencias). Usar sus primitivas (`SidebarProvider`, `Sidebar`, `SidebarMenu`, `SidebarMenuItem`, `SidebarTrigger`...) — NO construir un sidebar a mano: el de shadcn ya resuelve colapsado en desktop y drawer en móvil.

2. **`src/components/shared/nav.ts`** — la navegación como datos (para que crecer sea editar un array):

```typescript
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Tags,
  CreditCard,
  Bitcoin,
} from "lucide-react";

export const NAV = [
  {
    labelKey: "nav.overview",
    items: [
      { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    labelKey: "nav.money",
    items: [
      { labelKey: "nav.movements", href: "/movements", icon: ArrowLeftRight },
      { labelKey: "nav.accounts", href: "/accounts", icon: Wallet },
      { labelKey: "nav.categories", href: "/categories", icon: Tags },
      { labelKey: "nav.creditCards", href: "/credit-cards", icon: CreditCard },
      { labelKey: "nav.crypto", href: "/crypto", icon: Bitcoin },
    ],
  },
] as const;
```

Las rutas aún no existen: los items renderizan igual (navegar a una da el 404 de `notFound` — aceptable en este spec; se irán habilitando por spec). Keys en `messages/*.json` bajo `nav`.

3. **`(app)/layout.tsx`**: `SidebarProvider` + `AppSidebar` + área de contenido con un top bar mínimo (SidebarTrigger a la izquierda; LocaleToggle, ThemeToggle y el menú de usuario con logout a la derecha — migrando lo que el header del SPEC-007 tenía; el header viejo se elimina).
4. **`AppSidebar`** (`components/shared/app-sidebar.tsx`): header con el nombre de la app en serif, grupos del `NAV` con sus labels de sección en `text-muted-foreground` uppercase pequeño, item activo marcado con el acento (usar `usePathname` para el estado activo). Footer del sidebar: email del usuario en `text-muted-foreground` (pasado como prop desde el layout, que ya obtiene `getMe`).
5. `dashboard/page.tsx`: el saludo existente, con el nombre en `font-serif` — placeholder digno hasta el spec de datos.

## Paso 6 — i18n de todo lo nuevo

Namespaces nuevos en AMBOS JSON: `landing` (title, subtitle, ctaRegister, ctaLogin), `nav` (overview, dashboard, money, movements, accounts, categories, creditCards, crypto). Verificar paridad de keys es↔en (criterio existente).

## Errores comunes que NO cometer

- Inventar colores fuera de los tokens del Paso 1 (incluye "mejorar" la paleta).
- Gradientes, glass, blur, sombras > `shadow-sm` (prohibiciones de la dirección de arte).
- Construir el sidebar a mano en vez de usar el de shadcn.
- Reescribir la lógica de los forms de auth (es restyle: la lógica del SPEC-007 queda intacta).
- Dejar el dashboard en `/` (la raíz es la landing pública ahora).
- Strings nuevos sin sus keys en ambos idiomas.
- Agregar librerías de animación, ilustraciones o secciones extra al landing.

## Criterios de aceptación (QA de browser, dev)

1. [ ] `/` sin sesión: landing con hero, puntos de fondo sutiles, CTAs funcionando. En móvil (DevTools, 375px) se ve completa sin scroll horizontal.
2. [ ] Login y registro: card centrada con título serif, se ven correctos en móvil y desktop, en light Y dark; la lógica de auth sigue funcionando igual (login, errores traducidos, redirects — ahora a `/dashboard`).
3. [ ] Con sesión: `/dashboard` muestra el shell — sidebar con los grupos y 6 items, item activo marcado en verde, saludo en serif. En móvil, el sidebar es drawer (se abre con el trigger, se cierra al navegar).
4. [ ] Toggles de tema e idioma siguen funcionando desde el top bar; TODA la UI nueva (landing, nav, auth) cambia de idioma; ambos temas sin colores rotos en ninguna pantalla nueva.
5. [ ] Con sesión, `/login` y `/register` redirigen a `/dashboard`; `/` (landing) es visible con sesión y su CTA lleva a `/dashboard`.
6. [ ] Inspección anti-genérico: cero gradientes/glass/glow en el DOM; un solo color de acento en toda la UI; `pnpm build` limpio.

## Al completar

**NO ejecutar `git commit` ni ningún comando de git.** Reportar: resumen, archivos creados/modificados, desviaciones justificadas, y el **mensaje de commit recomendado** (base sugerida: `feat(frontend): landing, auth restyle and dashboard shell`, con `SPEC-008` en el cuerpo). El commit lo hace el humano.
