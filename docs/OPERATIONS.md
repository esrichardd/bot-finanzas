# Operación y despliegue en VPS

Esta guía documenta la infraestructura y los procedimientos operativos del
entorno de producción. Su objetivo es poder reconstruir, mantener y auditar el
servidor sin depender del historial de una conversación.

No se guardan aquí direcciones IP, llaves privadas, contraseñas ni valores
reales de secretos. Los valores entre `<...>` deben sustituirse al ejecutar los
procedimientos.

## 1. Estado actual

### Infraestructura

| Componente           | Configuración                                                      |
| -------------------- | ------------------------------------------------------------------ |
| Proveedor            | Oracle Cloud Infrastructure (OCI)                                  |
| Región               | US East (Ashburn)                                                  |
| Availability Domain  | AD-3                                                               |
| Instancia            | Ampere A1 Flex, `VM.Standard.A1.Flex`                              |
| Recursos             | 1 OCPU ARM64, 6 GB RAM                                             |
| Sistema operativo    | Oracle Linux Server 9.8 (`aarch64`)                                |
| Swap                 | 4 GB, provistos por la imagen                                      |
| Disco raíz observado | 30 GB montados, aproximadamente 21 GB libres al crear la instancia |
| Usuario SSH          | `opc`                                                              |
| Runtime              | Docker Engine y Docker Compose plugin                              |

### Servicios

```text
Internet
   |
   +-- esrichard.dev / www.esrichard.dev --> Vercel
   |
   +-- finanzas.esrichard.dev --> Cloudflare proxy
                                  |
                                  v
                              OCI VPS
                                  |
                               Caddy
                              /     \
                       frontend   backend
                                      |
                                  PostgreSQL
```

En producción:

- Caddy es el único servicio que publica puertos del host (`80` y `443`).
- El frontend y el backend solo son accesibles a través de Caddy.
- PostgreSQL vive únicamente en la red interna de Docker y no publica `5432`.
- Cloudflare usa proxy para `finanzas.esrichard.dev` y cifrado `Full (strict)`.
- Los registros raíz y `www` de Vercel permanecen en modo `DNS only`.
- Hay un respaldo lógico local diario de PostgreSQL con retención de 14 días.
- Cada respaldo se cifra en la VPS y se copia a Cloudflare R2 con retención de
  30 días.
- Healthchecks.io recibe un heartbeat después de cada backup validado y alerta
  por correo si no llega dentro de la hora de gracia.
- UptimeRobot consulta cada cinco minutos el endpoint público `/health` y
  alerta por correo cuando la aplicación o PostgreSQL dejan de responder.
- GitHub Actions valida backend y frontend y despliega automáticamente los
  pushes a `main` mediante una llave SSH exclusiva y restringida.

### Trabajo operativo pendiente

Prioridades de la próxima etapa:

- Configurar acceso visual a PostgreSQL con un usuario de solo lectura y una
  conexión segura mediante túnel SSH.
- Configurar alarmas de CPU, memoria, disco y tráfico.

Mantenimiento recurrente y endurecimiento posterior:

- Repetir trimestralmente el simulacro de restauración; el próximo vence el
  2026-11-22.
- Habilitar access logs de Caddy preservando la IP real enviada por Cloudflare.
- Evaluar más adelante Cloudflare Tunnel o la restricción del origen a los
  rangos oficiales de Cloudflare. Para la etapa actual se mantiene el proxy y
  la exposición existente de `80` y `443`.
- Restringir SSH a una IP administrativa o a un mecanismo de acceso privado.

El backup externo y el restore trimestral son requisitos de
`ARCHITECTURE.md`. La arquitectura oficial usa el timer `systemd` del host,
copia cifrada en R2 y un simulacro de restauración trimestral.

## 2. Variables usadas en esta guía

Los siguientes nombres son marcadores, no comandos que deban copiarse con sus
valores literales:

| Marcador                 | Significado                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `<VPS_PUBLIC_IP>`        | IPv4 pública asignada a la instancia                         |
| `<APP_DOMAIN>`           | Dominio de la aplicación, por ejemplo `finanzas.example.com` |
| `<ROOT_DOMAIN>`          | Dominio raíz servido por Vercel                              |
| `<SSH_PRIVATE_KEY_PATH>` | Ruta local de la llave privada SSH                           |
| `<REPOSITORY_URL>`       | URL del repositorio Git                                      |
| `<AUTH_SECRET>`          | Secreto aleatorio de Better Auth                             |
| `<POSTGRES_PASSWORD>`    | Contraseña aleatoria de PostgreSQL                           |
| `<VERCEL_CNAME_TARGET>`  | CNAME específico mostrado por Vercel                         |
| `<R2_BUCKET_NAME>`       | Nombre del bucket privado usado para backups externos        |

Nunca pegar secretos en tickets, documentación, commits, capturas ni mensajes.

## 3. Creación de la instancia OCI

### Shape e imagen

La instancia se creó con:

- Shape `VM.Standard.A1.Flex`, marcado como Always Free-eligible.
- 1 OCPU y 6 GB de memoria.
- Oracle Linux Server 9.8 para arquitectura ARM64.
- Capacidad on-demand.
- Fault domain elegido automáticamente por Oracle.

Los contenedores utilizados por el proyecto (`node`, `postgres` y `caddy`)
publican imágenes compatibles con ARM64.

### Red

Se creó una VCN con subred pública y se asignó automáticamente una IPv4 privada
y una IPv4 pública a la VNIC principal. La instancia necesita una IP pública
para SSH y para recibir tráfico de Caddy mientras no se utilice un túnel.

Puertos necesarios:

| Puerto | Protocolo | Uso                                           |
| ------ | --------- | --------------------------------------------- |
| `22`   | TCP       | SSH                                           |
| `80`   | TCP       | HTTP, redirección a HTTPS y validaciones ACME |
| `443`  | TCP       | HTTPS                                         |

No abrir públicamente:

- `3000`: frontend y backend se comunican dentro de Docker.
- `5432`: PostgreSQL debe permanecer privado.

La Security List de la subred contiene actualmente reglas públicas para
`80` y `443`. Cloudflare protege el acceso por dominio, pero el endurecimiento
del origen sigue pendiente. Las alternativas son:

1. permitir en OCI solo los rangos oficiales de Cloudflare; o
2. usar Cloudflare Tunnel y cerrar por completo `80` y `443` en OCI.

### Firewall de Oracle Linux

Comprobar la zona activa:

```bash
sudo firewall-cmd --get-active-zones
```

Permitir HTTP y HTTPS de forma persistente:

```bash
sudo firewall-cmd --permanent --zone=public --add-service=http
sudo firewall-cmd --permanent --zone=public --add-service=https
sudo firewall-cmd --reload
```

Verificar:

```bash
sudo firewall-cmd --zone=public --query-service=http
sudo firewall-cmd --zone=public --query-service=https
```

Ambas consultas deben responder `yes`.

## 4. Acceso SSH

La llave privada se guarda en el equipo administrador, nunca en el repositorio
ni dentro de la VPS.

Preparar una llave descargada en macOS:

```bash
mkdir -p ~/.ssh
mv "<RUTA_DE_DESCARGA_DE_LA_LLAVE>" "<SSH_PRIVATE_KEY_PATH>"
chmod 600 "<SSH_PRIVATE_KEY_PATH>"
```

`~/.ssh` es el directorio correcto. No utilizar `/.ssh`, que apuntaría a la
raíz del sistema.

Conectar:

```bash
ssh -i "<SSH_PRIVATE_KEY_PATH>" opc@<VPS_PUBLIC_IP>
```

Oracle Linux usa `opc`; no usar `ubuntu` para esta imagen.

Verificaciones iniciales:

```bash
whoami
cat /etc/os-release
uname -m
free -h
df -h /
```

La salida esperada incluye usuario `opc`, Oracle Linux, arquitectura `aarch64`
y swap disponible.

## 5. Instalación de Docker

Actualizar el sistema y reiniciar:

```bash
sudo dnf update -y
sudo reboot
```

Instalar herramientas base:

```bash
sudo dnf install -y dnf-plugins-core git
```

Agregar el repositorio oficial de Docker compatible con EL9:

```bash
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
```

Instalar Docker, Buildx y Compose:

```bash
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Habilitar el servicio y dar acceso al usuario `opc`:

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker opc
```

Hay que cerrar y abrir nuevamente la sesión SSH para actualizar los grupos del
usuario. Verificar la instalación:

```bash
docker --version
docker compose version
docker run --rm hello-world
```

La prueba debe terminar con `Hello from Docker!`.

## 6. Despliegue de la aplicación

### Clonar el repositorio

```bash
cd ~
git clone <REPOSITORY_URL> finanzas
cd ~/finanzas
```

Si el repositorio es privado, configurar una deploy key o credencial de solo
lectura. No guardar tokens en la URL del remoto.

### Configuración de producción

Crear el archivo local de entorno:

```bash
cp .env.example .env
chmod 600 .env
```

Generar valores independientes para autenticación y PostgreSQL:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Estructura esperada, sin valores reales:

```dotenv
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

BETTER_AUTH_SECRET=<AUTH_SECRET>
BETTER_AUTH_URL=https://<APP_DOMAIN>
BETTER_AUTH_TRUSTED_ORIGINS=https://<APP_DOMAIN>

POSTGRES_USER=app
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
POSTGRES_DB=finanzas

DOMAIN=<APP_DOMAIN>
```

`BETTER_AUTH_URL` y `BETTER_AUTH_TRUSTED_ORIGINS` incluyen `https://`.
`DOMAIN` contiene solo el hostname, sin protocolo.

Validar Compose sin imprimir secretos:

```bash
docker compose -f docker-compose.prod.yml config --quiet
```

Levantar la aplicación:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Verificar contenedores y salud:

```bash
docker compose -f docker-compose.prod.yml ps
curl -i http://127.0.0.1/health
```

El healthcheck debe responder `HTTP/1.1 200 OK`.

## 7. DNS, Vercel, Cloudflare y HTTPS

### Dominio raíz en Vercel

El dominio raíz y `www` están asociados al proyecto estático de Vercel. Los
registros se crean en Cloudflare usando el destino exacto mostrado por Vercel:

| Tipo    | Nombre | Destino                 | Proxy    |
| ------- | ------ | ----------------------- | -------- |
| `CNAME` | `@`    | `<VERCEL_CNAME_TARGET>` | DNS only |
| `CNAME` | `www`  | `<VERCEL_CNAME_TARGET>` | DNS only |

Vercel sirve `www` como producción y redirige el dominio raíz hacia `www` con
una redirección permanente `308`.

Los registros de Vercel permanecen con nube gris para evitar colocar dos CDNs
en cadena.

### Aplicación de finanzas en OCI

El registro inicial se creó así:

| Tipo | Nombre     | Destino           | Proxy                               |
| ---- | ---------- | ----------------- | ----------------------------------- |
| `A`  | `finanzas` | `<VPS_PUBLIC_IP>` | DNS only durante la emisión inicial |

Después de que DNS resolviera al servidor, se configuró el `.env` con el
dominio y se recrearon backend y Caddy:

```bash
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml up -d --force-recreate backend caddy
docker compose -f docker-compose.prod.yml logs --tail=100 caddy
```

Caddy obtuvo automáticamente un certificado público y configuró la redirección
de HTTP a HTTPS. Después de comprobar HTTPS:

- Cloudflare SSL/TLS se configuró como `Full (strict)`.
- El registro `finanzas` se cambió a `Proxied` (nube naranja).
- Los registros de Vercel no se modificaron.

Verificaciones externas:

```bash
dig +short <APP_DOMAIN> A
curl -I https://<APP_DOMAIN>
curl -I http://<APP_DOMAIN>
```

Con el proxy activo, DNS devuelve IPs de Cloudflare y la respuesta HTTPS incluye
normalmente encabezados como `server: cloudflare` y `cf-ray`.

## 8. Actualizaciones de la aplicación

### Procedimiento manual de respaldo

Este procedimiento permanece disponible si GitHub Actions no está operativo:

```bash
cd ~/finanzas
git status --short
git pull --ff-only
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml ps
```

Antes de `git pull`, el estado debe estar limpio. Los archivos `.env`, dumps y
llaves no deben estar versionados.

Revisar logs cuando un servicio no quede saludable:

```bash
docker compose -f docker-compose.prod.yml logs --tail=200 <SERVICE_NAME>
```

Servicios válidos actualmente: `postgres`, `backend`, `frontend` y `caddy`.

### CI y despliegue mediante GitHub Actions

El workflow `.github/workflows/ci-deploy.yml` ejecuta en paralelo:

- backend: instalación reproducible, typecheck, pruebas y build;
- frontend: instalación reproducible, lint, pruebas y build.

Los pull requests solo ejecutan CI. Un push a `main` ejecuta el deploy después
de ambos jobs porque la variable de repositorio `PRODUCTION_DEPLOY_ENABLED`
está configurada como `true`. Cambiarla a otro valor o eliminarla desactiva el
deploy sin desactivar los checks de CI.

El job de deploy usa el environment `production` y estos secrets:

| Secret                | Contenido                                       |
| --------------------- | ----------------------------------------------- |
| `VPS_HOST`            | Host o IPv4 pública de la VPS                   |
| `VPS_USER`            | Usuario de despliegue, actualmente `opc`        |
| `VPS_SSH_PRIVATE_KEY` | Llave privada exclusiva de GitHub Actions       |
| `VPS_SSH_KNOWN_HOSTS` | Entrada verificada de `known_hosts` para la VPS |

La llave no abre una shell general. Su entrada en `authorized_keys` fuerza la
ejecución de `/home/opc/finanzas/scripts/deploy-production.sh`, rechaza
comandos distintos de `deploy <SHA>` y deshabilita forwarding y PTY.

El script:

1. adquiere un lock para impedir despliegues simultáneos;
2. exige que el checkout esté limpio y en `main`;
3. verifica que el SHA solicitado pertenezca a `origin/main`;
4. ejecuta el backup local y externo mediante
   `finanzas-backup.service`;
5. avanza Git únicamente mediante fast-forward;
6. valida y reconstruye Docker Compose;
7. espera hasta tres minutos por la salud interna del backend y PostgreSQL.

GitHub comprueba finalmente el endpoint público
`https://finanzas.esrichard.dev/health`. No se copian secretos de aplicación:
el archivo `.env` continúa existiendo únicamente en la VPS.

La automatización se activó el **2026-08-23**. El primer workflow manual completó
CI, backup previo, conexión SSH restringida, reconstrucción, salud interna y
salud pública. UptimeRobot permaneció `Up` y Healthchecks.io registró el backup.

Para desactivar despliegues sin afectar CI, eliminar la variable
`PRODUCTION_DEPLOY_ENABLED` o cambiar su valor a `false`. Para rotar la llave:

1. desactivar temporalmente el deploy;
2. generar un par Ed25519 nuevo y exclusivo;
3. añadir primero la nueva llave pública restringida a `authorized_keys`;
4. sustituir `VPS_SSH_PRIVATE_KEY` en el environment `production`;
5. ejecutar y validar un workflow manual;
6. retirar de `authorized_keys` la llave pública anterior;
7. eliminar de forma segura las copias innecesarias de la llave privada vieja.

Especificación: `docs/specs/SPEC-013-github-actions-deploy.md`.

## 9. Backups de PostgreSQL

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

## 10. Monitoreo externo de disponibilidad

Healthchecks.io y UptimeRobot cubren fallos distintos:

- Healthchecks.io espera que el job de backup envíe un heartbeat. Detecta que
  una tarea programada no terminó correctamente.
- UptimeRobot inicia una solicitud desde fuera de la infraestructura. Detecta
  que el dominio, Cloudflare, Caddy, el backend o PostgreSQL no responden.

El monitor de UptimeRobot está configurado sin credenciales ni headers
privados:

| Campo               | Valor                                   |
| ------------------- | --------------------------------------- |
| Tipo                | `HTTP(s)`                               |
| Nombre              | `Finanzas Production Health`            |
| URL                 | `https://finanzas.esrichard.dev/health` |
| Intervalo           | 5 minutos                               |
| Respuesta saludable | HTTP `200`                              |
| Contacto de alerta  | Correo del administrador                |

El endpoint ejecuta una consulta sencilla contra PostgreSQL con un timeout de
dos segundos. En condiciones normales devuelve:

```json
{
  "status": "ok",
  "checks": {
    "db": "ok"
  }
}
```

Si la base de datos falla o excede el timeout, responde HTTP `503` con estado
`degraded`; UptimeRobot debe considerar esa respuesta una caída. Este monitor
no prueba el inicio de sesión ni la ejecución del frontend en un navegador, por
lo que es una verificación de disponibilidad, no una prueba funcional completa.

Verificación manual desde cualquier equipo con acceso a Internet:

```bash
curl -i https://finanzas.esrichard.dev/health
```

`curl` hace una solicitud al endpoint público y `-i` incluye en la salida el
código y los headers HTTP. El resultado esperado es `HTTP/2 200` o
`HTTP/1.1 200`, junto con el JSON anterior. El monitor debe figurar `Up` y
tener asociado el contacto de correo verificado.

El monitor se activó y verificó en estado `Up` el **2026-08-22**.

No se documentan identificadores internos de UptimeRobot. Se recomienda
habilitar autenticación de dos factores en la cuenta y probar el canal de
notificación desde su panel, sin provocar una caída deliberada de producción.

Ante una alerta, comprobar en este orden:

1. Abrir el endpoint `/health` desde una red externa.
2. Revisar el estado de Cloudflare y la resolución DNS.
3. Entrar por SSH y ejecutar `docker compose ps` en el directorio del proyecto.
4. Consultar los logs recientes de Caddy, backend y PostgreSQL.
5. Comprobar CPU, memoria, disco y conectividad de la VPS.

## 11. Seguridad y diagnóstico

### Accesos SSH

Últimos accesos exitosos:

```bash
sudo last -ai -n 20
```

Últimos intentos fallidos:

```bash
sudo lastb -ai -n 20
```

Eventos SSH de las últimas 24 horas:

```bash
sudo journalctl -u sshd --since "24 hours" --no-pager
```

`Accepted publickey for opc` representa un acceso exitoso. `Failed publickey`
o `Invalid user` representan intentos fallidos.

### Red y recursos

Puertos escuchando:

```bash
sudo ss -lntup
```

Consumo de contenedores:

```bash
docker stats --no-stream
```

Espacio de Docker y del disco:

```bash
docker system df
df -h /
```

Estado general:

```bash
free -h
uptime
```

### Señales que requieren investigación

- Un `Accepted publickey` desde una IP o en un horario desconocido.
- Reinicios repetidos de contenedores.
- CPU sostenida cerca del 100 % sin carga esperada.
- Crecimiento abrupto de tráfico o disco.
- Respuestas `5xx` frecuentes.
- Timer de backup sin ejecuciones recientes.
- Backup con tamaño cero o validación distinta de `0`.
- Check de Healthchecks.io en estado `Late` o `Down`.
- Monitor de UptimeRobot en estado `Down` o con tiempos de respuesta anormales.

## 12. Gestión de secretos

- `.env` solo existe en la VPS y tiene permisos `600`.
- Las llaves privadas SSH solo existen en los equipos administradores.
- Los backups se consideran sensibles porque contienen todos los datos.
- La Ping URL de Healthchecks.io es un secreto operativo y tiene permisos
  `600` en la VPS.
- No imprimir `docker compose config` sin `--quiet` en canales compartidos.
- No copiar `.env` dentro de imágenes Docker ni añadirlo a Git.
- Rotar credenciales ante cualquier sospecha de exposición.

## 13. Recuperación de alto nivel

Para reconstruir el servicio después de perder la VPS:

1. Crear una nueva instancia compatible con ARM64.
2. Configurar red, SSH, Docker y firewall siguiendo esta guía.
3. Clonar el repositorio.
4. Crear un `.env` de producción con credenciales nuevas.
5. Levantar PostgreSQL y restaurar el último dump externo verificado.
6. Levantar backend, frontend y Caddy.
7. Actualizar el registro DNS del subdominio a la nueva IP.
8. Validar `/health`, autenticación y datos.
9. Reactivar el timer y comprobar una nueva copia.

La copia cifrada en R2 permite recuperar los datos aunque se pierda la
instancia. La recuperación depende de conservar fuera de la VPS la contraseña y
el salt de `rclone crypt`; las credenciales de acceso a R2 pueden rotarse o
recrearse. El procedimiento debe volver a probarse trimestralmente.
