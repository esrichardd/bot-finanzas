# Documentación

Índice de la documentación vigente y del historial de construcción.

## Arquitectura

- [Arquitectura global](../ARCHITECTURE.md): límites e invariantes del sistema completo.
- [Arquitectura backend](../backend/ARCHITECTURE.md): reglas específicas del backend.
- [Arquitectura frontend](../frontend/ARCHITECTURE.md): reglas específicas del frontend.
- [ADR](architecture/adr/README.md): decisiones arquitectónicas aceptadas.

## Referencias

- [Modelo de datos](DATABASE.md): entidades, relaciones e invariantes.
- [Commits](COMMITS.md): convención de commits del repositorio.

## Operación

- [Índice operativo](operations/README.md): runbooks de producción.
- [Infraestructura](operations/infrastructure.md): OCI, red, SSH, Docker, DNS y HTTPS.
- [Despliegue](operations/deployment.md): automatización y contingencia manual.
- [Backups y restauración](operations/backups-and-restore.md): copias locales, R2 y restore.
- [Observabilidad](operations/observability.md): Grafana Cloud, Alloy, métricas y alertas.
- [Monitoreo y seguridad](operations/monitoring-and-security.md): monitores, diagnóstico, secretos y
  recuperación.
- [Acceso a PostgreSQL](operations/database-access.md): proxy local, rol DML, DBeaver y operación segura.

## Historial

- [Specs históricos](specs/README.md): alcance y forma de lectura.

La documentación normativa describe solamente lo implementado. Los ADR
registran por qué se tomaron decisiones vigentes y los specs conservan cómo se
construyó cada unidad de trabajo.
