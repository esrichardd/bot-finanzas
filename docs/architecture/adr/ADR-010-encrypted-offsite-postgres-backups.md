# ADR-010: Mantener backups PostgreSQL cifrados fuera de la VPS

- Estado: Aceptado
- Fecha de registro: 2026-08-23

## Contexto

El volumen de PostgreSQL y un backup guardado únicamente en la VPS comparten el
mismo dominio de falla. La copia externa contiene información financiera y no
debe almacenarse sin cifrado controlado por el administrador.

## Decisión

Ejecutar diariamente un timer `systemd` que produce un dump `pg_dump -Fc`, lo
valida con `pg_restore --list`, lo copia mediante `rclone crypt` a un bucket
privado de Cloudflare R2 y verifica la copia con `rclone cryptcheck`.

## Consecuencias

- La VPS conserva 14 días de backups locales.
- R2 conserva 30 días mediante lifecycle y bucket lock.
- Las credenciales y claves de cifrado viven fuera del repositorio.
- Healthchecks.io recibe un heartbeat solo después de validar ambas copias.
- La restauración se prueba contra una base temporal sin tocar producción.

## Evidencia

- `docs/operations/backups-and-restore.md`
- `docs/operations/monitoring-and-security.md`
- `ARCHITECTURE.md`
