# SPEC-010: Gestión visual de categorías y subcategorías

Estado: 🔲 pendiente

Ejecutar cumpliendo `ARCHITECTURE.md`, `frontend/ARCHITECTURE.md` y la decisión **D4** de `docs/DATABASE.md`. Los tres documentos son normativos. Este spec extiende el módulo de categorías creado en SPEC-002 y construye su primera interfaz web; no crea un segundo modelo de categorías ni duplica reglas de dominio en el frontend.

Este documento es deliberadamente explícito porque será ejecutado por un modelo de menor capacidad. Los nombres de archivos, contratos, estados, reglas visuales y criterios de aceptación forman parte del alcance. Antes de escribir código Next.js, leer las guías relevantes incluidas en `frontend/node_modules/next/dist/docs/`, como exige `frontend/AGENTS.md`, especialmente las de formularios, Server Actions, revalidación, loading y error handling.

## Objetivo

Entregar `/categories` como una pantalla completa y visualmente cuidada donde el usuario pueda:

1. consultar las categorías del sistema y las creadas por él;
2. entender la jerarquía categoría → subcategorías de un vistazo;
3. crear categorías raíz propias;
4. crear subcategorías propias debajo de una categoría raíz propia **o del sistema**;
5. editar nombre, descripción, emoji y color de categorías propias;
6. archivar y restaurar categorías propias sin borrar su historial;
7. buscar y filtrar la colección;
8. distinguir claramente categorías del sistema, categorías propias y subcategorías;
9. ver emojis y colores consistentes que luego puedan reutilizarse en movimientos y reportes.

Al terminar, la navegación existente hacia `/categories` debe dejar de apuntar a un 404 y el siguiente spec de movimientos debe poder reutilizar el cliente API, los tipos y la representación visual creados aquí.

## Estado inicial verificado

No asumir que el módulo parte de cero:

- `categories` ya es una sola tabla con jerarquía de un nivel mediante `parent_id`.
- `color` **ya existe** como `text` nullable y se valida como hexadecimal `#RRGGBB`.
- Las 14 categorías del sistema ya tienen colores sembrados y UUIDs estables.
- `emoji` **no existe** y es la única columna visual nueva requerida.
- El backend ya lista, crea, actualiza y archiva categorías.
- Las categorías del sistema son visibles para todos e inmutables.
- El backend ya permite crear una subcategoría propia debajo de una raíz accesible, incluida una raíz del sistema.
- No existe cliente frontend para categorías, ruta `/categories`, restauración, filtro de archivadas ni UI.
- La lista actual devuelve únicamente categorías activas.
- El update actual debe reforzarse para impedir nombres duplicados; no conservar ese hueco.

## Decisiones de producto y dominio (normativas)

### 1. Se conserva una tabla y sólo un nivel de jerarquía

No crear tabla `subcategories`. Una subcategoría sigue siendo una fila de `categories` con `parent_id` no nulo.

Jerarquía válida:

```text
Categoría raíz
└── Subcategoría
```

Jerarquía inválida:

```text
Categoría raíz
└── Subcategoría
    └── Tercer nivel   ← prohibido
```

`parentId` se elige al crear y permanece inmutable. Este spec no incluye mover una categoría entre padres ni convertir una raíz en subcategoría o viceversa. Esa restricción evita ciclos, cambios de significado y complejidad innecesaria.

### 2. Sistema visible e inmutable; personal editable

- `user_id = NULL`: categoría del sistema, visible para todos.
- `user_id = :userId`: categoría propia del usuario.
- Una categoría del sistema no se edita, archiva ni restaura desde API o UI.
- El menú de una categoría del sistema sólo ofrece “Agregar subcategoría”.
- El usuario sí puede crear una subcategoría propia debajo de una raíz del sistema. Ejemplo: `Transporte → Gasolina`.
- Toda escritura mantiene ownership estricto. Una categoría ajena y una categoría del sistema deben responder 404 ante intentos de modificación para no filtrar información.

### 3. Color ya existe; emoji se agrega como dato opcional

Agregar a `categories`:

```ts
emoji: text("emoji"),
```

No crear una tabla de iconos y no guardar nombres de iconos Lucide. El emoji se almacena como Unicode para que sea portable a web, móvil, WhatsApp y futuros reportes.

Tanto `color` como `emoji` permanecen nullable en DB y API por compatibilidad y para permitir herencia visual en subcategorías. La UI debe enviar siempre un emoji y un color para una categoría raíz nueva usando valores iniciales razonables. Para una subcategoría, el usuario puede elegir apariencia propia o heredar la del padre.

### 4. Apariencia efectiva e herencia

La DB almacena los valores declarados, no valores calculados. La presentación resuelve:

```text
emoji efectivo = emoji propio ?? emoji del padre ?? "🏷️"
color efectivo = color propio ?? color del padre ?? token visual neutro
```

- Una raíz nueva creada desde la UI tiene emoji y color propios.
- Una subcategoría nueva hereda ambos por defecto guardando `emoji: null` y `color: null`.
- El usuario puede desactivar “Usar la apariencia de la categoría principal” y escoger valores propios.
- Editar una subcategoría permite volver a heredar, enviando `null` para ambos campos.
- No persistir `effectiveEmoji` ni `effectiveColor`.
- No hacer esta composición en el backend: es una decisión de presentación y los valores crudos siguen siendo útiles para otros clientes.

### 5. Validación del emoji

La API acepta `null` o exactamente **un grapheme Unicode visible que contenga un emoji**. Debe aceptar secuencias válidas como `❤️`, `❤️‍🩹`, `👨‍👩‍👧‍👦`, `✈️` y banderas, no sólo un code point.

No validar con `string.length === 1`: muchos emojis ocupan varios code points. Usar `Intl.Segmenter` con granularidad `grapheme` y comprobar que exista un solo segmento con propiedad emoji. Longitud defensiva máxima: 32 code units.

La UI ofrece una paleta predefinida; no se agrega una dependencia de emoji picker. La validación del backend sigue siendo autoritativa aunque la UI limite las opciones visibles.

### 6. Color y accesibilidad

- La API conserva el formato actual `#RRGGBB`.
- La UI ofrece una paleta de colores y un `<input type="color">` para personalización.
- El color es un acento, nunca el único medio para transmitir estado o ownership.
- No usar el color arbitrario como fondo sólido detrás de texto que necesite contraste.
- Usarlo como borde, punto de color o fondo con transparencia baja para el contenedor del emoji.
- Los colores de categorías son datos provenientes de la API y son la excepción ya documentada a la prohibición de colores inline del frontend.
- Todo control de color debe tener nombre accesible; una muestra circular sin texto no basta.

### 7. Nombres únicos entre categorías activas del mismo nivel

Se conserva la regla existente y se aplica también al editar y restaurar:

- dos raíces activas visibles para el usuario no pueden compartir nombre;
- dos hijas activas del mismo padre no pueden compartir nombre;
- el mismo nombre sí puede existir bajo padres diferentes;
- la comparación conserva el comportamiento actual de PostgreSQL: exacta y sensible a mayúsculas. No introducir `citext` ni normalización en este spec;
- una categoría archivada no bloquea crear otra activa con el mismo nombre;
- restaurar una archivada falla con `CATEGORY_NAME_CONFLICT` si ya existe otra activa en su nivel.

La comprobación de update debe excluir el id de la categoría que se está editando.

### 8. Archivo, cascada y restauración

Nunca hacer hard delete.

- Archivar una subcategoría archiva sólo esa fila.
- Archivar una raíz propia archiva, en una transacción, la raíz y todas sus subcategorías propias directas.
- Los movimientos históricos siguen referenciando la categoría archivada.
- Una categoría archivada no aparece en selectores de movimientos y `getAccessibleCategory` continúa rechazándola.
- Restaurar una subcategoría exige que su padre esté activo.
- Restaurar una raíz restaura, en una transacción, la raíz y sus subcategorías propias directas. La confirmación de UI debe decirlo.
- Restaurar valida conflictos de nombre antes de escribir; cualquier conflicto revierte toda la transacción.
- Archivar/restaurar dos veces produce un error de dominio estable, no un éxito silencioso.

### 9. No agregar `kind: income | expense`

Este spec no clasifica categorías por tipo de movimiento. Aunque los seeds sugieran ingresos o gastos, el modelo actual permite usar una categoría en cualquier movimiento y no existe todavía una decisión normativa para restringirlo.

No inferir `kind` por nombre, UUID, posición del seed o jerarquía. Si el producto requiere esa restricción, deberá diseñarse en otro spec junto con movimientos y reportes.

### 10. Dirección visual

La pantalla debe sentirse parte del mismo producto construido en SPEC-008 y SPEC-009:

- tranquila, limpia y editorial;
- fondo y texto con tokens semánticos;
- `font-serif` para el título, no para cada nombre;
- verde primario sólo para CTA, foco y selección;
- colores de categorías usados de forma contenida;
- sin gradientes, glassmorphism, glow, blur decorativo ni sombras dramáticas;
- responsive mobile-first;
- dark mode funcional;
- iconos Lucide de 16–20 px para acciones; los emojis son el identificador visual de la categoría.

## Alcance

### Incluye

#### Backend

- columna nullable `emoji` y migración Drizzle;
- emoji inicial para las 14 categorías del sistema mediante una migración nueva;
- `emoji` en create, update y response;
- validación de un solo grapheme emoji;
- `GET /api/categories?status=active|archived`;
- update con validación de duplicados;
- errores de dominio con códigos estables;
- archivo transaccional en cascada;
- `POST /api/categories/:id/restore` transaccional;
- tests de integración de todos los comportamientos anteriores;
- actualización puntual de `docs/DATABASE.md`.

#### Frontend

- cliente API tipado `lib/api/categories.ts`;
- ruta `/categories`, `loading.tsx` y `error.tsx`;
- lectura paralela de activas y archivadas;
- jerarquía visual de raíces y subcategorías;
- búsqueda tolerante a tildes;
- filtros por ownership;
- formularios de creación y edición;
- selector accesible de emoji y color;
- acciones para agregar subcategoría, editar, archivar y restaurar;
- feedback accesible y traducciones completas es/en;
- estados vacío, sin resultados y archivadas;
- diseño responsive y dark mode.

### NO incluye

- movimientos o formulario de ingresos/gastos;
- selector de categorías dentro de movimientos;
- reportes, presupuestos o agregados por categoría;
- `kind: income | expense`;
- más de un nivel de jerarquía;
- reordenamiento manual o drag-and-drop;
- mover categorías entre padres;
- hard delete;
- editar categorías del sistema;
- ocultar categorías del sistema por usuario;
- traducir nombres sembrados;
- iconos Lucide persistidos en DB;
- subida de imágenes o emojis personalizados;
- dependencias de terceros para emoji/color picker;
- capabilities del agente.

## Contratos HTTP finales

Todos requieren sesión. Los ejemplos omiten headers de autenticación.

### Listar activas

```http
GET /api/categories?status=active
```

`status` es opcional y su default es `active`, preservando compatibilidad con consumidores actuales.

```json
[
  {
    "id": "00000000-0000-4000-8000-000000000003",
    "name": "Transporte",
    "parentId": null,
    "description": null,
    "color": "#378ADD",
    "emoji": "🚗",
    "isSystem": true,
    "archived": false
  },
  {
    "id": "9de4bf5c-983e-40e4-8bd5-4e21ccdb1306",
    "name": "Gasolina",
    "parentId": "00000000-0000-4000-8000-000000000003",
    "description": "Combustible del carro",
    "color": null,
    "emoji": null,
    "isSystem": false,
    "archived": false
  }
]
```

La segunda fila hereda visualmente 🚗 y `#378ADD`, pero la API devuelve los valores crudos `null`.

### Listar archivadas

```http
GET /api/categories?status=archived
```

Devuelve únicamente categorías propias archivadas. Las categorías del sistema nunca están archivadas.

### Crear raíz

```http
POST /api/categories
Content-Type: application/json

{
  "name": "Mascotas",
  "description": "Gastos de cuidado y bienestar",
  "color": "#D4537E",
  "emoji": "🐾"
}
```

### Crear subcategoría heredando apariencia

```http
POST /api/categories
Content-Type: application/json

{
  "name": "Gasolina",
  "parentId": "00000000-0000-4000-8000-000000000003",
  "description": null,
  "color": null,
  "emoji": null
}
```

### Editar categoría propia

```http
PATCH /api/categories/9de4bf5c-983e-40e4-8bd5-4e21ccdb1306
Content-Type: application/json

{
  "name": "Combustible",
  "description": "Gasolina y recargas",
  "color": "#EF9F27",
  "emoji": "⛽"
}
```

`parentId` no forma parte del update.

### Archivar

```http
DELETE /api/categories/9de4bf5c-983e-40e4-8bd5-4e21ccdb1306
```

Respuesta `204`. Si es raíz, archiva también sus hijas propias.

### Restaurar

```http
POST /api/categories/9de4bf5c-983e-40e4-8bd5-4e21ccdb1306/restore
```

Respuesta `200` con la categoría restaurada. Si es raíz, restaura también sus hijas propias.

## Backend

### Paso 1 — Schema y migración de emoji

Modificar `backend/src/modules/categories/categories.schema.ts`:

```ts
export const categories = pgTable("categories", {
  // campos existentes...
  color: text("color"),
  // Un grapheme emoji Unicode. Validación en Zod, no en PostgreSQL.
  emoji: text("emoji"),
  archived: boolean("archived").notNull().default(false),
  // campos existentes...
});
```

Desde `backend/`, ejecutar:

```bash
npm run db:generate
```

Revisar la migración generada. Debe agregar sólo `emoji`; **no editar** migraciones históricas ya aplicadas.

En la misma migración nueva, después del `ALTER TABLE`, agregar updates por UUID para que instalaciones existentes reciban los emojis:

```sql
UPDATE "categories" SET "emoji" = '🛒' WHERE "id" = '00000000-0000-4000-8000-000000000001';
UPDATE "categories" SET "emoji" = '🍽️' WHERE "id" = '00000000-0000-4000-8000-000000000002';
UPDATE "categories" SET "emoji" = '🚗' WHERE "id" = '00000000-0000-4000-8000-000000000003';
UPDATE "categories" SET "emoji" = '🏠' WHERE "id" = '00000000-0000-4000-8000-000000000004';
UPDATE "categories" SET "emoji" = '💡' WHERE "id" = '00000000-0000-4000-8000-000000000005';
UPDATE "categories" SET "emoji" = '❤️‍🩹' WHERE "id" = '00000000-0000-4000-8000-000000000006';
UPDATE "categories" SET "emoji" = '🎬' WHERE "id" = '00000000-0000-4000-8000-000000000007';
UPDATE "categories" SET "emoji" = '🎓' WHERE "id" = '00000000-0000-4000-8000-000000000008';
UPDATE "categories" SET "emoji" = '✈️' WHERE "id" = '00000000-0000-4000-8000-000000000009';
UPDATE "categories" SET "emoji" = '🧾' WHERE "id" = '00000000-0000-4000-8000-000000000010';
UPDATE "categories" SET "emoji" = '🏛️' WHERE "id" = '00000000-0000-4000-8000-000000000011';
UPDATE "categories" SET "emoji" = '📦' WHERE "id" = '00000000-0000-4000-8000-000000000012';
UPDATE "categories" SET "emoji" = '💰' WHERE "id" = '00000000-0000-4000-8000-000000000013';
UPDATE "categories" SET "emoji" = '💵' WHERE "id" = '00000000-0000-4000-8000-000000000014';
```

No cambiar los UUIDs, nombres ni colores existentes. La categoría `Comisiones` y su UUID son dependencia de movimientos.

Actualizar `docs/DATABASE.md` sólo donde corresponda:

- en D4, mencionar que las categorías pueden tener color y emoji presentacionales;
- en el diagrama, agregar `string color` y `string emoji` como campos nullable de `CATEGORIES`.

### Paso 2 — Schemas Zod y tipos

Crear `backend/src/modules/categories/categories.emoji.ts` para que la validación sea una función pura y testeable. Importarla desde `categories.types.ts`. Implementación requerida:

```ts
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

function isSingleEmojiGrapheme(value: string): boolean {
  const segments = [...segmenter.segment(value)];
  if (segments.length !== 1) return false;

  return /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3)/u.test(
    value,
  );
}

const emoji = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .refine(isSingleEmojiGrapheme, "Expected exactly one emoji");
```

Agregar `backend/src/modules/categories/categories.emoji.test.ts` con casos para emoji simple, variation selector, ZWJ, bandera, keycap, texto, string vacío y dos emojis. Si la versión instalada de TypeScript no tipa `Intl.Segmenter`, verificar primero las libs disponibles y agregar la lib estándar mínima necesaria en `tsconfig`; no usar casts indiscriminados y no reemplazar la validación por `length === 1`.

Después modificar `backend/src/modules/categories/categories.types.ts` e importar el helper.

Contratos finales:

```ts
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Expected hex color like #1D9E75");

export const categoryStatus = z.enum(["active", "archived"]);

export const listCategoriesQuery = z.object({
  status: categoryStatus.default("active"),
});
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuery>;

export const createCategoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  parentId: z.string().uuid().nullish(),
  description: z.string().trim().max(300).nullish(),
  color: hexColor.nullish(),
  emoji: emoji.nullish(),
});

export const updateCategoryInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(300).nullable(),
    color: hexColor.nullable(),
    emoji: emoji.nullable(),
  })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );

export const categoryResponse = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  emoji: z.string().nullable(),
  isSystem: z.boolean(),
  archived: z.boolean(),
});
```

Actualizar los tipos inferidos correspondientes. No usar `z.parse()` sobre respuestas construidas por el propio service.

### Paso 3 — Errores de dominio estables

Crear `backend/src/modules/categories/categories.errors.ts`:

```ts
import { AppError } from "../../shared/errors.js";

export class CategoryNameConflictError extends AppError {
  constructor() {
    super(
      "An active category with that name already exists at this level",
      400,
      "CATEGORY_NAME_CONFLICT",
    );
  }
}

export class CategoryAlreadyArchivedError extends AppError {
  constructor() {
    super("Category is already archived", 400, "CATEGORY_ALREADY_ARCHIVED");
  }
}

export class CategoryAlreadyActiveError extends AppError {
  constructor() {
    super("Category is already active", 400, "CATEGORY_ALREADY_ACTIVE");
  }
}

export class CategoryParentArchivedError extends AppError {
  constructor() {
    super(
      "The parent category must be active",
      400,
      "CATEGORY_PARENT_ARCHIVED",
    );
  }
}
```

Puede seguir usándose `ValidationError` para tercer nivel o emoji/color inválido en el borde, pero los casos que la UI debe traducir necesitan los códigos anteriores. Nunca mostrar `message` técnico directamente en el frontend.

### Paso 4 — Respuesta y helper de duplicados

Actualizar `toResponse` para incluir `emoji`.

Extraer dentro del service un helper componible para detectar conflictos. Debe recibir:

- `db` como `DbExecutor` para funcionar dentro de transacciones;
- `userId`;
- `name`;
- `parentId` nullable;
- `excludeId` opcional para updates/restores.

La condición mínima es:

```text
categoría accesible al usuario
AND archived = false
AND name = input.name
AND parent_id coincide exactamente, incluido NULL para raíz
AND id != excludeId, cuando exista
```

Si encuentra fila, lanzar `CategoryNameConflictError`.

No crear un repositorio ni una clase CRUD. El helper vive en `categories.service.ts`.

### Paso 5 — Listado por estado

Cambiar la firma:

```ts
export async function listCategories(
  db: Database,
  userId: string,
  query: ListCategoriesQuery,
)
```

Reglas:

- `active`: propias + sistema con `archived = false`;
- `archived`: sólo propias con `archived = true`;
- orden determinista por `name` ascendente;
- devolver lista plana; el frontend arma el árbol presentacional;
- no agregar hijos embebidos a la API;
- el default HTTP es `active`.

Para `archived`, usar ownership estricto y no `accessibleTo`, aunque el resultado práctico de sistema sea vacío.

### Paso 6 — Crear y actualizar

#### Crear

Conservar las reglas existentes y cambiar el error de duplicado por `CategoryNameConflictError`.

Si existe `parentId`:

1. buscar padre accesible;
2. exigir que esté activo;
3. exigir `parent.parentId === null`;
4. permitir padre propio o del sistema;
5. insertar siempre `userId` del usuario actual, nunca copiar `userId` del padre.

Persistir:

```ts
{
  userId,
  name: input.name,
  parentId: input.parentId ?? null,
  description: input.description ?? null,
  color: input.color ?? null,
  emoji: input.emoji ?? null,
}
```

#### Actualizar

Antes del update:

1. buscar la categoría propia por `id + userId`; sistema/ajena → 404;
2. si está archivada, lanzar `CategoryAlreadyArchivedError`;
3. si cambia `name`, validar duplicado en el mismo `parentId`, excluyendo el id actual;
4. aplicar sólo `name`, `description`, `color`, `emoji`;
5. no aceptar `parentId`, `userId`, `archived` ni `isSystem`.

Enviar `null` limpia description/color/emoji. Un objeto vacío sigue siendo 400 por Zod.

### Paso 7 — Archivar y restaurar transaccionalmente

Cambiar `archiveCategory` para recibir `Database` y abrir una transacción.

#### Archivar

Dentro de la transacción:

1. buscar categoría con `id + userId`;
2. si no existe → 404;
3. si ya está archivada → `CategoryAlreadyArchivedError`;
4. marcarla `archived: true`;
5. si es raíz, marcar también `archived: true` todas sus hijas propias directas;
6. no tocar categorías de otros usuarios ni sistema.

#### Restaurar

Agregar:

```ts
export async function restoreCategory(
  db: Database,
  userId: string,
  categoryId: string,
)
```

Dentro de una sola transacción:

1. buscar categoría propia por `id + userId`;
2. si no existe → 404;
3. si ya está activa → `CategoryAlreadyActiveError`;
4. si es subcategoría, buscar su padre accesible y exigir que esté activo y sea raíz;
5. validar conflicto de nombre de la categoría;
6. si es raíz, cargar sus hijas propias archivadas y validar los conflictos necesarios antes de escribir;
7. restaurar la categoría;
8. si es raíz, restaurar también sus hijas propias directas;
9. devolver `toResponse` de la categoría restaurada.

No hacer updates parciales antes de terminar todas las validaciones. Una excepción debe hacer rollback completo.

### Paso 8 — Rutas

Actualizar `backend/src/modules/categories/categories.routes.ts`:

- importar `listCategoriesQuery`;
- declarar `querystring` y pasarlo al service;
- montar restauración.

Forma final:

```ts
r.get(
  "/categories",
  {
    preHandler: opts.requireAuth,
    schema: {
      querystring: listCategoriesQuery,
      response: { 200: categoryListResponse },
    },
  },
  async (request) =>
    listCategories(opts.db, request.user!.id, request.query),
);

r.post(
  "/categories/:id/restore",
  {
    preHandler: opts.requireAuth,
    schema: {
      params: idParam,
      response: { 200: categoryResponse },
    },
  },
  async (request) =>
    restoreCategory(opts.db, request.user!.id, request.params.id),
);
```

Mantener las rutas delgadas. No construir jerarquías ni resolver estilos en rutas.

### Paso 9 — Tests backend

Extender `backend/src/modules/categories/categories.test.ts`. Conservar los tests de aislamiento entre usuarios y agregar casos separados, legibles y deterministas.

Cobertura mínima:

1. migración deja 14 categorías del sistema con `emoji` no nulo;
2. lista activa incluye sistema + propias activas y `emoji` en response;
3. lista archivada incluye sólo propias archivadas;
4. `status` omitido equivale a active;
5. status inválido responde 400;
6. crear raíz con emoji compuesto válido y color válido;
7. crear subcategoría con `emoji: null` y `color: null`;
8. crear hija bajo raíz del sistema;
9. no crear tercer nivel;
10. rechazar texto normal, dos emojis y color inválido;
11. permitir emoji con ZWJ o variation selector (`❤️‍🩹` o `✈️`);
12. categorías propias de A no aparecen para B;
13. B no modifica ni archiva categorías de A;
14. nadie modifica/archiva/restaura sistema;
15. crear duplicado raíz activo falla con `CATEGORY_NAME_CONFLICT`;
16. crear duplicado bajo mismo padre falla;
17. mismo nombre bajo padres distintos funciona;
18. renombrar hacia duplicado falla;
19. update que conserva el mismo nombre funciona;
20. archivar hija no archiva padre ni hermanas;
21. archivar raíz archiva hijas en cascada;
22. archivar dos veces falla con `CATEGORY_ALREADY_ARCHIVED`;
23. restaurar hija con padre archivado falla con `CATEGORY_PARENT_ARCHIVED`;
24. restaurar raíz restaura hijas;
25. restaurar dos veces falla con `CATEGORY_ALREADY_ACTIVE`;
26. restaurar con conflicto de nombre revierte toda la transacción;
27. movimientos históricos conservan su `categoryId` después de archivar;
28. `getAccessibleCategory` rechaza archivadas y acepta restauradas.

Los tests de service continúan usando PostgreSQL real mediante Testcontainers. No mockear Drizzle.

## Frontend

### Paso 10 — Componentes UI y estructura

Reutilizar `Button`, `Input`, `Select`, `Dialog`, `AlertDialog`, `DropdownMenu`, `Card`, `Skeleton` y `Label` existentes.

Crear `components/ui/badge.tsx` siguiendo el patrón shadcn ya usado y `components/ui/textarea.tsx` como wrapper del elemento nativo con los mismos tokens de `Input`. Son piezas de encapsulación UI, no componentes de dominio. No agregar dependencias y no importar Base UI ni Radix directamente desde la feature.

Estructura esperada:

```text
frontend/src/
  app/(app)/categories/
    page.tsx
    loading.tsx
    error.tsx
  features/categories/
    action-helpers.ts
    action-state.ts
    actions.ts
    queries.ts
    schemas.ts
    category-visual.ts
    components/
      categories-screen.tsx
      categories-toolbar.tsx
      categories-grid.tsx
      category-card.tsx
      category-row-actions.tsx
      create-category-dialog.tsx
      edit-category-dialog.tsx
      archive-category-dialog.tsx
      emoji-picker.tsx
      color-picker.tsx
      use-action-dialog.ts
  lib/api/categories.ts
```

Se permiten ajustes menores de nombres, pero mantener el vertical slice. No colocar lógica en `app/(app)/categories/page.tsx`.

### Paso 11 — Cliente API

Crear `frontend/src/lib/api/categories.ts`:

```ts
import { apiFetch } from "./client";

export type CategoryStatus = "active" | "archived";

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  color: string | null;
  emoji: string | null;
  isSystem: boolean;
  archived: boolean;
}

export interface CreateCategoryPayload {
  name: string;
  parentId?: string | null;
  description?: string | null;
  color?: string | null;
  emoji?: string | null;
}

export interface UpdateCategoryPayload {
  name?: string;
  description?: string | null;
  color?: string | null;
  emoji?: string | null;
}

export function listCategories(status: CategoryStatus): Promise<Category[]> {
  return apiFetch<Category[]>(`/api/categories?status=${status}`);
}

export function createCategory(
  input: CreateCategoryPayload,
): Promise<Category> {
  return apiFetch<Category>("/api/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCategory(
  categoryId: string,
  input: UpdateCategoryPayload,
): Promise<Category> {
  return apiFetch<Category>(
    `/api/categories/${encodeURIComponent(categoryId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function archiveCategory(categoryId: string): Promise<void> {
  return apiFetch<void>(
    `/api/categories/${encodeURIComponent(categoryId)}`,
    { method: "DELETE" },
  );
}

export function restoreCategory(categoryId: string): Promise<Category> {
  return apiFetch<Category>(
    `/api/categories/${encodeURIComponent(categoryId)}/restore`,
    { method: "POST" },
  );
}
```

Este archivo es server-only indirectamente por `apiFetch`; no importarlo desde Client Components. Estos llaman Server Actions.

### Paso 12 — Query y read model

Crear `features/categories/queries.ts` con `import "server-only"`.

```ts
export async function getCategoriesPageData() {
  const [active, archived] = await Promise.all([
    listCategories("active"),
    listCategories("archived"),
  ]);

  return { active, archived };
}
```

No construir endpoints por pantalla. La agrupación padre/hijos es presentación y puede hacerse en una función pura de la feature.

El algoritmo debe tolerar el caso de una subcategoría archivada cuyo padre esté activo: usar el conjunto combinado `active + archived` para resolver el nombre y apariencia del padre. Si falta un padre referenciado, usar fallback visual y mostrar la fila; no ocultar silenciosamente datos inconsistentes.

Tipos de presentación sugeridos:

```ts
export interface CategoryGroup {
  root: Category;
  children: Category[];
}

export interface CategoryVisual {
  emoji: string;
  color: string | null;
}
```

`category-visual.ts` resuelve:

```ts
export function getCategoryVisual(
  category: Category,
  parent?: Category,
): CategoryVisual {
  return {
    emoji: category.emoji ?? parent?.emoji ?? "🏷️",
    color: category.color ?? parent?.color ?? null,
  };
}
```

No escribir colores default hex ocultos en el helper; sin dato se usan clases semánticas neutras.

### Paso 13 — Page, loading y error

`app/(app)/categories/page.tsx` debe limitarse a composición:

```tsx
import { getTranslations } from "next-intl/server";

import { CategoriesScreen } from "../../../features/categories/components/categories-screen";
import { getCategoriesPageData } from "../../../features/categories/queries";

export default async function CategoriesPage() {
  const [data, t] = await Promise.all([
    getCategoriesPageData(),
    getTranslations("categories"),
  ]);

  return (
    <CategoriesScreen
      data={data}
      title={t("title")}
      subtitle={t("subtitle")}
    />
  );
}
```

`loading.tsx` aproxima el layout final con:

- título y subtítulo;
- botón a la derecha;
- tabs y búsqueda;
- seis cards skeleton en grid responsive.

No usar spinner. `error.tsx` sigue el patrón de cuentas y el error global, con copy i18n y botón retry.

### Paso 14 — Diseño exacto de `/categories`

Desktop de referencia:

```text
Dinero
Categorías                                      [Nueva categoría]
Organiza tus ingresos y gastos con etiquetas visuales.

[Activas] [Archivadas]
[Buscar categorías o subcategorías...] [Todas | Del sistema | Creadas por mí]

┌──────────────────────────┐  ┌──────────────────────────┐
│  🚗  Transporte  Sistema │  │  🏠  Vivienda    Sistema │
│  Para moverte cada día   │  │                          │
│  ──────────────────────  │  │  ──────────────────────  │
│  🚗 Gasolina          ⋯   │  │  🏠 Arriendo          ⋯  │
│  🚌 Transporte público ⋯  │  │  🔧 Reparaciones     ⋯  │
│                          │  │                          │
│  + Agregar subcategoría  │  │  + Agregar subcategoría  │
└──────────────────────────┘  └──────────────────────────┘
```

Reglas visuales:

- contenedor `max-w-6xl`, espaciado equivalente a cuentas;
- grid exacto: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`;
- cada raíz es una card única; no crear una card adicional por cada subcategoría;
- encabezado de card: bloque de emoji de 40–48 px, nombre, badge Sistema/Mía y menú si aplica;
- descripción opcional, máximo dos líneas visuales;
- subcategorías como filas separadas, con emoji efectivo, nombre y menú propio;
- pie de card con acción secundaria “Agregar subcategoría”;
- raíz propia: menú editar/archivar, además del CTA de subcategoría;
- raíz sistema: badge y CTA de subcategoría, sin menú de edición;
- subcategoría propia: editar/archivar;
- usar `MoreHorizontal`, `Plus`, `Pencil`, `Archive`, `RotateCcw`, `Search` de Lucide;
- el emoji no reemplaza labels accesibles en botones de acción.

Aplicación del color:

```tsx
const style = visual.color
  ? {
      backgroundColor: `${visual.color}1A`,
      borderColor: `${visual.color}40`,
    }
  : undefined;
```

El bloque mantiene `border` y fallback `bg-muted`. No aplicar el color a párrafos completos ni asumir contraste. Como `color` siempre fue validado `#RRGGBB`, agregar alpha hexadecimal es seguro.

En móvil:

- header apilado y CTA ancho completo si es necesario;
- toolbar en una columna;
- cards sin ancho fijo;
- dialogs ocupan el ancho disponible sin salir de viewport;
- paletas de emoji/color permiten targets táctiles de al menos 40 px;
- nunca introducir scroll horizontal.

### Paso 15 — Tabs, búsqueda y filtros

`CategoriesScreen` es Client Component porque maneja filtros y dialogs. Recibe arrays desde el servidor; no hace fetch.

Estado local mínimo:

```ts
type CategoryTab = "active" | "archived";
type OwnershipFilter = "all" | "system" | "mine";
```

Filtros:

- búsqueda por nombre o descripción de raíz/subcategoría;
- normalización case-insensitive y tolerante a tildes, reutilizando el patrón de cuentas;
- activas/archivadas mediante tabs;
- ownership en activas: todas, sistema, creadas por mí;
- en archivadas todas son propias, por lo que ocultar o deshabilitar el filtro de ownership.

Comportamiento jerárquico del filtro:

- si coincide una raíz, mostrarla con todas sus hijas que pasen ownership;
- si coincide sólo una hija, mostrar la card del padre como contexto y sólo las hijas coincidentes;
- en filtro “Sistema”, mostrar raíces/subcategorías del sistema;
- en filtro “Creadas por mí”, una raíz del sistema puede aparecer como contenedor contextual si tiene subcategorías propias; el badge sigue diciendo Sistema y sólo se muestran las hijas propias;
- no mutar ni ordenar in-place los props recibidos;
- ordenar raíces y hijas por nombre con `localeCompare(locale)`.

Estados:

1. activas siempre incluye seeds del sistema; aun así implementar fallback vacío robusto;
2. sin coincidencias: “No encontramos categorías” + limpiar filtros;
3. archivadas vacías: explicación de que las categorías archivadas aparecerán allí;
4. datos inconsistentes sin padre: fila de categoría con badge de subcategoría y fallback visual; no lanzar desde render.

### Paso 16 — Formularios y validación frontend

Crear `features/categories/schemas.ts`. La validación frontend mejora UX; el backend sigue siendo autoridad.

Campos:

1. nombre requerido, trim, 1–60;
2. descripción opcional, máximo 300;
3. emoji;
4. color;
5. `parentId` hidden para creación de subcategoría;
6. toggle/checkbox “Usar apariencia de {parentName}” sólo para subcategorías.

Crear raíz:

- dialog abierto desde “Nueva categoría”;
- título “Nueva categoría”;
- emoji inicial `🏷️`;
- color inicial `#378ADD`;
- no mostrar selector de padre;
- enviar emoji y color no nulos.

Crear subcategoría:

- dialog abierto desde la card padre;
- título “Nueva subcategoría”;
- mostrar “Dentro de {parentName}” como contexto no editable;
- herencia activa por defecto;
- con herencia activa, deshabilitar visualmente pickers y enviar `null`;
- al desactivar herencia, iniciar con emoji/color efectivos del padre para que el usuario vea un resultado coherente;
- el backend recibe siempre el `parentId` desde FormData validado, nunca desde estado global.

Editar:

- sólo propia;
- nombre y descripción precargados;
- raíz siempre edita apariencia propia;
- subcategoría con valores null inicia en modo herencia;
- enviar null explícito cuando se activa herencia;
- parent y ownership se muestran como contexto, no se editan.

Errores de campo debajo del control. Submit deshabilitado con “Guardando…” mientras pending. Éxito cierra, restablece el formulario y presenta feedback `role=status`.

### Paso 17 — Selector de emoji

Crear `emoji-picker.tsx` dentro de la feature. No instalar librerías.

Paleta mínima:

```ts
export const CATEGORY_EMOJIS = [
  "🏷️", "🛒", "🍽️", "🚗", "🚌", "⛽", "🏠", "💡",
  "❤️‍🩹", "💊", "🎬", "🎮", "🎓", "📚", "✈️", "🏖️",
  "🧾", "🏛️", "📦", "💰", "💵", "🐾", "👕", "🎁",
  "☕", "📱", "💻", "🔧", "🌱", "✨",
] as const;
```

Requisitos:

- grid de botones, no `<select>`;
- cada botón `type="button"`;
- `aria-label` localizado, por ejemplo “Seleccionar emoji 🚗”;
- `aria-pressed` para selección;
- anillo de foco visible y estado seleccionado claro sin depender sólo del color;
- input hidden `name="emoji"` con el valor seleccionado;
- no permitir entrada de texto libre en esta versión;
- el backend no usa `z.enum`: debe seguir aceptando otros emojis válidos para futuros clientes.

### Paso 18 — Selector de color

Crear `color-picker.tsx`.

Paleta mínima, basada en los seeds existentes:

```ts
export const CATEGORY_COLORS = [
  "#1D9E75", "#D85A30", "#378ADD", "#7F77DD", "#639922",
  "#D4537E", "#EF9F27", "#534AB7", "#0F6E56", "#888780",
  "#993C1D", "#5F5E5A", "#3B6D11",
] as const;
```

Requisitos:

- swatches como botones `type=button` de al menos 40 px;
- selección indicada con borde/anillo y check Lucide, no sólo por matiz;
- `aria-label` localizado incluyendo el valor hex;
- input hidden `name="color"`;
- control `<input type="color">` adicional con label “Color personalizado”;
- al elegir personalizado, sincronizar hidden input;
- no hacer conversiones HSL/RGB dentro de componentes;
- en modo herencia, el action convierte string vacío en `null`.

### Paso 19 — Server Actions

Crear:

```ts
createCategoryAction
updateCategoryAction
archiveCategoryAction
restoreCategoryAction
```

Estado serializable equivalente al de cuentas:

```ts
export type CategoryActionState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      errorKey: string;
      fieldErrors?: Record<string, string[]>;
    };
```

Cada action:

1. empieza desde `FormData` no confiable;
2. valida ids, strings, color y emoji con Zod frontend;
3. convierte strings opcionales vacíos a `null`;
4. nunca toma `userId` del form;
5. llama sólo funciones de `lib/api/categories.ts`;
6. captura únicamente `ApiError` y relanza otros errores;
7. traduce códigos estables, nunca muestra `body.message`;
8. en éxito ejecuta `revalidatePath("/categories")`;
9. también revalida `/movements` y `/dashboard`, porque allí se mostrarán categorías;
10. retorna success para que el dialog cierre con `useActionState`.

Mapa mínimo:

```ts
const API_ERROR_KEYS: Record<string, string> = {
  CATEGORY_NAME_CONFLICT: "errorNameConflict",
  CATEGORY_ALREADY_ARCHIVED: "errorAlreadyArchived",
  CATEGORY_ALREADY_ACTIVE: "errorAlreadyActive",
  CATEGORY_PARENT_ARCHIVED: "errorParentArchived",
};
```

`VALIDATION_ERROR`, 404 desconocido y códigos no mapeados usan `errorGeneric`. No mostrar texto técnico en inglés.

### Paso 20 — Acciones por fila y confirmaciones

#### Categoría raíz del sistema

- badge “Sistema”;
- sin menú de edición;
- botón “Agregar subcategoría”.

#### Categoría raíz propia activa

- badge “Mía”;
- menú: editar, archivar;
- botón “Agregar subcategoría”.

#### Subcategoría propia activa

- menú: editar, archivar;
- no permite agregar hijas.

#### Archivadas

- mostrar botón “Restaurar”; no ofrecer edición hasta restaurar;
- para raíz, copy indica que restaurará sus subcategorías;
- si una hija tiene padre archivado, deshabilitar “Restaurar” y mostrar la explicación `parentMustBeActive`; el backend mantiene la misma validación autoritativa.

Confirmación de archivo:

- subcategoría: “Dejará de aparecer al registrar movimientos, pero conservará su historial.”
- raíz sin hijas: mismo concepto;
- raíz con N hijas: “También se archivarán N subcategorías.”
- botón destructivo y cancelación clara;
- no cerrar el dialog si la action falla.

Crear `features/categories/components/use-action-dialog.ts` copiando el patrón probado de cuentas y adaptando únicamente los tipos del estado. No refactorizar la feature de cuentas dentro de este spec y no importar código desde `features/accounts`.

### Paso 21 — i18n

Agregar namespace `categories` con las mismas keys en `frontend/src/messages/es.json` y `en.json`. Español es la fuente.

Keys mínimas y copy español:

```json
{
  "eyebrow": "Dinero",
  "title": "Categorías",
  "subtitle": "Organiza tus ingresos y gastos con etiquetas visuales.",
  "create": "Nueva categoría",
  "createTitle": "Nueva categoría",
  "createDescription": "Crea una etiqueta para organizar tus movimientos.",
  "createSubcategory": "Agregar subcategoría",
  "createSubcategoryTitle": "Nueva subcategoría",
  "insideParent": "Dentro de {name}",
  "name": "Nombre",
  "description": "Descripción (opcional)",
  "emoji": "Emoji",
  "color": "Color",
  "customColor": "Color personalizado",
  "inheritAppearance": "Usar la apariencia de {name}",
  "selectEmoji": "Seleccionar emoji {emoji}",
  "selectColor": "Seleccionar color {color}",
  "status": "Estado de categorías",
  "active": "Activas",
  "archived": "Archivadas",
  "ownership": "Origen",
  "all": "Todas",
  "systemOnly": "Del sistema",
  "mineOnly": "Creadas por mí",
  "systemBadge": "Sistema",
  "mineBadge": "Mía",
  "subcategoryBadge": "Subcategoría",
  "searchPlaceholder": "Buscar categorías o subcategorías...",
  "clearFilters": "Limpiar filtros",
  "edit": "Editar categoría",
  "editTitle": "Editar categoría",
  "archive": "Archivar categoría",
  "archiveTitle": "¿Archivar esta categoría?",
  "archiveDescription": "Dejará de aparecer al registrar movimientos, pero conservará su historial.",
  "archiveWithChildren": "También se archivarán {count, plural, one {# subcategoría} other {# subcategorías}}.",
  "restore": "Restaurar categoría",
  "restoreWithChildren": "También se restaurarán sus subcategorías.",
  "parentMustBeActive": "Primero restaura la categoría principal.",
  "actionsFor": "Acciones para {name}",
  "noDescription": "Sin descripción",
  "emptyArchivedTitle": "No tienes categorías archivadas",
  "emptyArchivedDescription": "Las categorías que archives aparecerán aquí.",
  "noResultsTitle": "No encontramos categorías",
  "noResultsDescription": "Prueba cambiando o limpiando los filtros.",
  "saving": "Guardando...",
  "createSuccess": "Categoría creada correctamente.",
  "updateSuccess": "Categoría actualizada correctamente.",
  "archiveSuccess": "Categoría archivada correctamente.",
  "restoreSuccess": "Categoría restaurada correctamente.",
  "errorNameConflict": "Ya existe una categoría activa con ese nombre en este nivel.",
  "errorAlreadyArchived": "La categoría ya está archivada.",
  "errorAlreadyActive": "La categoría ya está activa.",
  "errorParentArchived": "Primero restaura la categoría principal.",
  "errorInvalidEmoji": "Selecciona un solo emoji.",
  "errorInvalidColor": "Selecciona un color válido.",
  "errorGeneric": "No pudimos completar la operación. Intenta de nuevo."
}
```

Crear equivalentes naturales en inglés, sin dejar keys ausentes. Los nombres de categorías sembradas continúan en español en ambos idiomas por la regla de datos no traducidos.

No dejar strings visibles hardcodeados en componentes, incluidos `title`, `aria-label`, mensajes vacíos, badges y labels de swatches.

## Errores comunes que NO cometer

1. No agregar otra tabla para subcategorías.
2. No modificar la migración histórica del seed; crear una migración nueva.
3. No volver a agregar `color`: ya existe.
4. No usar `emoji.length === 1`.
5. No restringir la API a la paleta de la UI con `z.enum`.
6. No guardar emoji/color heredados como copia del padre.
7. No permitir tercer nivel.
8. No permitir editar `parentId`.
9. No permitir escrituras sobre categorías del sistema.
10. No olvidar scoping por usuario en restore/archive/update.
11. No omitir la validación de duplicados en update y restore.
12. No archivar raíz e hijas en operaciones separadas sin transacción.
13. No borrar categorías referenciadas por movimientos.
14. No construir árbol de categorías en routes.
15. No hacer fetch desde Client Components.
16. No llamar `apiFetch` directamente desde una Server Action si falta función de dominio en `lib/api/categories.ts`.
17. No calcular colores ni usar hex literales decorativos fuera de los datos/paletas definidos.
18. No usar color como único indicador de selección.
19. No mostrar mensajes técnicos del backend.
20. No implementar movimientos, presupuestos o reportes “de paso”.

## Criterios de aceptación

### Backend automatizado

- [ ] Schema Drizzle contiene `emoji` nullable.
- [ ] Existe una migración nueva y las 14 categorías del sistema reciben emoji.
- [ ] Migraciones aplican desde una DB vacía sin editar historia.
- [ ] Response de categorías incluye `emoji` nullable.
- [ ] Emoji válido compuesto se acepta; texto y múltiples emojis se rechazan.
- [ ] `GET /categories` conserva default active.
- [ ] `GET /categories?status=archived` sólo devuelve propias archivadas.
- [ ] Crear hija bajo sistema funciona; tercer nivel falla.
- [ ] Duplicados se bloquean en create, update y restore.
- [ ] Sistema y categorías ajenas son inmutables.
- [ ] Archivo/restauración de raíz afecta hijas atómicamente.
- [ ] Restaurar hija exige padre activo.
- [ ] Historial de movimientos conserva FK después de archivar.
- [ ] Todos los tests existentes siguen pasando.

### Frontend funcional

- [ ] `/categories` existe y carga desde Server Component.
- [ ] Activas y archivadas se solicitan en paralelo.
- [ ] Categorías raíz se muestran como cards y las hijas anidadas como filas.
- [ ] Sistema y propias se distinguen con texto/badge, no sólo color.
- [ ] Emoji y color efectivo respetan herencia.
- [ ] Se puede crear raíz con emoji y color.
- [ ] Se puede crear hija bajo raíz propia o sistema.
- [ ] Se puede editar una categoría propia.
- [ ] Se puede archivar/restaurar con confirmación y feedback.
- [ ] No aparecen acciones prohibidas en categorías del sistema.
- [ ] Búsqueda y ownership filter respetan jerarquía.
- [ ] Estados vacío y sin resultados son distintos.
- [ ] Loading usa skeleton y error usa boundary de ruta.
- [ ] No hay fetch fuera de `lib/api/`.
- [ ] Todos los strings visibles están en es/en.
- [ ] No hay errores TypeScript ni lint.

### QA visual y accesibilidad

- [ ] El QA manual se ejecutó en el navegador integrado de Codex, no sólo con requests HTTP.
- [ ] Se inició sesión con el usuario de prueba indicado en este spec.
- [ ] Todos los casos de la matriz manual quedaron registrados como PASS.
- [ ] Se guardaron capturas de los estados visuales principales.
- [ ] Desktop, tablet y móvil sin overflow horizontal.
- [ ] Light y dark mode conservan legibilidad.
- [ ] Cards no se sienten saturadas ni contienen cards anidadas innecesarias.
- [ ] Emojis tienen tamaño consistente y no deforman filas.
- [ ] Colores se ven como acento sutil, no como grandes fondos saturados.
- [ ] Teclado permite abrir dialogs, menús y elegir emoji/color.
- [ ] Foco visible en todos los controles.
- [ ] Swatches y emojis tienen labels accesibles y estado seleccionado.
- [ ] Dialogs retienen foco, cierran con Escape y no cierran ante error.
- [ ] Feedback de éxito/error se anuncia con `aria-live`.
- [ ] Categorías con nombre/description largos truncadas o envueltas sin romper layout.

### Verificación final

Ejecutar desde backend:

```bash
npm run typecheck
npm test
npm run build
```

Ejecutar desde frontend:

```bash
pnpm test
pnpm lint
pnpm build
```

### QA manual obligatorio en el navegador integrado de Codex

Este QA no es opcional y no puede sustituirse por tests automatizados, `curl`, inspección de código o un navegador externo. Después de que typecheck, tests, lint y builds pasen, el agente ejecutor debe levantar la aplicación y controlar **el navegador integrado de Codex** para completar todos los flujos descritos abajo.

Si el agente dispone de la skill/plugin Browser, debe leer sus instrucciones y usar específicamente el binding del navegador integrado (`iab`). No sustituirlo por Chrome, Playwright standalone, Selenium ni requests HTTP para simular los flujos visuales. Las herramientas de terminal se usan sólo para levantar servicios, consultar salud/logs y corregir fallos; las acciones de usuario se realizan en la UI.

#### 1. Levantar el entorno de QA

1. Verificar que existe `.env` en la raíz con `BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3001`. Si no existe, crearlo desde `.env.example` sin sobrescribir secretos o configuración ya presentes.
2. Levantar Postgres y backend desde la raíz:

   ```bash
   docker compose up -d postgres backend
   ```

3. Esperar a que migraciones y `/health` estén listos. Revisar `docker compose logs backend` si el healthcheck falla.
4. Levantar el frontend en una sesión de terminal persistente:

   ```bash
   cd frontend
   pnpm dev
   ```

5. Abrir `http://localhost:3001` en el navegador integrado de Codex.
6. No continuar si la pantalla muestra error de conexión, hydration, migración o autenticación. Corregir primero y volver a cargar.

No bajar ni borrar volúmenes de PostgreSQL para “limpiar” el QA. El volumen puede contener datos del usuario y las operaciones destructivas amplias no están autorizadas por este spec.

#### 2. Usuario de prueba

Usar exactamente:

```text
Email: prueba@gmail.com
Contraseña: 123456789
```

Flujo:

1. intentar iniciar sesión desde `/login`;
2. si el usuario no existe, crearlo una sola vez desde `/register` usando nombre `Prueba`, el mismo email y la misma contraseña;
3. iniciar sesión y confirmar que se llega al área privada;
4. navegar a Categorías usando el sidebar, no escribiendo directamente la URL para esta primera entrada;
5. confirmar que `/categories` queda seleccionada en la navegación.

Estas credenciales son exclusivamente de desarrollo/QA. No cambiarlas, no usarlas en producción y no incluir cookies/tokens en capturas o reportes.

#### 3. Convención de datos de prueba

Para que el QA pueda repetirse sin colisiones, calcular un sufijo visible con fecha y hora al comenzar, por ejemplo `0806-1430`, y usarlo en todos los nombres:

```text
QA Hogar 0806-1430
QA Mascotas 0806-1430
QA Gasolina 0806-1430
```

No reutilizar nombres de ejecuciones anteriores. No hacer hard delete por DB para limpiar. En este dominio, la acción humana equivalente a “borrar” es **archivar**; el QA debe comprobar archivo y restauración, nunca introducir un endpoint o botón de borrado físico.

#### 4. Registro de evidencia

Antes de interactuar, crear una matriz de resultados con columnas:

```text
ID | Flujo | Resultado esperado | Resultado observado | PASS/FAIL | Evidencia
```

Durante el QA:

- observar el estado visible después de cada submit; no asumir éxito sólo porque ocurrió un click;
- comprobar que los dialogs cierren únicamente en éxito;
- recargar la página en puntos indicados para verificar persistencia real;
- revisar errores visibles de consola/red cuando el navegador integrado lo permita;
- tomar capturas como mínimo del estado inicial, categorías creadas, edición visual, archivadas, dark mode y móvil;
- no capturar cookies, tokens ni valores sensibles;
- si un caso falla, registrar FAIL, corregir la implementación y repetir ese caso y sus regresiones hasta obtener PASS;
- no marcar el spec como completado con casos fallidos o “no probados”.

#### 5. Matriz exhaustiva de flujos

Ejecutar en este orden para que cada bloque prepare los datos del siguiente.

##### A. Acceso, carga y estado inicial

- **CAT-QA-001 — Navegación:** entrar desde el sidebar. Esperado: URL `/categories`, título, subtítulo y CTA “Nueva categoría”.
- **CAT-QA-002 — Seeds:** confirmar visualmente las 14 categorías del sistema. Esperado: cada una tiene nombre, emoji, color y badge Sistema.
- **CAT-QA-003 — Protección del sistema:** abrir las acciones de al menos `Transporte` y `Mercado`. Esperado: no existen Editar ni Archivar; sí existe Agregar subcategoría.
- **CAT-QA-004 — Jerarquía inicial:** comprobar que las cards no tienen cards anidadas y que cualquier hija existente aparece como fila dentro de su raíz.
- **CAT-QA-005 — Recarga:** recargar la página. Esperado: no hay flicker roto, hydration error, 404 ni pérdida de sesión.

##### B. Validación y cancelación de formularios

- **CAT-QA-010 — Cancelar raíz:** abrir “Nueva categoría”, cambiar campos y cancelar. Esperado: no se crea nada.
- **CAT-QA-011 — Nombre vacío:** enviar nombre vacío. Esperado: error junto al campo, dialog abierto y sin request exitoso.
- **CAT-QA-012 — Nombre demasiado largo:** intentar más de 60 caracteres. Esperado: error localizado y sin creación.
- **CAT-QA-013 — Descripción demasiado larga:** intentar más de 300 caracteres. Esperado: error localizado.
- **CAT-QA-014 — Cancelar subcategoría:** abrir desde una raíz del sistema y cancelar. Esperado: no cambia el conteo de hijas.
- **CAT-QA-015 — Escape:** abrir cada tipo de dialog y cerrarlo con Escape. Esperado: foco vuelve al trigger correcto y no se persisten cambios.

##### C. Crear varias categorías raíz

- **CAT-QA-020 — Raíz completa:** crear `QA Hogar <sufijo>` con descripción, emoji `🏠` y un swatch de color. Esperado: aparece como card propia con badge Mía y datos correctos.
- **CAT-QA-021 — Raíz con otro estilo:** crear `QA Mascotas <sufijo>` con emoji `🐾`, otro color y descripción. Esperado: apariencia distinta y consistente.
- **CAT-QA-022 — Color personalizado:** crear `QA Personalizada <sufijo>` usando el control de color personalizado, no un swatch predefinido. Esperado: el color elegido se refleja en el acento visual.
- **CAT-QA-023 — Descripción opcional:** crear `QA Sin descripción <sufijo>` sin descripción. Esperado: creación exitosa y copy/espacio visual correcto.
- **CAT-QA-024 — Persistencia:** recargar. Esperado: las cuatro raíces permanecen con emoji, color y descripción correctos.
- **CAT-QA-025 — Duplicado raíz:** intentar otra raíz con el nombre exacto `QA Hogar <sufijo>`. Esperado: mensaje traducido de conflicto, dialog abierto y una sola card con ese nombre.

##### D. Crear subcategorías y comprobar herencia

- **CAT-QA-030 — Hija bajo sistema heredada:** desde `Transporte`, crear `QA Gasolina <sufijo>` dejando activa la herencia. Esperado: hija propia dentro de Transporte con emoji/color efectivos del padre.
- **CAT-QA-031 — Hija bajo sistema personalizada:** desde `Transporte`, crear `QA Parqueadero <sufijo>`, desactivar herencia, elegir emoji/color propios. Esperado: apariencia propia.
- **CAT-QA-032 — Hija bajo raíz propia heredada:** debajo de `QA Hogar <sufijo>`, crear `QA Arriendo <sufijo>` heredando. Esperado: se anida en la card correcta.
- **CAT-QA-033 — Hija bajo raíz propia personalizada:** debajo de `QA Hogar <sufijo>`, crear `QA Reparaciones <sufijo>` con emoji `🔧` y color distinto.
- **CAT-QA-034 — Sin tercer nivel:** abrir acciones de una subcategoría. Esperado: no existe “Agregar subcategoría”.
- **CAT-QA-035 — Duplicado entre hermanas:** intentar otra `QA Arriendo <sufijo>` bajo `QA Hogar <sufijo>`. Esperado: conflicto y ninguna duplicación.
- **CAT-QA-036 — Mismo nombre, otro padre:** crear `QA Arriendo <sufijo>` debajo de `QA Mascotas <sufijo>`. Esperado: permitido porque el padre es diferente.
- **CAT-QA-037 — Persistencia jerárquica:** recargar. Esperado: todas las hijas siguen bajo su padre correcto y la herencia visual se conserva.

##### E. Editar todos los campos y apariencia

- **CAT-QA-040 — Cancelar edición:** abrir edición de `QA Mascotas <sufijo>`, cambiar todo y cancelar. Esperado: ningún dato cambia.
- **CAT-QA-041 — Editar raíz:** cambiar `QA Mascotas <sufijo>` a `QA Mascotas editada <sufijo>`, modificar descripción, emoji y elegir otro swatch. Esperado: card actualizada y feedback de éxito.
- **CAT-QA-042 — Cambiar a color personalizado:** volver a editar la misma raíz y elegir otro valor con `<input type=color>`. Esperado: nuevo acento después de guardar.
- **CAT-QA-043 — Editar hija heredada a propia:** editar `QA Gasolina <sufijo>`, desactivar herencia y escoger emoji `⛽` y color propio. Esperado: deja de verse como el padre.
- **CAT-QA-044 — Volver a heredar:** editar la misma hija y activar herencia. Esperado: vuelve a mostrar emoji/color efectivos de Transporte.
- **CAT-QA-045 — Limpiar descripción:** editar una categoría con descripción y dejarla vacía. Esperado: queda `null`/sin descripción sin errores.
- **CAT-QA-046 — Rename conflict:** intentar renombrar `QA Personalizada <sufijo>` como `QA Hogar <sufijo>`. Esperado: conflicto, dialog abierto y ambos nombres originales intactos.
- **CAT-QA-047 — Parent inmutable:** en edición de una hija no debe existir control para cambiar padre.
- **CAT-QA-048 — Persistencia de edición:** recargar y comprobar todos los cambios anteriores.

##### F. Búsqueda, filtros y estados sin resultados

- **CAT-QA-050 — Buscar raíz:** buscar `QA Hogar`. Esperado: aparece la raíz y sus hijas relevantes.
- **CAT-QA-051 — Buscar hija:** buscar `Gasolina`. Esperado: aparece Transporte como contexto y sólo la hija coincidente.
- **CAT-QA-052 — Tildes/case:** usar variaciones de mayúsculas y texto sin tilde sobre una categoría que la contenga. Esperado: mismo resultado.
- **CAT-QA-053 — Buscar descripción:** buscar una palabra exclusiva de una descripción. Esperado: aparece la categoría correspondiente.
- **CAT-QA-054 — Filtro sistema:** seleccionar Del sistema. Esperado: categorías propias se ocultan; acciones del sistema siguen protegidas.
- **CAT-QA-055 — Filtro propias:** seleccionar Creadas por mí. Esperado: raíces propias y padres sistema usados como contexto para hijas propias.
- **CAT-QA-056 — Combinación:** combinar búsqueda + ownership. Esperado: intersección correcta.
- **CAT-QA-057 — Sin resultados:** buscar un texto imposible. Esperado: estado “No encontramos categorías” y CTA Limpiar filtros.
- **CAT-QA-058 — Limpiar:** pulsar Limpiar filtros. Esperado: búsqueda vacía, ownership Todas y colección completa.

##### G. Archivar — acción equivalente a borrar

- **CAT-QA-060 — Cancelar archivo de hija:** iniciar archivo de `QA Parqueadero <sufijo>` y cancelar. Esperado: permanece activa.
- **CAT-QA-061 — Archivar hija:** confirmar. Esperado: desaparece de activas, el padre Transporte permanece y aparece feedback.
- **CAT-QA-062 — Ver hija archivada:** cambiar a Archivadas. Esperado: hija visible con contexto de Transporte y botón Restaurar.
- **CAT-QA-063 — Archivar raíz con hijas, cancelar:** iniciar archivo de `QA Hogar <sufijo>`. Esperado: confirmación menciona el número correcto de hijas; cancelar no cambia nada.
- **CAT-QA-064 — Archivar raíz con hijas:** confirmar archivo. Esperado: raíz e hijas desaparecen de Activas y aparecen en Archivadas.
- **CAT-QA-065 — Padre archivado bloquea hija:** en Archivadas, la restauración individual de una hija de `QA Hogar <sufijo>` está deshabilitada y explica que primero debe restaurarse el padre.
- **CAT-QA-066 — Sistema no archivable:** volver a Activas y reconfirmar que ninguna raíz del sistema expone Archivar.
- **CAT-QA-067 — Persistencia de archivo:** recargar y confirmar que el estado archivado persiste.

##### H. Restaurar

- **CAT-QA-070 — Restaurar hija individual:** restaurar `QA Parqueadero <sufijo>` cuyo padre sistema está activo. Esperado: vuelve dentro de Transporte.
- **CAT-QA-071 — Restaurar raíz en cascada:** restaurar `QA Hogar <sufijo>`. Esperado: la raíz y todas sus hijas vuelven a Activas.
- **CAT-QA-072 — Verificar apariencia restaurada:** emoji, color, descripción e herencia permanecen iguales después de restaurar.
- **CAT-QA-073 — Persistencia de restauración:** recargar y comprobar estado activo.
- **CAT-QA-074 — Conflicto al restaurar:** archivar `QA Sin descripción <sufijo>`, crear una nueva raíz activa con el mismo nombre e intentar restaurar la anterior. Esperado: error `errorNameConflict` traducido y ambas filas conservan su estado.
- **CAT-QA-075 — Resolver conflicto:** renombrar la raíz activa conflictiva, restaurar la archivada y comprobar éxito.

##### I. Feedback, pending y resistencia a doble submit

- **CAT-QA-080 — Pending:** en una creación/edición observar “Guardando…” y botón deshabilitado mientras responde.
- **CAT-QA-081 — Doble click:** intentar doble click rápido sobre submit. Esperado: una sola categoría, sin duplicados.
- **CAT-QA-082 — Error conserva dialog:** provocar conflicto. Esperado: dialog permanece abierto, valores no se pierden y error es visible.
- **CAT-QA-083 — Éxito cierra dialog:** operación válida. Esperado: dialog cierra, feedback `role=status` aparece y datos se revalidan.
- **CAT-QA-084 — Reload después de feedback:** recargar. Esperado: feedback efímero puede desaparecer, datos persistidos permanecen.

##### J. Responsive, dark mode, idioma y teclado

- **CAT-QA-090 — Desktop:** probar alrededor de 1440×900. Esperado: tres columnas cuando haya espacio, alineación limpia y sin cards comprimidas.
- **CAT-QA-091 — Tablet:** probar alrededor de 768×1024. Esperado: dos columnas, toolbar usable y sin overflow.
- **CAT-QA-092 — Móvil:** probar alrededor de 390×844. Esperado: una columna, CTA/dialogs/paletas utilizables y sin scroll horizontal.
- **CAT-QA-093 — Nombres largos:** verificar una categoría con nombre/description cercanos al máximo. Esperado: wrapping o truncado controlado.
- **CAT-QA-094 — Dark mode:** activar tema oscuro y recorrer cards, menú, dialog, emoji picker, color picker, tabs y archivadas. Esperado: contraste correcto y acentos no saturados.
- **CAT-QA-095 — Light mode:** volver a claro y comprobar que no quedan estilos inline incompatibles.
- **CAT-QA-096 — Inglés:** cambiar idioma a inglés. Esperado: todos los copies de la feature cambian; nombres sembrados permanecen en español según límite conocido.
- **CAT-QA-097 — Acción en inglés:** crear o editar una categoría en inglés. Esperado: feedback y errores en inglés.
- **CAT-QA-098 — Teclado:** navegar tabs, búsqueda, menú, swatches y emojis con teclado; activar con Enter/Espacio y cerrar con Escape. Esperado: foco visible y orden lógico.
- **CAT-QA-099 — Foco tras dialog:** cerrar/cancelar dialog. Esperado: foco vuelve al trigger que lo abrió.

##### K. Regresión fuera de categorías

- **CAT-QA-100 — Cuentas:** navegar a `/accounts`. Esperado: pantalla carga y las acciones existentes siguen disponibles.
- **CAT-QA-101 — Dashboard:** navegar a `/dashboard`. Esperado: carga sin error.
- **CAT-QA-102 — Navegación:** volver a `/categories` desde sidebar. Esperado: sesión activa y datos intactos.
- **CAT-QA-103 — Logout/login:** cerrar sesión, volver a iniciar con `prueba@gmail.com` / `123456789` y regresar a Categorías. Esperado: datos del usuario persisten y no se mezclan con otro usuario.

#### 6. Estado final de los datos de QA

Al terminar:

1. dejar activas `QA Hogar <sufijo>` con sus hijas y `QA Mascotas editada <sufijo>` para evidencia visual;
2. dejar archivadas `QA Personalizada <sufijo>` y la raíz creada para resolver el conflicto, comprobando así ambos tabs;
3. no tocar ni intentar limpiar las categorías del sistema;
4. no ejecutar SQL manual de borrado;
5. anotar en el reporte el sufijo utilizado para distinguir esta ejecución.

#### 7. Entregable del QA

El agente ejecutor debe incluir en su entrega final:

- URL probada;
- usuario probado, sin repetir la contraseña en el reporte final;
- sufijo usado;
- tabla con todos los IDs definidos en esta matriz (`CAT-QA-001`…`CAT-QA-103`) y estado PASS/FAIL;
- capturas principales enlazadas con ruta absoluta cuando estén disponibles;
- errores encontrados, causa y corrección aplicada;
- confirmación de que se repitieron los flujos afectados después de cada fix;
- resultado de backend tests/typecheck/build y frontend test/lint/build;
- confirmación explícita de desktop, tablet, móvil, light, dark, español e inglés.

Un resumen como “QA realizado correctamente” sin la matriz y evidencia no cumple este spec.

## Al completar

1. Cambiar la cabecera a `Estado: ✅ completado — YYYY-MM-DD`.
2. Actualizar `docs/DATABASE.md` como se indicó, sin duplicar la fuente de verdad del schema.
3. Verificar `git diff` y que no se hayan modificado migraciones históricas.
4. No marcar completado si falta QA visual, migración, tests o traducciones.
