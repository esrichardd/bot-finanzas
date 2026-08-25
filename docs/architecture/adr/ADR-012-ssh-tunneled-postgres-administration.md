# ADR-012: Administrar PostgreSQL mediante proxy local y túnel SSH

- Estado: Aceptado
- Fecha de registro: 2026-08-25

## Contexto

La red `internal` de Compose mantiene PostgreSQL aislado del host y de
Internet, pero el administrador necesita inspeccionar y corregir datos con un
cliente SQL visual. Publicar `5432` o usar las credenciales de la aplicación
ampliaría innecesariamente el acceso a producción.

## Decisión

Mantener `postgres` únicamente en `internal` y añadir un sidecar HAProxy entre
esa red y una red `admin`. Publicar el proxy solo en `127.0.0.1:15432` y acceder
desde DBeaver mediante SSH. Incluir la configuración no secreta de HAProxy en
su imagen para no depender de permisos o etiquetas SELinux de un bind mount.

Usar un login `finanzas_operator` que hereda un rol `finanzas_dml` con
`SELECT`, `INSERT`, `UPDATE` y `DELETE`, sin `CREATE` sobre el schema ni
privilegios de administración. Marcar la conexión de DBeaver como producción y
usar manual commit.

## Consecuencias

- PostgreSQL y `15432` no quedan accesibles desde Internet.
- La administración requiere acceso SSH válido y la contraseña independiente
  del operador.
- El proxy añade un contenedor pequeño y una imagen local al despliegue.
- El operador no puede ejecutar DDL, pero sí puede modificar o eliminar datos;
  las transacciones manuales y los backups siguen siendo necesarios.
- Las migraciones futuras conservan acceso DML mediante default privileges.

## Evidencia

- `docker-compose.prod.yml`
- `postgres-admin/Dockerfile`
- `postgres-admin/haproxy.cfg`
- `docs/operations/database-access.md`
