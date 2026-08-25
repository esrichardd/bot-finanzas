# ADR-011: Observar la VPS con Grafana Cloud y Grafana Alloy

- Estado: Aceptado
- Fecha de registro: 2026-08-25

## Contexto

UptimeRobot comprueba la disponibilidad pública y Healthchecks.io comprueba el
backup diario, pero ninguno muestra el consumo interno de CPU, memoria, disco
o red ni detecta la pérdida de telemetría del host.

## Decisión

Ejecutar Grafana Alloy como servicio `systemd` en la VPS y enviar por HTTPS las
métricas estándar de la integración `Linux Server` a Grafana Cloud. Mantener
logs y alertas genéricas desactivados y definir reglas propias para CPU,
memoria, disco raíz y ausencia de métricas, con notificación por correo.

## Consecuencias

- La observabilidad del host no requiere publicar puertos nuevos.
- Grafana Cloud pasa a ser una dependencia externa para dashboards y alertas.
- El token de Alloy es un secreto operativo y debe permanecer fuera de Git.
- Las cuotas y la retención del servicio limitan el historial disponible.
- UptimeRobot y Healthchecks.io se conservan porque cubren fallos diferentes.

## Evidencia

- `docs/operations/observability.md`
- `docs/operations/monitoring-and-security.md`
- `ARCHITECTURE.md`

