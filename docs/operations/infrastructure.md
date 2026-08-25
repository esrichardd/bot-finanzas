# Infraestructura y configuración inicial

[Índice de operaciones](README.md) ·
[ADR-008: topología de mismo origen](../architecture/adr/ADR-008-same-origin-compose-topology.md)

Este runbook documenta el estado de producción y cómo reconstruir la base de la
VPS hasta dejar la aplicación accesible por HTTPS. No incluye actualizaciones
de código posteriores ni recuperación de backups, que tienen runbooks propios.

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
- Grafana Alloy envía métricas del host a Grafana Cloud para mostrar recursos
  y alertar por CPU, memoria, disco o ausencia de telemetría.
- GitHub Actions valida backend y frontend y despliega automáticamente los
  pushes a `main` mediante una llave SSH exclusiva y restringida.

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
y una IPv4 pública a la VNIC principal. La IP pública recibe SSH y el tráfico
HTTP/HTTPS que Cloudflare reenvía hacia Caddy.

Puertos necesarios:

| Puerto | Protocolo | Uso                                           |
| ------ | --------- | --------------------------------------------- |
| `22`   | TCP       | SSH                                           |
| `80`   | TCP       | HTTP, redirección a HTTPS y validaciones ACME |
| `443`  | TCP       | HTTPS                                         |

No abrir públicamente:

- `3000`: frontend y backend se comunican dentro de Docker.
- `5432`: PostgreSQL debe permanecer privado.

La Security List de la subred contiene reglas públicas para `80` y `443`.
Cloudflare actúa como proxy del dominio, mientras que el origen conserva esos
dos puertos accesibles directamente por su IPv4 pública.

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
