# Observabilidad de producción

[Índice de operaciones](README.md) ·
[ADR-011: Grafana Cloud y Alloy](../architecture/adr/ADR-011-grafana-cloud-host-observability.md) ·
[ADR-013: logs centralizados](../architecture/adr/ADR-013-centralized-container-logs.md)

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

## Verificación y diagnóstico

```bash
sudo systemctl is-active alloy.service
```

Comprueba si Alloy está ejecutándose; debe responder `active`.

```bash
sudo alloy validate /etc/alloy/config.alloy
```

Valida la sintaxis de la configuración sin reiniciar el servicio.

```bash
sudo journalctl -u alloy.service -n 100 --no-pager
```

Muestra los últimos cien eventos del servicio sin abrir un paginador. Revisar
errores de configuración, autenticación o envío remoto.

```bash
sudo -u alloy docker ps --format 'table {{.Names}}\t{{.Status}}'
```

Ejecuta la consulta como el usuario del servicio Alloy y confirma que puede
descubrir los contenedores sin usar una sesión de `root`.

Después de modificar la configuración:

```bash
sudo systemctl restart alloy.service
sudo systemctl is-active alloy.service
```

El primer comando reinicia Alloy para aplicar el cambio; el segundo confirma
que volvió a quedar activo. En Grafana, `Test Alloy connection` debe indicar
que la integración está enviando datos.

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
9. Probar la conexión, instalar el dashboard y recrear las cuatro reglas de la
   tabla.
10. Recrear y probar el contact point, y repetir la prueba temporal.
