# Backups y restauración de PostgreSQL

[Índice de operaciones](README.md) ·
[ADR-010: backups externos cifrados](../architecture/adr/ADR-010-encrypted-offsite-postgres-backups.md)

Este runbook documenta el backup lógico diario, la copia cifrada externa, su
supervisión y el simulacro de restauración.

`<R2_BUCKET_NAME>` representa el nombre del bucket privado de Cloudflare R2.
No escribir su valor real ni credenciales asociadas en el repositorio.

## 1. Diseño y procedimientos

### Diseño actual

- Formato: archivo custom de `pg_dump` (`-Fc`), comprimido por PostgreSQL.
- Frecuencia: diaria a las 03:15, hora de Bogotá.
- Retención local: 14 días.
- Retención externa: 30 días en Cloudflare R2 Standard.
- Directorio: `/home/opc/backups/postgres`.
- Automatización: `systemd` timer.
- Usuario de ejecución: `opc`, con grupo suplementario `docker`.
- Remoto R2 base: `r2`.
- Remoto con cifrado del lado del cliente: `r2-finanzas`.
- Monitor de ausencia: Healthchecks.io con una hora de gracia.

El formato custom se valida con `pg_restore --list` antes de considerar exitosa
la copia local. La copia externa se valida con `rclone cryptcheck`.

### Almacenamiento externo en Cloudflare R2

El bucket privado utiliza la clase Standard y una ubicación sugerida en Eastern
North America, próxima a la VPS de Ashburn. No tiene dominio público ni acceso
mediante `r2.dev`.

Configuración del bucket:

- Una regla lifecycle elimina objetos después de 30 días.
- La regla predeterminada aborta cargas multipart incompletas después de 7 días.
- Un bucket lock impide borrar o sobrescribir objetos durante 30 días.
- El token de la VPS tiene `Object Read & Write` únicamente sobre este bucket.

`rclone` está instalado desde `ol9_developer_EPEL`. Su configuración privada se
encuentra en `/home/opc/.config/rclone/rclone.conf`, con permisos `600`. El
remoto cifrado apunta a:

```text
r2:<R2_BUCKET_NAME>/encrypted
```

El contenido, los nombres de archivos y los nombres de directorios se cifran
antes de salir de la VPS. La contraseña y el salt de `rclone crypt`, así como
las credenciales R2, deben conservarse fuera de la VPS en un gestor de
contraseñas. Sin la contraseña y el salt no es posible recuperar los objetos
cifrados después de perder el servidor.

### Prueba manual

```bash
mkdir -p ~/backups/postgres
chmod 700 ~/backups ~/backups/postgres
umask 077
backup_file="$HOME/backups/postgres/finanzas-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose -f /home/opc/finanzas/docker-compose.prod.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_file"
docker compose -f /home/opc/finanzas/docker-compose.prod.yml exec -T postgres pg_restore --list < "$backup_file" > /dev/null
echo $?
```

El último comando debe mostrar `0`.

### Script instalado

Ruta: `/home/opc/bin/backup-finanzas.sh`.

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

readonly PROJECT_DIR="/home/opc/finanzas"
readonly BACKUP_DIR="/home/opc/backups/postgres"
readonly COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"
readonly RCLONE_CONFIG="/home/opc/.config/rclone/rclone.conf"
readonly RCLONE_REMOTE="r2-finanzas:"
readonly HEALTHCHECK_URL_FILE="/home/opc/.config/finanzas/backup-healthcheck-url"
readonly TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly BACKUP_NAME="finanzas-${TIMESTAMP}.dump"
readonly BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}"
readonly HEALTHCHECK_URL="$(<"$HEALTHCHECK_URL_FILE")"

if [[ -z "$HEALTHCHECK_URL" ]]; then
  printf 'Error: the backup heartbeat URL is empty\n' >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"
trap 'rm -f "$BACKUP_FILE"' ERR

cd "$PROJECT_DIR"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$BACKUP_FILE"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore --list < "$BACKUP_FILE" > /dev/null

trap - ERR

/usr/bin/rclone \
  --config "$RCLONE_CONFIG" \
  copyto "$BACKUP_FILE" "${RCLONE_REMOTE}${BACKUP_NAME}"

/usr/bin/rclone \
  --config "$RCLONE_CONFIG" \
  cryptcheck "$BACKUP_DIR" "$RCLONE_REMOTE" \
  --include "$BACKUP_NAME" \
  --one-way

find "$BACKUP_DIR" \
  -type f \
  -name 'finanzas-*.dump' \
  -mtime +13 \
  -delete

if ! /usr/bin/curl \
  --fail \
  --silent \
  --show-error \
  --max-time 10 \
  --retry 3 \
  --output /dev/null \
  "$HEALTHCHECK_URL"; then
  printf 'Warning: backup succeeded but heartbeat delivery failed\n' >&2
fi

printf 'Local and off-site backup completed: %s\n' "$BACKUP_FILE"
```

El script tiene permisos `700`.

### Servicio systemd

Ruta: `/etc/systemd/system/finanzas-backup.service`.

```ini
[Unit]
Description=Backup de PostgreSQL para Finanzas
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
User=opc
Group=opc
SupplementaryGroups=docker
ExecStart=/home/opc/bin/backup-finanzas.sh
```

### Timer systemd

Ruta: `/etc/systemd/system/finanzas-backup.timer`.

```ini
[Unit]
Description=Ejecutar diariamente el backup de Finanzas

[Timer]
OnCalendar=*-*-* 03:15:00 America/Bogota
Persistent=true
Unit=finanzas-backup.service

[Install]
WantedBy=timers.target
```

Activación:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now finanzas-backup.timer
```

Comprobar programación y último resultado:

```bash
systemctl list-timers finanzas-backup.timer --all
sudo systemctl show finanzas-backup.service --property=Result --property=ExecMainStatus
sudo journalctl -u finanzas-backup.service -n 50 --no-pager
ls -lht ~/backups/postgres
```

Para ejecutar una copia inmediata:

```bash
sudo systemctl start finanzas-backup.service
```

### Heartbeat del backup

Healthchecks.io supervisa la ausencia del job; no consulta la base de datos ni
accede a la VPS. El check usa la misma expresión `OnCalendar` de las 03:15 en
`America/Bogota`, una hora de gracia y notificaciones por correo.

La Ping URL se guarda en:

```text
/home/opc/.config/finanzas/backup-healthcheck-url
```

El directorio tiene permisos `700` y el archivo permisos `600`. La URL no se
incluye en el repositorio ni en este documento. El script la llama únicamente
después de validar tanto el dump local como la copia cifrada en R2. Si el ping
falla, se registra una advertencia; Healthchecks.io enviará una alerta cuando
venza la hora de gracia.

Verificación manual:

```bash
sudo systemctl start finanzas-backup.service
sudo journalctl -u finanzas-backup.service -n 20 --no-pager
```

La ejecución debe terminar con `Local and off-site backup completed`, sin la
advertencia del heartbeat, y el check debe aparecer `Up`. La Ping URL se trata
como un secreto: si se publica, crear un check nuevo, actualizar el archivo de
la VPS, verificar el nuevo heartbeat y eliminar el check expuesto.

### Restauración

No restaurar directamente sobre producción como primera prueba. El proceso
seguro es crear una base temporal, restaurar allí y verificar conteos y
funcionalidad. La restauración usa `pg_restore` porque los dumps son formato
custom.

Seleccionar un objeto visible mediante `rclone lsl r2-finanzas:` y asignar
nombres exclusivos para el simulacro:

```bash
restore_file="finanzas-YYYYMMDDTHHMMSSZ.dump"
restore_dir="$HOME/restore-tests/r2-YYYYMMDD"
restore_db="finanzas_restore_test_YYYYMMDD"
```

Descargar y descifrar el dump sin sobrescribir una copia local:

```bash
mkdir -p "$restore_dir"
chmod 700 "$HOME/restore-tests" "$restore_dir"
rclone copyto "r2-finanzas:${restore_file}" "${restore_dir}/${restore_file}"
docker compose -f /home/opc/finanzas/docker-compose.prod.yml exec -T postgres pg_restore --list < "${restore_dir}/${restore_file}" > /dev/null
```

Crear una base aislada, restaurar y listar sus tablas:

```bash
docker compose -f /home/opc/finanzas/docker-compose.prod.yml exec -T -e RESTORE_DB="$restore_db" postgres sh -c 'createdb -U "$POSTGRES_USER" "$RESTORE_DB"'
docker compose -f /home/opc/finanzas/docker-compose.prod.yml exec -T -e RESTORE_DB="$restore_db" postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$RESTORE_DB" --no-owner --no-privileges' < "${restore_dir}/${restore_file}"
docker compose -f /home/opc/finanzas/docker-compose.prod.yml exec -T -e RESTORE_DB="$restore_db" postgres sh -c 'psql -U "$POSTGRES_USER" -d "$RESTORE_DB" -c "\dt"'
```

Después de verificar el resultado, eliminar únicamente la base y el archivo
temporales del simulacro:

```bash
docker compose -f /home/opc/finanzas/docker-compose.prod.yml exec -T -e RESTORE_DB="$restore_db" postgres sh -c 'dropdb -U "$POSTGRES_USER" "$RESTORE_DB"'
rm -f "${restore_dir}/${restore_file}"
rmdir "$restore_dir"
```

Último simulacro exitoso: **2026-08-22**. Se descargó un objeto cifrado desde
R2, `pg_restore` terminó con código `0` y la base temporal contenía las 10
tablas esperadas. Próximo simulacro: antes del **2026-11-22**.
