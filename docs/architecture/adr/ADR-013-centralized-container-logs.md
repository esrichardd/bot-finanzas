# ADR-013: Centralizar logs web de Docker con Alloy y Loki

- Estado: Aceptado
- Fecha de registro: 2026-08-27

## Contexto

Los logs rotados de Docker permiten diagnóstico local, pero no ofrecen una
vista central, consultas históricas ni alertas en Grafana Cloud. El backend ya
produce eventos JSON estructurados mediante Fastify y Pino.

## Decisión

Usar el Alloy instalado en la VPS para descubrir los contenedores del proyecto
`finanzas` y enviar continuamente a Grafana Cloud Loki los logs de servidor de
`backend`, `frontend` y `caddy`. Excluir PostgreSQL y el proxy administrativo.
Conservar como etiquetas solo datos estables del entorno y del contenedor; los
datos de cada request permanecen dentro del JSON. Pino emite el nivel como
texto para que Loki reconozca `info`, `warn`, `error` y `fatal`.

## Consecuencias

- No se publican puertos ni se ejecutan cron jobs adicionales.
- Grafana permite consultar y alertar sobre los logs centralizados.
- La rotación local de Docker sigue limitando el uso de disco aunque Grafana no
  esté disponible.
- Los logs del proceso Next.js sí se incluyen; la consola del navegador no.
- El usuario `alloy` pertenece al grupo `docker`, que concede privilegios
  equivalentes a `root`; solo el agente de confianza debe tener ese acceso.
- La retención y el volumen consultable dependen de las cuotas de Grafana Cloud.

## Evidencia

- `backend/src/http/server.ts`
- `docker-compose.prod.yml`
- `docs/operations/observability.md`
- `docs/operations/monitoring-and-security.md`
