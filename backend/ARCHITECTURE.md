# backend/ARCHITECTURE.md

Documento normativo del backend. Toda modificación bajo `backend/` DEBE
cumplir estas reglas además de `ARCHITECTURE.md` en la raíz. Ante un conflicto,
prevalece la arquitectura global.

Este documento describe exclusivamente la implementación actual.

## 1. Stack

| Pieza         | Implementación actual                 | Ubicación o función                                        |
| ------------- | ------------------------------------- | ---------------------------------------------------------- |
| Runtime       | Node.js 22 + TypeScript strict        | ESM e imports relativos con extensión `.js`                |
| API           | Fastify + `fastify-type-provider-zod` | Servidor y registro de módulos en `src/http/server.ts`     |
| Validación    | Zod                                   | Requests, responses y variables de entorno                 |
| Persistencia  | Drizzle + PostgreSQL 17               | Schemas en módulos y cliente compartido en `src/infra/db/` |
| Autenticación | Better Auth con adapter Drizzle       | Implementación en `src/infra/auth/`                        |
| Logging       | Pino mediante Fastify                 | Logs estructurados de requests y errores inesperados       |
| Testing       | Vitest + Testcontainers               | Unitarios puros e integración contra PostgreSQL real       |

## 2. Estilo: monolito modular con vertical slices

El backend se organiza por dominio, no por capas técnicas globales.

```text
backend/src/
  modules/
    accounts/
    categories/
    credit-cards/
    health/
    movements/
    users/
  infra/
    auth/
    db/
  http/
  shared/
  config/
```

Responsabilidades:

- `modules/`: reglas y operaciones de cada dominio.
- `infra/`: autenticación y conexión a PostgreSQL.
- `http/`: construcción de Fastify y manejo global de errores.
- `shared/`: errores y helpers reutilizados por varios dominios.
- `config/`: lectura y validación centralizada del entorno.

## 3. Estructura de un módulo

```text
modules/<nombre>/
  <nombre>.routes.ts
  <nombre>.service.ts
  <nombre>.schema.ts
  <nombre>.types.ts
  <nombre>.errors.ts
  <nombre>.calc.ts
  <nombre>.test.ts
```

Un módulo solo crea los roles que necesita y permanece plano mientras sea
legible. Cuando contiene varias operaciones, los archivos conservan la
convención `<entidad>.<rol>.ts`, como `account-lifecycle.service.ts`. No crear
subdirectorios genéricos `routes/`, `services/` o `models/` dentro de un
dominio.

## 4. Reglas de implementación

1. **Las rutas no contienen lógica de negocio.** Validan input, llaman al
   servicio y construyen la respuesta HTTP.
2. **Los servicios usan Drizzle directamente.** No crear repositorios ni
   interfaces artificiales para PostgreSQL.
3. **Un módulo no consulta las tablas de otro módulo.** La coordinación se hace
   mediante sus servicios públicos. Importar schemas para declarar claves
   foráneas sí está permitido.
4. **Los errores de dominio son tipados.** El error handler global los traduce
   a HTTP. Los errores inesperados se registran y responden `500` sin exponer
   detalles internos.
5. **Toda configuración se valida con Zod al arrancar.** No usar `process.env`
   fuera de `src/config/env.ts`.
6. **El logging es estructurado.** No usar `console.log` en código de
   aplicación.
7. **No existen `BaseService` ni clases CRUD genéricas.** Lo compartido se
   resuelve con helpers componibles.
8. **Toda consulta privada se limita por `userId`.** Nunca buscar una fila de
   negocio únicamente por su id.
9. **Los cálculos de dinero son funciones puras.** Reciben datos y devuelven
   resultados sin acceder a la base ni producir efectos secundarios.
10. **Cada respuesta HTTP usa schemas Zod.** No duplicar esos contratos con
    JSON Schema escrito manualmente.
11. **Zod valida bordes no confiables.** No ejecutar `parse()` sobre salidas
    internas que ya garantiza TypeScript.
12. **Las rutas se montan con `app.register(routes, { deps })`.** Las
    dependencias entran mediante `opts`; no invocar directamente una función de
    rutas.
13. **El cierre es ordenado.** `SIGTERM` y `SIGINT` llaman `app.close()` y el
    pool de PostgreSQL se libera mediante `onClose`.

## 5. Persistencia y migraciones

- Cada dominio declara sus tablas en su archivo `.schema.ts`.
- `src/infra/db/schema.ts` reúne los schemas que consume Drizzle.
- Las migraciones viven en `src/infra/db/migrations/` y se aplican en orden.
- Una migración ya incorporada no se edita; todo cambio crea una migración
  nueva.
- El dinero se persiste como enteros en unidades mínimas y los balances se
  calculan desde movimientos, según `docs/DATABASE.md`.
- Producción obtiene `DATABASE_URL` desde Compose; el código no conoce
  hostnames o credenciales de infraestructura.

## 6. Autenticación y autorización

- Better Auth posee las tablas `user`, `session`, `account` y `verification`.
- Las rutas privadas usan `requireAuth` y reciben el usuario autenticado desde
  el request.
- Autenticación no reemplaza autorización: cada servicio conserva el filtro
  por `userId` definido en la regla 8.
- Las cookies y orígenes confiables se configuran mediante variables validadas.
- Nunca aceptar un `userId` enviado por el cliente como identidad efectiva de
  una operación.

## 7. Testing

Los tests protegen cálculos monetarios, aislamiento entre usuarios,
autenticación y operaciones persistentes.

1. **Unitarios puros:** cálculos y utilidades sin base de datos ni mocks.
2. **Integración:** servidor, rutas y servicios contra un PostgreSQL efímero
   levantado con Testcontainers y con las migraciones de la aplicación.

Reglas:

- No mockear Drizzle ni PostgreSQL.
- Usar usuarios independientes para demostrar el scoping.
- Verificar éxito, validaciones, ownership y transacciones relevantes.
- Los checks obligatorios son `npm test`, `npm run typecheck` y
  `npm run build`.

## 8. Salud, errores y cierre

- `/health` ejecuta `SELECT 1` contra PostgreSQL con timeout de dos segundos.
- Responde `200` con `db: "ok"` o `503` con `db: "error"`.
- Compose usa `/health` como healthcheck del contenedor.
- Los errores inesperados se registran mediante Fastify; los errores de dominio
  esperados se devuelven sin registrarlos como fallos internos.
- El entrypoint maneja `SIGTERM` y `SIGINT`; los recursos se liberan mediante
  hooks de Fastify.

El monitoreo externo y los procedimientos de diagnóstico están en
`docs/operations/monitoring-and-security.md`.

## 9. Checklist para modificar una feature

1. Identificar el módulo dueño de la operación.
2. Si cambia persistencia, actualizar el schema y crear una migración nueva.
3. Implementar reglas en servicios y cálculos monetarios en funciones puras.
4. Exponer rutas delgadas con schemas Zod y autenticación cuando corresponda.
5. Mantener el scoping por `userId` en lecturas y escrituras.
6. Agregar o actualizar tests unitarios y de integración.
7. Si cambia el contrato HTTP, actualizar el cliente tipado del frontend.
8. Ejecutar tests, typecheck y build del backend.
9. Si el cambio afecta al frontend, ejecutar también sus checks obligatorios.

## 10. Anti-patrones prohibidos

- Capas globales `controllers/`, `services/` o `models/`.
- Repositorios artificiales o herencia CRUD genérica.
- Mockear Drizzle o PostgreSQL en tests de servicios.
- Consultas privadas sin `userId`.
- Lógica de negocio en rutas Fastify.
- `process.env` fuera del módulo de configuración.
- JSON Schema escrito a mano junto a schemas Zod.
- `Zod.parse()` sobre resultados internos tipados.
- Invocar rutas directamente en lugar de `app.register`.
- Credenciales hardcodeadas.
- Cálculos monetarios duplicados fuera de los módulos responsables.
