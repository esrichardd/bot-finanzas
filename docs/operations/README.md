# Operación de producción

Índice de los runbooks del entorno de producción. Estos documentos describen
únicamente la infraestructura y los procedimientos que están implementados.

| Runbook | Contenido |
| ------- | --------- |
| [Infraestructura](infrastructure.md) | Inventario actual, OCI, red, firewall, SSH, Docker, configuración inicial, DNS y HTTPS |
| [Despliegue](deployment.md) | Despliegue manual de contingencia, GitHub Actions y reconstrucción del acceso SSH restringido |
| [Backups y restauración](backups-and-restore.md) | Backup local y externo, R2, systemd, heartbeat y restauración |
| [Observabilidad](observability.md) | Grafana Cloud, Alloy, métricas, alertas y prueba de notificaciones |
| [Monitoreo y seguridad](monitoring-and-security.md) | UptimeRobot, diagnóstico, accesos, recursos, secretos y recuperación |
| [Acceso a PostgreSQL](database-access.md) | Proxy local, operador DML, túnel SSH, DBeaver y transacciones manuales |

No se guardan direcciones IP, llaves privadas, contraseñas, Ping URLs ni otros
secretos. Los valores entre `<...>` son marcadores que deben sustituirse al
ejecutar los procedimientos.

## Ruta de lectura

- Preparar o reconstruir una VPS: [infraestructura](infrastructure.md).
- Publicar o recuperar un despliegue: [despliegue](deployment.md).
- Verificar o restaurar respaldos: [backups y restauración](backups-and-restore.md).
- Revisar métricas o alertas del host: [observabilidad](observability.md).
- Investigar una alerta o incidente: [monitoreo y seguridad](monitoring-and-security.md).
- Consultar o corregir datos de producción: [acceso a PostgreSQL](database-access.md).
