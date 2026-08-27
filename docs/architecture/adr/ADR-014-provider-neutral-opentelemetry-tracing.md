# ADR-014: Instrumentar el backend con OpenTelemetry y exportar por OTLP

- Estado: Aceptado
- Fecha de registro: 2026-08-27

## Contexto

Las métricas del host y los logs centralizados permiten detectar fallos, pero
no muestran el recorrido ni la duración interna de una petición HTTP. Integrar
el backend directamente con un SDK propietario también dificultaría cambiar el
destino de observabilidad.

## Decisión

Instrumentar Fastify, HTTP y Pino con OpenTelemetry desde
`backend/src/infra/telemetry/`. El backend exporta únicamente trazas OTLP/HTTP
al Alloy de la VPS; Alloy conserva las credenciales y las reenvía a Grafana
Cloud Tempo. Los módulos de negocio no importan SDK de Grafana.

La configuración se controla por entorno. `/health` queda fuera del tracing,
los parámetros de query se redactan y Pino añade `trace_id` y `span_id` a los
logs sin enviarlos una segunda vez. Cada despliegue usa el SHA del commit como
`service.version`.

## Consecuencias

- El backend puede cambiar de collector o proveedor sin modificar dominios.
- Grafana recibe latencia, jerarquía y estado de cada petición instrumentada.
- Logs y trazas pueden correlacionarse por `trace_id`.
- El token OTLP permanece en el host y nunca entra al contenedor ni a Git.
- El muestreo controla el volumen enviado; producción conserva actualmente el
  100 % por su tráfico reducido.
- Una caída del collector no impide que la aplicación arranque o atienda
  peticiones.

## Evidencia

- `backend/src/infra/telemetry/telemetry.ts`
- `backend/src/index.ts`
- `docker-compose.prod.yml`
- `scripts/deploy-production.sh`
- `docs/operations/observability.md`
