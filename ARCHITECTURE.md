# ARCHITECTURE.md

Documento normativo de la arquitectura global. Toda modificación, escrita por
una persona o por una herramienta de desarrollo, DEBE respetar los límites e
invariantes definidos aquí.

Este documento describe exclusivamente el sistema implementado en el
repositorio y en producción.

## 1. Jerarquía documental

- Todo cambio debe cumplir este documento.
- Los cambios del backend deben cumplir además
  `backend/ARCHITECTURE.md`.
- Los cambios del frontend deben cumplir además
  `frontend/ARCHITECTURE.md`.
- `docs/DATABASE.md` describe el modelo de datos vigente.
- `docs/architecture/adr/README.md` indexa las decisiones estructurales
  aceptadas.
- `docs/operations/README.md` indexa producción, despliegue, backups, monitoreo
  y recuperación.

Ante un conflicto, esta arquitectura global prevalece sobre las arquitecturas
específicas. El código y las migraciones son la fuente exacta para contratos,
columnas y tipos ya implementados.

## 2. Vista general

```text
Navegador
   |
   v
Cloudflare
   |
   v
Caddy :80/:443
   |----------------------|
   |                      |
   v                      v
Next.js                Fastify API
frontend               backend
                          |
                          v
                    PostgreSQL 17
```

La aplicación financiera usa un único origen público. Caddy envía `/api/*` y
`/health` al backend y el resto al frontend. PostgreSQL permanece dentro de la
red privada de Compose.

El dominio raíz y `www` se sirven por separado desde Vercel; la aplicación de
finanzas vive en su subdominio y se ejecuta en la VPS.

```text
DBeaver -- túnel SSH --> VPS 127.0.0.1:15432 --> HAProxy --> PostgreSQL
```

Este flujo administrativo no atraviesa Cloudflare ni publica PostgreSQL en
Internet.

```text
VPS host -- métricas --------------------|
                                         v
Docker -- logs de backend/frontend/caddy --> Grafana Alloy -- HTTPS --> Grafana Cloud
                                                                            |
                                                                            v
                                                                  alertas por correo
```

## 3. Componentes y responsabilidades

| Componente             | Responsabilidad                                                               |
| ---------------------- | ----------------------------------------------------------------------------- |
| Frontend Next.js       | Presentación, interacción, lecturas server-side y mutaciones mediante Actions |
| Backend Fastify        | Autenticación, autorización, reglas de negocio y contratos HTTP               |
| PostgreSQL             | Persistencia de autenticación y dominios financieros                          |
| HAProxy administrativo | Acceso PostgreSQL ligado al loopback y alcanzable solo mediante SSH            |
| Caddy                  | Terminación TLS y routing de mismo origen                                     |
| Cloudflare             | DNS y proxy público del subdominio de la aplicación                           |
| GitHub Actions         | Checks y despliegue automatizado del commit exacto validado                   |
| `systemd` + R2         | Backup lógico diario, cifrado, copia externa y heartbeat                      |
| Grafana Alloy          | Recolección y envío saliente de métricas del host y logs de servicios web     |
| Grafana Cloud          | Dashboards, consultas de logs y alertas de recursos y telemetría              |
| Monitores externos     | Disponibilidad pública y ausencia del job de backup                           |

### Límites

- El frontend nunca accede directamente a PostgreSQL.
- El navegador nunca llama a puertos internos del backend o del frontend.
- Caddy es la única entrada HTTP/HTTPS publicada por Compose.
- El proxy administrativo de PostgreSQL publica `15432` solo en
  `127.0.0.1`; nunca constituye una entrada pública.
- Las reglas financieras y de autorización pertenecen al backend.
- El frontend consume contratos HTTP mediante su cliente tipado.
- Los scripts del host operan despliegues y backups, pero no contienen lógica
  de negocio.

## 4. Flujos principales

### Lectura y escritura web

1. El navegador solicita una ruta al mismo origen público.
2. Caddy enruta páginas hacia Next.js y `/api/*` hacia Fastify.
3. Next.js reenvía la cookie de sesión cuando consulta la API desde el servidor.
4. Fastify valida sesión, input y ownership antes de acceder a PostgreSQL.
5. Las respuestas vuelven por Caddy bajo el mismo dominio.

### Autenticación

- Better Auth se ejecuta en el backend y persiste usuarios y sesiones en el
  mismo PostgreSQL de la aplicación.
- La cookie viaja bajo el mismo origen utilizado por frontend y API.
- El proxy de Next.js realiza una redirección temprana de rutas privadas; el
  backend conserva la validación autoritativa en cada request.

### Datos financieros

- Las cuentas, categorías, movimientos, transferencias y tarjetas pertenecen a
  módulos del backend.
- Los balances se derivan del ledger y nunca se persisten como una cifra
  mutable en `accounts`.
- Las transferencias agrupan movimientos de salida, entrada y comisiones dentro
  de una operación atómica.
- Los detalles completos del modelo viven en `docs/DATABASE.md`.

## 5. Invariantes globales

1. **Dinero exacto:** los montos se representan como enteros en unidades
   mínimas; no se usan floats para persistencia o reglas financieras.
2. **Balances derivados:** el ledger es la fuente de verdad de los saldos.
3. **Aislamiento por usuario:** toda lectura o escritura privada valida
   ownership en el backend.
4. **Backend autoritativo:** el frontend no duplica reglas financieras,
   permisos ni invariantes persistentes.
5. **Contratos explícitos:** los bordes HTTP y la configuración se validan; el
   cliente frontend mantiene tipos compatibles con la API.
6. **Mismo origen:** autenticación y API funcionan sin CORS mediante el routing
   de Next.js en desarrollo y Caddy en producción.
7. **Base de datos privada:** el contenedor PostgreSQL no publica un puerto en
   producción; el acceso administrativo pasa por un proxy ligado al loopback y
   un túnel SSH.
8. **Secretos fuera de Git:** credenciales, llaves, Ping URLs y `.env` de
   producción no se versionan ni se incluyen en documentación.
9. **Cambios recuperables:** una modificación de persistencia usa migraciones
   nuevas y un despliegue crea un backup validado antes de reconstruir.

## 6. Runtime y topología de producción

Producción usa Docker Compose sobre una VPS ARM64:

- `postgres` vive únicamente en la red `internal`.
- `postgres-admin-proxy` participa en `internal` y `admin`, y publica
  `127.0.0.1:15432` para clientes conectados por SSH.
- `backend` participa en `internal` y `web`.
- `frontend` y `caddy` participan en `web`.
- Solo Caddy publica los puertos `80` y `443`.
- Los servicios se comunican mediante sus nombres de Compose.
- El `.env` almacena configuración y credenciales; no redefine la topología de
  red.

El stack actual es Node.js 22, TypeScript strict, Fastify, Drizzle,
PostgreSQL 17, Better Auth, Next.js 16, React 19 y Caddy 2. Las versiones y
reglas internas se detallan en las arquitecturas de backend y frontend.

## 7. Entrega, respaldo y observabilidad

- GitHub Actions ejecuta los checks de backend y frontend.
- Un cambio elegible en `main` solicita a la VPS desplegar el SHA exacto.
- La llave de CI está restringida a un único script y no abre una shell general.
- El script rechaza downgrades y divergencias, crea un backup y avanza mediante
  fast-forward.
- El backend expone `/health`, que incluye la conectividad con PostgreSQL.
- UptimeRobot comprueba públicamente `/health`.
- El backup diario usa `pg_dump -Fc`, valida el dump, cifra la copia con
  `rclone crypt`, la envía a Cloudflare R2 y notifica a Healthchecks.io.
- Grafana Alloy envía métricas estándar del host a Grafana Cloud, que mantiene
  dashboards y alertas por correo para CPU, memoria, disco y falta de métricas.
- Alloy también descubre los contenedores de Compose y envía a Grafana Cloud
  Loki los logs de servidor de `backend`, `frontend` y `caddy`. PostgreSQL y el
  proxy administrativo quedan excluidos.

Los comandos, retenciones, verificaciones y procedimientos de restauración
están en `docs/operations/`.

## 8. Quality gates

Antes de integrar un cambio se ejecutan los checks del área afectada:

- Backend: tests, typecheck y build.
- Frontend: tests, lint y build.
- Contratos compartidos: checks de ambas aplicaciones.
- Compose o despliegue: validación de configuración y healthchecks indicados en
  `docs/operations/`.

Los tests persistentes del backend usan PostgreSQL real mediante
Testcontainers. El detalle pertenece a `backend/ARCHITECTURE.md`.

## 9. Ruta documental por tipo de cambio

| Cambio                                | Documentos obligatorios                              |
| ------------------------------------- | ---------------------------------------------------- |
| Backend, API o autenticación          | Raíz + `backend/ARCHITECTURE.md`                     |
| Frontend o experiencia web            | Raíz + `frontend/ARCHITECTURE.md`                    |
| Contrato usado por backend y frontend | Las tres arquitecturas                               |
| Schema, migración o regla del ledger  | Raíz + backend + `docs/DATABASE.md`                  |
| Compose, VPS, CI, backup o monitoreo  | Raíz + runbook correspondiente en `docs/operations/` |

## 10. Anti-patrones entre componentes

- Acceso del frontend a PostgreSQL.
- Reglas de negocio implementadas únicamente en el navegador.
- Endpoints creados para compensar una composición puramente visual.
- Puertos internos o PostgreSQL expuestos públicamente en producción.
- Credenciales hardcodeadas o registradas en logs.
- Cálculos monetarios incompatibles entre backend y frontend.
- Un despliegue que use una rama mutable en vez de un SHA validado.
- Duplicar aquí reglas internas que pertenecen a una arquitectura específica.
