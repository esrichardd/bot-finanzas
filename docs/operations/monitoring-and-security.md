# Monitoreo, seguridad y recuperación

[Índice de operaciones](README.md)

Este runbook documenta los monitores externos, las comprobaciones de seguridad,
el diagnóstico del host, la gestión de secretos y la recuperación general.
Las métricas internas y alertas de Grafana se documentan en el
[runbook de observabilidad](observability.md). El acceso manual a la base se
documenta en [acceso administrativo a PostgreSQL](database-access.md).

## 1. Monitoreo externo de disponibilidad

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

## 2. Seguridad y diagnóstico

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
- Alerta de Grafana por CPU, memoria, disco raíz o ausencia de métricas.

## 3. Gestión de secretos

- `.env` solo existe en la VPS y tiene permisos `600`.
- Las llaves privadas SSH solo existen en los equipos administradores.
- La contraseña de `finanzas_operator` se guarda en un gestor de secretos y no
  reutiliza `POSTGRES_PASSWORD`.
- Los backups se consideran sensibles porque contienen todos los datos.
- La Ping URL de Healthchecks.io es un secreto operativo y tiene permisos
  `600` en la VPS.
- No imprimir `docker compose config` sin `--quiet` en canales compartidos.
- No copiar `.env` dentro de imágenes Docker ni añadirlo a Git.
- Rotar credenciales ante cualquier sospecha de exposición.

## 4. Recuperación de alto nivel

Para reconstruir el servicio después de perder la VPS:

1. Crear una nueva instancia compatible con ARM64.
2. Configurar red, SSH, Docker y firewall siguiendo
   [el runbook de infraestructura](infrastructure.md).
3. Clonar el repositorio.
4. Crear un `.env` de producción con credenciales nuevas.
5. Levantar PostgreSQL y restaurar el último dump externo verificado siguiendo
   [el runbook de backups](backups-and-restore.md).
6. Levantar backend, frontend y Caddy.
7. Actualizar el registro DNS del subdominio a la nueva IP.
8. Validar `/health`, autenticación y datos.
9. Reactivar el timer y comprobar una nueva copia según el runbook de backups.
10. Reinstalar Alloy y validar las alertas según el
    [runbook de observabilidad](observability.md).

La copia cifrada en R2 permite recuperar los datos aunque se pierda la
instancia. La recuperación depende de conservar fuera de la VPS la contraseña y
el salt de `rclone crypt`; las credenciales de acceso a R2 pueden rotarse o
recrearse. El procedimiento debe volver a probarse trimestralmente.
