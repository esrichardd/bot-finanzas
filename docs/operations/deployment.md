# Despliegue de producción

[Índice de operaciones](README.md) ·
[ADR-009: despliegue por SHA exacto](../architecture/adr/ADR-009-exact-sha-restricted-ssh-deploy.md)

Este runbook documenta el despliegue automático vigente, la reconstrucción de
su acceso SSH restringido y el procedimiento manual de contingencia.

Los valores entre `<...>` son marcadores:

| Marcador                             | Significado                                        |
| ------------------------------------ | -------------------------------------------------- |
| `<VERIFIED_40_CHARACTER_COMMIT_SHA>` | Commit exacto que terminó correctamente sus checks |
| `<APP_DOMAIN>`                       | Dominio público de la aplicación                   |
| `<SERVICE_NAME>`                     | Servicio Compose que se quiere diagnosticar        |
| `<PUBLIC_KEY_DATA>`                  | Cuerpo de la llave pública exclusiva de CI         |
| `<VPS_HOST>`                         | Host o IPv4 pública de la VPS, sin protocolo       |

## 1. Procedimientos de despliegue

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

| Secret                | Valor que se copia de forma privada                                       |
| --------------------- | ------------------------------------------------------------------------- |
| `VPS_HOST`            | Host o IPv4 pública de la VPS, sin `https://`                             |
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
