# Observabilidad de producción

[Índice de operaciones](README.md) ·
[ADR-011: Grafana Cloud y Alloy](../architecture/adr/ADR-011-grafana-cloud-host-observability.md) ·
[ADR-013: logs centralizados](../architecture/adr/ADR-013-centralized-container-logs.md) ·
[ADR-014: tracing OpenTelemetry](../architecture/adr/ADR-014-provider-neutral-opentelemetry-tracing.md)

Este runbook documenta la observabilidad implementada para la VPS. No contiene
tokens, direcciones de correo ni credenciales.

## Estado actual

- Grafana Alloy se ejecuta como `alloy.service` en la VPS ARM64.
- Su configuración está en `/etc/alloy/config.alloy` y usa configuración remota.
- La integración `Linux Server` envía métricas estándar del host a Grafana
  Cloud y no instala alertas genéricas.
- Una configuración local de Alloy descubre los contenedores de Compose y
  envía a Grafana Cloud Loki los logs de servidor de `backend`, `frontend` y
  `caddy`. No incluye PostgreSQL, el proxy administrativo ni logs del navegador.
- El backend instrumentado con OpenTelemetry envía trazas OTLP/HTTP al Alloy
  del host por la red privada de Docker. Alloy las reenvía a Grafana Cloud
  Tempo; ninguna credencial de Grafana entra al contenedor.
- El dashboard `Linux node / overview` muestra CPU, memoria, disco y red para
  `finanzas-prod-vnic`.
- Las reglas se evalúan cada minuto y notifican mediante el contact point
  `email-operaciones`.

| Regla | Condición | Espera | Severidad |
| ----- | --------- | ------ | --------- |
| `VPS - Disco raíz crítico` | Uso de `/` mayor a 85 % | 10 min | `critical` |
| `VPS - CPU alta` | Uso de CPU mayor a 85 % | 10 min | `warning` |
| `VPS - Memoria alta` | Uso de memoria mayor a 85 % | 10 min | `warning` |
| `VPS - Sin métricas` | Sin métricas durante 5 min | 1 min adicional | `critical` |

Las tres reglas de recursos conservan el estado `Firing` durante cinco minutos
después de normalizarse. La regla de ausencia de métricas hace lo mismo.

## Consultas de las reglas

Disco raíz:

```promql
100 * (1 - node_filesystem_avail_bytes{job="integrations/node_exporter",instance="finanzas-prod-vnic",mountpoint="/"} / node_filesystem_size_bytes{job="integrations/node_exporter",instance="finanzas-prod-vnic",mountpoint="/"})
```

CPU:

```promql
100 - (avg by (instance) (rate(node_cpu_seconds_total{job="integrations/node_exporter",instance="finanzas-prod-vnic",mode="idle"}[5m])) * 100)
```

Memoria:

```promql
100 * (1 - node_memory_MemAvailable_bytes{job="integrations/node_exporter",instance="finanzas-prod-vnic"} / node_memory_MemTotal_bytes{job="integrations/node_exporter",instance="finanzas-prod-vnic"})
```

Ausencia de métricas:

```promql
max(absent_over_time(up{job="integrations/node_exporter",instance="finanzas-prod-vnic"}[5m])) or vector(0)
```

Todas usan las etiquetas `environment=production`, `service=vps` y un
`resource` acorde a la regla. CPU y memoria usan `severity=warning`; disco y
ausencia de métricas usan `severity=critical`.

## Logs de servicios web

Alloy lee continuamente la salida estándar de los contenedores; no usa un
cron. Docker conserva localmente archivos rotados y Alloy envía cada línea por
HTTPS a Loki. Los streams usan estas etiquetas estables:

- `job=finanzas/docker`
- `environment=production`
- `compose_project=finanzas`
- `service_name`, `instance`, `container` y `stream`

El backend escribe JSON estructurado con niveles textuales como `info`, `warn`
y `error`. Datos variables como `reqId`, método, ruta y código HTTP permanecen
como campos JSON para poder filtrarlos sin crear etiquetas de alta cardinalidad.

Consultas útiles en Grafana Explore:

```logql
{environment="production", service_name=~"backend|frontend|caddy"}
```

Muestra los logs de servidor de los tres servicios enviados a Loki.

```logql
{service_name="backend"} | json | level=~"warn|error|fatal"
```

Extrae el JSON de Fastify y muestra únicamente eventos de advertencia o error.
El servicio `frontend` representa el proceso Next.js en la VPS; los errores de
la consola del navegador requieren instrumentación del cliente y no forman
parte de este flujo.

## Trazas del backend

El recorrido implementado es:

```text
Fastify -> OTLP/HTTP -> host.docker.internal:4318 -> Alloy -> HTTPS -> Tempo
```

Alloy escucha únicamente en `172.17.0.1:4318`; el puerto no se publica en
Internet. Producción define en `.env`:

```dotenv
OTEL_TRACING_ENABLED=true
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://host.docker.internal:4318/v1/traces
OTEL_SERVICE_NAME=finanzas-backend
OTEL_TRACE_SAMPLE_RATIO=1
```

El deploy exporta automáticamente el SHA validado como
`OTEL_SERVICE_VERSION`. `/health` no genera spans y los valores del query
string se sustituyen por `REDACTED`.

Buscar trazas recientes en Explore con la fuente Tempo:

```traceql
{ resource.service.name = "finanzas-backend" }
```

Buscar en Loki los logs de una traza concreta:

```logql
{service_name="backend"} |= "<TRACE_ID>"
```

El flujo se verificó en producción el **2026-08-27** con una petición
`GET /api/categories`, spans HTTP/Fastify y servicio `finanzas-backend`.

## Verificación y diagnóstico

```bash
sudo systemctl is-active alloy.service
```

Comprueba si Alloy está ejecutándose; debe responder `active`.

```bash
sudo bash -c 'set -a; source /etc/sysconfig/alloy-otlp; set +a; exec alloy validate /etc/alloy/config.alloy'
```

Carga las variables protegidas solo dentro del proceso de validación y comprueba
la configuración sin reiniciar el servicio ni imprimir sus valores.

```bash
sudo journalctl -u alloy.service -n 100 --no-pager
```

Muestra los últimos cien eventos del servicio sin abrir un paginador. Revisar
errores de configuración, autenticación o envío remoto.

```bash
sudo ss -lntp 'sport = :4318'
```

Confirma que el receptor OTLP pertenece a Alloy y escucha en
`172.17.0.1:4318`, no en una interfaz pública.

```bash
docker compose -f /home/opc/finanzas/docker-compose.prod.yml logs --since=10m backend \
  | grep -E 'OpenTelemetry tracing enabled|Tracing could not start'
```

Comprueba si el backend activó tracing o continuó sin él por un error de
inicio. La aplicación permanece disponible aunque falle la telemetría.

```bash
sudo -u alloy docker ps --format 'table {{.Names}}\t{{.Status}}'
```

Ejecuta la consulta como el usuario del servicio Alloy y confirma que puede
descubrir los contenedores sin usar una sesión de `root`.

Antes de modificar la configuración:

```bash
sudo cp --preserve=all /etc/alloy/config.alloy /etc/alloy/config.alloy.rollback
```

Conserva una copia exacta de la última configuración funcional. Después de
editar:

```bash
sudo bash -c 'set -a; source /etc/sysconfig/alloy-otlp; set +a; exec alloy validate /etc/alloy/config.alloy'
sudo systemctl restart alloy.service
sudo systemctl is-active alloy.service
```

El primer comando valida con el entorno real; los dos últimos aplican el cambio
y confirman `active`. Si falla:

```bash
sudo cp --preserve=all /etc/alloy/config.alloy.rollback /etc/alloy/config.alloy
sudo systemctl reset-failed alloy.service
sudo systemctl restart alloy.service
```

Estas órdenes restauran la copia, limpian el estado fallido y vuelven a iniciar
Alloy. En Grafana, `Test Alloy connection` debe indicar que la integración está
enviando datos.

## Prueba de notificación

La ruta completa se verificó el **2026-08-25** mediante una regla temporal:

1. Crear `TEST - Notificación Grafana` con consulta `vector(1)`, condición
   mayor a `0.5`, sin periodo pendiente y contact point `email-operaciones`.
2. Confirmar que la regla pasa a `Firing` y llega el correo.
3. Cambiar la consulta a `vector(0)` y confirmar el retorno a `Normal` y el
   correo de resolución.
4. Eliminar la regla temporal solo después de quedar `Normal`.

## Reconstrucción

1. En Grafana Cloud abrir `Connections > Linux Server` y seleccionar `Red Hat`
   y `Arm64`.
2. Generar un token nuevo desde el instalador, conservar los scopes mínimos
   propuestos y mantener habilitada la configuración remota. El token es un
   secreto y no debe copiarse a este repositorio.
3. Ejecutar en la VPS el comando generado por Grafana para instalar Alloy.
4. Configurar métricas extendidas, logs y alertas genéricas como desactivadas;
   elegir `Simple set-up`.
5. Aplicar el fragmento generado para `Linux Server`, validar la configuración
   y reiniciar Alloy con los comandos anteriores.
6. Añadir el usuario `alloy` al grupo `docker`, reiniciar Alloy y comprobar con
   `sudo -u alloy docker ps` que puede leer el socket local. Esta membresía
   concede privilegios equivalentes a `root` sobre Docker y debe limitarse al
   agente de confianza instalado en la VPS.
7. Añadir a `/etc/alloy/config.alloy` los componentes `discovery.docker`,
   `discovery.relabel` y `loki.source.docker`: conservar únicamente el proyecto
   `finanzas` y los servicios `backend`, `frontend` y `caddy`, aplicar las
   etiquetas listadas arriba y reenviar al `loki.write` creado por Grafana.
8. Validar la configuración, reiniciar Alloy y confirmar en Explore que una
   consulta por `service_name="backend"` devuelve eventos recientes.
9. Crear una credencial OTLP con permiso de escritura. Guardar endpoint,
   instance ID y token en `/etc/sysconfig/alloy-otlp`, propiedad de `root` y
   modo `600`, usando las variables `OTLP_ENDPOINT`, `OTLP_USERNAME` y
   `OTLP_API_KEY`. Nunca copiar sus valores al repositorio.
10. Añadir un drop-in de `alloy.service` que cargue ese archivo. En
    `/etc/alloy/config.alloy`, conectar un `otelcol.receiver.otlp` HTTP ligado
    a `172.17.0.1:4318` con memory limiter, batch y
    `otelcol.exporter.otlphttp` autenticado. Ejecutar `systemctl daemon-reload`
    después de crear el drop-in y validar con el archivo de entorno antes de
    reiniciar.
11. Confirmar el listener con `ss`, agregar al `.env` las cuatro variables no
    secretas mostradas arriba y desplegar el backend.
12. Ejecutar una petición real y verificar la consulta TraceQL y la
    correlación por `trace_id` en Loki.
13. Probar la conexión, instalar el dashboard y recrear las cuatro reglas de la
   tabla.
14. Recrear y probar el contact point, y repetir la prueba temporal.
