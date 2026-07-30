# ARCHITECTURE.md

Documento normativo. Toda feature nueva (escrita por humano o por AI) DEBE seguir estas reglas.

## 1. Stack

| Pieza          | Elección                                                                                                                           | Nota                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime        | Node.js + TypeScript (strict)                                                                                                      | ESM. Imports relativos con extensión `.js` (regla de ESM: la ruta apunta al output). Sin path aliases; si algún día se adoptan, subpath imports nativos (`#`), nunca plugins de reescritura |
| Framework HTTP | Fastify + `fastify-type-provider-zod`                                                                                              | Compiladores de Zod registrados en `http/server.ts`; las rutas definen schemas con Zod                                                                                                      |
| ORM            | Drizzle                                                                                                                            | Schema en TS, migraciones con drizzle-kit                                                                                                                                                   |
| DB             | PostgreSQL self-hosted (Docker)                                                                                                    | Solo en red interna de compose, sin puerto expuesto al host. Versión mayor pineada (`postgres:17`)                                                                                          |
| Backups DB     | Sidecar de backup nocturno → storage externo S3-compatible (DO Spaces)                                                             | Parte del entorno, NO opcional. Restore probado trimestralmente                                                                                                                             |
| Validación     | Zod                                                                                                                                | Solo en bordes NO confiables: input HTTP, webhooks, respuestas de APIs externas, env                                                                                                        |
| Auth           | Better Auth (librería, en el mismo Postgres)                                                                                       | Adapter en `infra/auth/`. Solo autentica HTTP/web; WhatsApp usa vinculación propia                                                                                                          |
| WhatsApp       | WAHA / Evolution API (no oficial)                                                                                                  | Proveedor desechable, detrás de interfaz. Número dedicado, nunca personal                                                                                                                   |
| AI             | Detrás de interfaz `AIProvider`                                                                                                    | Proveedor intercambiable                                                                                                                                                                    |
| Jobs/Cron      | In-process (node-cron)                                                                                                             | La cola es un adapter: migrable a BullMQ si crece                                                                                                                                           |
| Deploy         | Docker Compose en VPS: backend + frontend (Next.js) + Postgres + backup sidecar + WhatsApp provider + Caddy (reverse proxy, HTTPS) | Ver reglas de Docker en §3.1                                                                                                                                                                |

## 2. Estilo arquitectónico

**Modular monolith con vertical slices.** Se organiza por dominio, no por capa técnica.

```
src/
  modules/          # un directorio por dominio de negocio
    accounts/
    movements/
    commissions/
    categories/
    conversations/  # historial del agente (es dominio, no infra)
  agent/            # Agent Core: cerebro del bot
    core/           # loop del LLM, orquestación
    capabilities/   # tools expuestas al modelo
    prompts/
  channels/         # adapters de entrada del agente
    whatsapp/       # webhook, resolución de usuario, normalización
    web/            # endpoint chat para el frontend (SSE)
  infra/            # adapters de salida
    ai/             # implementación de AIProvider
    messaging/      # implementación de MessagingProvider (WAHA/etc.)
    db/             # cliente Drizzle, migraciones
    auth/
  jobs/             # tareas programadas (resumen semanal, etc.)
  http/             # server Fastify, plugins, error handler global
  shared/           # errores de dominio, tipos comunes, utils (mínimo)
  config/           # env validado con Zod al arranque; falla rápido
```

### Estructura interna de cada módulo

```
modules/<nombre>/
  <nombre>.routes.ts    # rutas Fastify: parsear, validar, llamar servicio. CERO lógica
  <nombre>.service.ts   # casos de uso. Aquí vive la lógica de negocio
  <nombre>.schema.ts    # schema Drizzle del módulo
  <nombre>.types.ts     # tipos y Zod schemas
  <nombre>.test.ts
```

**Crecimiento interno del módulo:** plano hasta que duela → si un módulo tiene varias entidades, dividir por entidad manteniendo la convención `<entidad>.<rol>.ts` (ej. `subcategories.service.ts` dentro de `categories/`) → promover a módulo propio solo cuando la entidad acumula lógica de dominio propia. Nunca subdividir por tipo técnico (`routes/`, `services/`) dentro de un módulo.

## 3. Reglas de capas

1. **Routes/controllers nunca contienen lógica de negocio.** Solo: validar input → llamar servicio → mapear respuesta.
2. **Servicios usan Drizzle directamente.** NO crear repositorios con interfaces para la DB (sobre-ingeniería para este proyecto).
3. **Abstraer SOLO bordes volátiles:** `AIProvider`, `MessagingProvider`, auth, cola de jobs. Todo lo demás es directo.
4. **Un módulo nunca toca las tablas de otro módulo.** Comunicación entre módulos = llamar al servicio público del otro.
5. **Errores:** errores de dominio tipados (`NotFoundError`, `ValidationError`, `InsufficientFundsError`...) lanzados desde servicios; un error handler global en `http/` los traduce a HTTP. Nunca `try/catch` con respuestas ad-hoc en rutas.
6. **Config:** todas las env vars se validan con Zod en `config/` al arranque. Ningún `process.env` fuera de ahí.
7. **Logging estructurado** (pino, incluido en Fastify). Nunca `console.log`.
8. **Prohibido `BaseService` / herencia genérica CRUD.** Los servicios expresan casos de uso con nombres de negocio (`registerMovement`, `settleCommission`), no verbos HTTP genéricos. Lo repetitivo se resuelve con **helpers componibles** en `shared/db-helpers.ts` (`findOrThrow`, paginación, scoping), que los servicios usan — nunca clases de las que heredan.
9. **Toda query se scopea por usuario.** Cada consulta a datos de negocio filtra por `userId` usando el helper de scoping. Nunca un `where` por id sin ownership.
10. **La lógica de cálculo se escribe como funciones puras** (datos entran, resultado sale, sin DB); el servicio las orquesta. Esto es un requisito de diseño para testabilidad, no una preferencia.
11. **Rutas con `fastify-type-provider-zod`:** un solo schema Zod por respuesta (usar `z.literal` para pares estado/código imposibles de cruzar). Prohibido escribir JSON Schema a mano duplicando un schema Zod.
12. **Zod solo valida bordes no confiables** (input HTTP, webhooks, APIs externas, env). Nunca `parse()` sobre salidas del propio código: eso lo garantiza TypeScript.
13. **Los módulos HTTP se montan con `app.register(xRoutes, { deps })`.** Dependencias vía el objeto `opts`; nunca invocar la función de rutas directamente (rompe la cola de arranque y la encapsulación de Fastify).
14. **Graceful shutdown:** el entrypoint (`index.ts`) maneja `SIGTERM`/`SIGINT` con `app.close()`. Todo recurso (pool de DB, clientes) se libera vía hooks `onClose`, nunca con cierres sueltos.

### 3.1 Reglas de Docker/Compose

- Los compose **interpolan credenciales desde el `.env` de la raíz**: `${VAR:?}` en prod (falla si falta), `${VAR:-default}` en dev. Prohibido hardcodear valores duplicados en el YAML.
- **Topología de dos redes en prod:** `internal` (con `internal: true`) para Postgres, que vive SOLO ahí sin puertos publicados; `web` para servicios que necesitan salida a internet o entrada vía Caddy. El backend está en ambas.
- La topología (hostnames de servicios como `postgres`) vive en el compose, no en el `.env`; en el `.env` viven las credenciales.

## 4. El agente (bot)

El bot es un subsistema central, independiente del canal.

### Agent Core

- Contrato de entrada: `{ userId, conversationId, content: MessageContent[] }` donde `MessageContent = texto | imagen | audio`. Nunca un string plano (prepara multimodal).
- No sabe si el mensaje vino de WhatsApp, web o un cron. Devuelve la respuesta del agente.
- El historial de conversación se persiste en DB (`modules/conversations`), nunca en memoria.

### Channel adapters (`channels/`)

- WhatsApp: recibe webhook → responde 200 inmediato → procesa async. Resuelve teléfono → userId. Descarga media. Normaliza al contrato del Core. Formatea la respuesta de vuelta.
- Web: endpoint HTTP con streaming (SSE) que llama al mismo Core.
- Los adapters también soportan **envío saliente iniciado por el sistema** (resúmenes proactivos).

### Capabilities (tools del modelo)

- El AI **nunca** llama servicios de dominio directamente. Solo capabilities.
- Cada capability: nombre, descripción, Zod schema de parámetros (genera la definición del tool), y ejecución que envuelve el servicio de dominio con restricciones propias.
- **El AI nunca recibe ni elige `userId`**: se inyecta desde el contexto de la conversación.
- Capabilities de escritura declaran su modo: `direct` o `requires_confirmation`, según riesgo.
- Todo dato creado por el agente se marca con `source: 'agent'` + referencia a la conversación (auditoría).

### Proactividad

- `jobs/` contiene los crons (ej. resumen semanal). Un job invoca el Agent Core con un system prompt específico y empuja el resultado por el canal preferido del usuario (módulo de preferencias de notificación).

## 5. Reglas para el proveedor de WhatsApp

- Es infraestructura desechable. **Ningún código fuera de `infra/messaging/` y `channels/whatsapp/` puede importar o conocer su API.**
- Cambiar de proveedor (WAHA → Evolution → Meta Cloud API) solo debe tocar `infra/messaging/`.
- El bot usa un número dedicado, nunca el personal.
- **El número de teléfono NO es identidad confiable.** El vínculo teléfono → `userId` se crea solo por flujo de verificación explícito (código generado en la web autenticada, enviado al bot). Mensajes de números no vinculados: rechazar, nunca crear usuarios ni exponer datos.

## 6. Testing

Herramienta: **Vitest**. Criterio: proteger la lógica que puede costar dinero o datos, no perseguir cobertura.

Tres niveles:

1. **Unit tests puros** — funciones de cálculo (comisiones, saldos, categorización). Sin mocks, sin DB. Son posibles porque la regla 10 obliga a escribir el cálculo como función pura.
2. **Integration tests de servicios — contra Postgres real** (Testcontainers o contenedor de test en compose, migraciones Drizzle aplicadas por suite). Cubren los procesos relevantes: "crear movimiento actualiza saldo", "no se puede eliminar cuenta con movimientos", etc.
3. **Tests de capabilities — sin el LLM.** Cada capability se testea como función determinista: validación del schema, restricciones (montos, modo confirmación), inyección forzada del `userId`. El comportamiento del modelo NO se testea aquí (eso sería un sistema de evals aparte).

Reglas:

- **Nunca mockear Drizzle/el ORM.** Los tests de servicios van contra Postgres real.
- **Solo se mockean los adapters de infra** (`AIProvider`, `MessagingProvider`): son el borde volátil.
- Se testean servicios y capabilities, no rutas (las rutas son delgadas por la regla 1).

## 7. Observabilidad y límites

Normativo para el código. Lo operacional (proveedores de uptime, configuración de alertas, runbooks) vive en `docs/OPERATIONS.md`.

### Salud y errores

- El backend expone `/health`, que verifica sus dependencias: conexión a DB (con timeout de 2s; el check captura errores y responde 503, nunca lanza ni cuelga) y estado de la sesión del proveedor de WhatsApp. Es el healthcheck de Docker Compose y del monitor externo de uptime.
- **Errores inesperados** se reportan a error tracking (Sentry) desde el error handler global. **Errores de dominio esperados** (`NotFoundError`, etc.) NO se reportan: son flujo normal.
- Todo **job crítico** (backup, resumen semanal) reporta un heartbeat al terminar (ping a healthchecks.io o equivalente). La alerta es por **ausencia** de heartbeat, no por presencia de error.

### Control de daños del agente

- Toda capability de escritura declara sus **límites duros**: máximo de escrituras por conversación y por hora, y monto máximo en modo `direct` (por encima → `requires_confirmation`).
- **Capabilities destructivas (delete/hard update) no se exponen al AI.** Eliminar es acción humana vía API REST.
- El loop del Agent Core tiene **presupuesto por conversación**: máximo de llamadas al LLM y de ejecuciones de tools por mensaje entrante (corta loops infinitos). Al agotarse, responde con error amable, nunca sigue.
- El consumo de tokens/llamadas del LLM se registra por conversación (tracking de costo).

### Métricas de producto

- No se monta stack de métricas. Los datos están en Postgres: cualquier métrica de producto es un query (o una pregunta al propio bot).

## 8. Checklist para crear una feature nueva

1. ¿Es un dominio nuevo? → crear `modules/<nombre>/` con la estructura estándar.
2. Definir schema Drizzle + migración.
3. Escribir el servicio con la lógica y sus errores de dominio.
4. Exponer rutas Fastify (delgadas, con schemas Zod vía type provider) y montarlas con `app.register(xRoutes, { deps })`.
5. ¿El bot debe poder usarla? → crear capability que envuelve el servicio, con modo, restricciones y límites duros (sección 7). Nunca capability de delete.
6. Tests según la sección 6: unit de las funciones puras, integration del servicio contra Postgres real, y de la capability si existe. No de las rutas.
7. Nunca: lógica en rutas, acceso a tablas ajenas, `process.env` suelto, exponer servicios crudos al AI.

## 9. Anti-patrones prohibidos

- Organizar por capas globales (`/controllers`, `/services`, `/models`) — ni global ni dentro de un módulo.
- Repositorios con interfaz para la DB.
- `BaseService` o cualquier herencia genérica CRUD; helpers componibles en su lugar.
- Mockear el ORM en tests.
- Queries sin scoping por `userId`.
- Lógica duplicada entre API REST y bot (ambos consumen los mismos servicios).
- Estado del agente en RAM.
- El AI eligiendo el usuario o recibiendo acceso sin restricciones.
- Capabilities de escritura sin límites duros, o loop del agente sin presupuesto.
- Jobs críticos sin heartbeat (fallos silenciosos).
- Reportar errores de dominio esperados a error tracking (ruido que entierra los errores reales).
- JSON Schema escrito a mano duplicando un schema Zod.
- `Zod.parse()` sobre salidas del propio código.
- Invocar funciones de rutas directamente en vez de `app.register`.
- Credenciales hardcodeadas en los compose (siempre interpolación desde `.env`).
