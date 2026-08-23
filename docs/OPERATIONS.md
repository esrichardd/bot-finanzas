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

### Procedimiento manual de contingencia

Este procedimiento permanece disponible si GitHub Actions no está operativo.
Solo se debe desplegar un SHA completo de 40 caracteres cuyos checks hayan
terminado correctamente. No desplegar `origin/main` a ciegas ni una rama
mutable.

Entrar al repositorio y comprobar que producción no contiene cambios locales:

```bash
cd /home/opc/finanzas
git status --short
```

`cd` selecciona el checkout de producción y `git status --short` muestra
cambios versionados o archivos nuevos. La segunda orden no debe imprimir nada.
Los archivos `.env`, dumps y llaves no deben estar versionados.

Definir el commit validado, actualizar únicamente la referencia remota de
`main` y comprobar que el commit existe, pertenece a esa rama y es un avance
desde el estado actual:

```bash
target_sha="<VERIFIED_40_CHARACTER_COMMIT_SHA>"
git fetch --quiet --prune origin "+refs/heads/main:refs/remotes/origin/main"
git cat-file -e "${target_sha}^{commit}"
git merge-base --is-ancestor "${target_sha}" refs/remotes/origin/main
git merge-base --is-ancestor HEAD "${target_sha}"
```

- `target_sha=...` guarda el identificador inmutable que se quiere desplegar.
- `git fetch` actualiza `origin/main` y elimina referencias remotas obsoletas;
  no modifica todavía los archivos de producción.
- `git cat-file` comprueba que el objeto existe y es un commit.
- El primer `git merge-base` exige que el commit pertenezca a `origin/main`.
- El segundo exige que producción pueda avanzar hasta él sin downgrade ni
  divergencia.

Las tres comprobaciones Git terminan sin salida cuando son correctas y con
código distinto de cero cuando deben detener el procedimiento.

Crear y validar el mismo backup local y externo que precede al deploy
automático:

```bash
sudo systemctl start finanzas-backup.service
sudo systemctl show finanzas-backup.service --property=Result --property=ExecMainStatus
```

La primera orden ejecuta el backup bloqueando hasta que termine. La segunda
muestra su resultado; debe indicar `Result=success` y `ExecMainStatus=0`. No
continuar si el backup falla.

Avanzar exactamente al SHA y verificar que `HEAD` quedó en ese valor:

```bash
git merge --ff-only "${target_sha}"
test "$(git rev-parse HEAD)" = "${target_sha}"
```

`git merge --ff-only` prohíbe merges implícitos y `test` falla si el checkout
no coincide exactamente con el commit solicitado. Un workflow antiguo no se
utiliza como mecanismo de rollback: se debe crear un revert nuevo en `main`.

Validar la configuración, reconstruir los servicios y comprobar su estado:

```bash
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml up --build -d --remove-orphans
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml exec -T backend wget -q -O- http://localhost:3000/health
curl --fail-with-body --silent --show-error "https://<APP_DOMAIN>/health"
```

- `config --quiet` valida Compose sin imprimir secretos.
- `up --build -d --remove-orphans` reconstruye en segundo plano y retira
  contenedores de servicios que ya no existen en el archivo.
- `ps` muestra estado y health de los contenedores.
- `exec ... wget` comprueba el backend y PostgreSQL desde la red interna.
- `curl` verifica el recorrido público completo por Cloudflare y Caddy.

Si una verificación falla, revisar logs y corregir mediante un commit o revert
normal; no usar `git reset --hard` sobre producción.

Revisar logs cuando un servicio no quede saludable:

```bash
docker compose -f docker-compose.prod.yml logs --tail=200 <SERVICE_NAME>
```

Servicios válidos actualmente: `postgres`, `backend`, `frontend` y `caddy`.

### CI y despliegue mediante GitHub Actions

#### Reconstrucción del acceso restringido

Este procedimiento se ejecuta después de clonar el repositorio en
`/home/opc/finanzas`, instalar Docker y activar el servicio de backup. Usa una
llave exclusiva para CI; nunca reutiliza la llave SSH personal.

En la VPS, verificar el checkout, el ejecutable y sus dependencias:

```bash
cd /home/opc/finanzas
git branch --show-current
git status --short
test -x scripts/deploy-production.sh
command -v docker git flock sudo
sudo -n -l /usr/bin/systemctl start finanzas-backup.service
```

- Las dos primeras órdenes deben mostrar `main` y después ninguna modificación.
- `test -x` verifica que Git conservó el permiso ejecutable del script y no
  imprime nada cuando es correcto.
- `command -v` confirma que las cuatro herramientas requeridas están instaladas.
- `sudo -n -l` consulta, sin ejecutar el backup, si `opc` puede iniciar el
  servicio sin contraseña.

Si la última comprobación falla y el usuario no dispone ya de esa autorización,
crear una regla mínima con:

```bash
sudo visudo -f /etc/sudoers.d/finanzas-deploy
```

`visudo` abre el archivo con validación de sintaxis. Agregar exactamente esta
línea:

```sudoers
opc ALL=(root) NOPASSWD: /usr/bin/systemctl start finanzas-backup.service
```

Después, asegurar permisos y validar de nuevo el archivo:

```bash
sudo chmod 440 /etc/sudoers.d/finanzas-deploy
sudo visudo -cf /etc/sudoers.d/finanzas-deploy
```

`chmod 440` impide modificar la regla sin privilegios y `visudo -cf` comprueba
que sea válida. No conceder a la llave de CI permiso para ejecutar cualquier
orden con `sudo`.

En el equipo administrador, generar el par Ed25519 exclusivo. Si esos archivos
ya existen, no sobrescribirlos salvo que se esté haciendo una rotación
intencional:

```bash
install -m 700 -d "$HOME/.ssh"
ssh-keygen -t ed25519 -N "" -f "$HOME/.ssh/finanzas-github-actions" -C "github-actions-finanzas-production"
chmod 600 "$HOME/.ssh/finanzas-github-actions"
chmod 644 "$HOME/.ssh/finanzas-github-actions.pub"
```

- `install` crea `~/.ssh` con acceso exclusivo del usuario.
- `ssh-keygen` crea una llave dedicada sin passphrase porque el job es no
  interactivo; la restricción del servidor y el secret de GitHub son
  obligatorios para compensarlo.
- Los `chmod` protegen la llave privada y permiten leer la pública.

Mostrar únicamente la llave pública que debe instalarse en la VPS:

```bash
cat "$HOME/.ssh/finanzas-github-actions.pub"
```

`cat` imprime la parte pública; nunca ejecutar el equivalente sobre la llave
sin extensión `.pub` en una terminal compartida.

En la VPS, preparar el archivo de llaves autorizadas:

```bash
install -m 700 -d "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
vi "$HOME/.ssh/authorized_keys"
```

Las primeras órdenes crean y protegen los archivos; `vi` permite añadir una
sola línea con este formato, sustituyendo únicamente los marcadores:

```text
restrict,command="/home/opc/finanzas/scripts/deploy-production.sh" ssh-ed25519 <PUBLIC_KEY_DATA> github-actions-finanzas-production
```

`restrict` deshabilita PTY, forwarding, X11, agent forwarding y `user-rc`.
`command=...` ignora cualquier shell solicitada y siempre ejecuta el script,
que solo acepta `deploy <SHA_DE_40_CARACTERES>`.

La host key no se debe confiar únicamente porque la devuelva la red. En la VPS,
obtener por el canal administrativo el fingerprint Ed25519:

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

La orden lee la clave pública del servidor y muestra su fingerprint; no expone
la clave privada. En el equipo administrador, capturar la clave anunciada y
mostrar su fingerprint:

```bash
vps_host="<VPS_HOST>"
ssh-keyscan -t ed25519 "$vps_host" > "$HOME/.ssh/finanzas-github-actions.known_hosts"
ssh-keygen -lf "$HOME/.ssh/finanzas-github-actions.known_hosts"
chmod 600 "$HOME/.ssh/finanzas-github-actions.known_hosts"
```

`vps_host=...` guarda el host sin protocolo, `ssh-keyscan` crea la línea para
`known_hosts`, `ssh-keygen -lf` calcula su fingerprint y `chmod` protege el
archivo. Comparar visualmente ambos fingerprints por un canal confiable; si
difieren, no continuar.

Antes de guardar secretos en GitHub, comprobar que la llave no abre una shell
ni acepta otro comando:

```bash
vps_host="<VPS_HOST>"
ssh \
  -i "$HOME/.ssh/finanzas-github-actions" \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  "opc@${vps_host}" \
  "echo forbidden"
echo $?
```

`ssh` intenta ejecutar una orden no permitida y debe ser rechazada por el
script. `echo $?` imprime el código de la conexión anterior y debe ser distinto
de `0`. Una sesión sin comando también debe fallar o negar la asignación de PTY.

En GitHub, crear el environment `production`, limitar sus deployment branches
a `main` y agregar estos cuatro environment secrets:

| Secret                | Valor que se copia de forma privada                                      |
| --------------------- | ------------------------------------------------------------------------- |
| `VPS_HOST`            | Host o IPv4 pública de la VPS, sin `https://`                              |
| `VPS_USER`            | `opc`                                                                     |
| `VPS_SSH_PRIVATE_KEY` | Contenido completo de `~/.ssh/finanzas-github-actions`                    |
| `VPS_SSH_KNOWN_HOSTS` | Línea completa del archivo `.known_hosts` cuyo fingerprint fue verificado |

No pegar estos valores en commits, logs, capturas ni documentación. Finalmente,
crear la repository variable `PRODUCTION_DEPLOY_ENABLED` con valor `true`.
Mantenerla ausente o en `false` hasta completar todas las verificaciones
anteriores.

Ejecutar una vez `CI and production deploy` mediante `workflow_dispatch` y
comprobar que backend, frontend, backup, despliegue y salud pública terminan en
verde. Después, un push no documental a `main` valida el disparo automático.

El workflow `.github/workflows/ci-deploy.yml` ejecuta en paralelo:

- detección: clasifica si el push contiene cambios que afectan producción;
- backend: instalación reproducible, typecheck, pruebas y build;
- frontend: instalación reproducible, lint, pruebas y build.

Los pull requests solo ejecutan CI. En pushes a `main`, los cambios que estén
exclusivamente dentro de `docs/` o cuyos nombres terminen en `.md` ejecutan los
checks, pero omiten el deploy, el backup previo y la reconstrucción. Si el mismo
push contiene al menos otro archivo, se considera un cambio de producción.

Un lanzamiento mediante `workflow_dispatch` siempre fuerza el deploy. En los
demás pushes elegibles, el deploy se ejecuta después de ambos jobs porque la
variable de repositorio `PRODUCTION_DEPLOY_ENABLED` está configurada como
`true`. Cambiarla a otro valor o eliminarla desactiva el deploy sin desactivar
los checks de CI.

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
4. rechaza downgrades o divergencias respecto del `HEAD` actual;
5. ejecuta el backup local y externo mediante
   `finanzas-backup.service`;
6. avanza Git mediante fast-forward y comprueba que `HEAD` sea exactamente el
   SHA solicitado;
7. valida y reconstruye Docker Compose;
8. espera hasta tres minutos por la salud interna del backend y PostgreSQL.

GitHub comprueba finalmente el endpoint público
`https://finanzas.esrichard.dev/health`. No se copian secretos de aplicación:
el archivo `.env` continúa existiendo únicamente en la VPS.

La automatización se activó el **2026-08-23**. El primer workflow manual completó
CI, backup previo, conexión SSH restringida, reconstrucción, salud interna y
salud pública. UptimeRobot permaneció `Up` y Healthchecks.io registró el backup.
Un push posterior a `main` completó también el despliegue automático end-to-end.

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
