# Acceso administrativo a PostgreSQL

[Índice de operaciones](README.md) ·
[ADR-012: acceso administrativo por SSH](../architecture/adr/ADR-012-ssh-tunneled-postgres-administration.md)

Este runbook documenta el acceso vigente a PostgreSQL desde DBeaver para
consultar y corregir datos de producción. No se publican PostgreSQL ni el proxy
en Internet y no se reutiliza el usuario de la aplicación para trabajo manual.

Los valores entre `<...>` son marcadores. No registrar aquí direcciones IP,
contraseñas ni llaves privadas.

## 1. Topología y límites

```text
DBeaver
   |
   | SSH :22
   v
VPS 127.0.0.1:15432
   |
   v
HAProxy (postgres-admin-proxy)
   |
   | red Docker internal
   v
PostgreSQL :5432
```

- `postgres` permanece únicamente en la red `internal` y no publica `5432`.
- `postgres-admin-proxy` participa en `internal` y `admin`, y publica solamente
  `127.0.0.1:15432` en el host.
- La configuración de HAProxy se incluye en su imagen; no se monta desde el
  filesystem de la VPS.
- OCI y `firewalld` no deben abrir `15432`. Desde fuera solo se usa SSH `22`.
- `finanzas_operator` puede ejecutar DML, pero no crear objetos ni administrar
  PostgreSQL.

## 2. Comprobar el proxy

En la VPS:

```bash
docker compose -f /home/opc/finanzas/docker-compose.prod.yml ps postgres postgres-admin-proxy
docker port finanzas-postgres-admin-proxy-1 15432/tcp
docker compose -f /home/opc/finanzas/docker-compose.prod.yml logs --tail=30 postgres-admin-proxy
```

La primera orden debe mostrar PostgreSQL `healthy` y el proxy `Up`; la segunda
debe devolver `127.0.0.1:15432`; la tercera debe incluir `Loading success` y no
errores de permisos.

## 3. Reconstruir el operador DML

Abrir `psql` con el usuario configurado dentro del contenedor:

```bash
docker compose -f /home/opc/finanzas/docker-compose.prod.yml exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

La orden no expande ni imprime la contraseña. Dentro de `psql`, crear un rol de
permisos y un login independiente:

```sql
CREATE ROLE finanzas_dml NOLOGIN;

CREATE ROLE finanzas_operator
WITH LOGIN
NOSUPERUSER
NOCREATEDB
NOCREATEROLE
NOREPLICATION;

\password finanzas_operator

GRANT CONNECT ON DATABASE finanzas TO finanzas_dml;
GRANT USAGE ON SCHEMA public TO finanzas_dml;
GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public TO finanzas_dml;
GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public TO finanzas_dml;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO finanzas_dml;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO finanzas_dml;

GRANT finanzas_dml TO finanzas_operator;
```

`\password` solicita el secreto sin escribirlo en el historial. Los `GRANT`
cubren las tablas y secuencias actuales; `ALTER DEFAULT PRIVILEGES`, las que el
usuario de la aplicación cree después mediante migraciones. Guardar la
contraseña en un gestor de secretos y salir con `\q`.

## 4. Configurar DBeaver

Crear una conexión PostgreSQL con:

| Campo PostgreSQL | Valor                |
| ---------------- | -------------------- |
| Host             | `127.0.0.1`          |
| Port             | `15432`              |
| Database         | `finanzas`           |
| Username         | `finanzas_operator`  |
| Password         | secreto del operador |

En la pestaña SSH activar el túnel y usar:

| Campo SSH       | Valor                         |
| --------------- | ----------------------------- |
| Host            | `<VPS_PUBLIC_IP>`             |
| Port            | `22`                          |
| Usuario         | `opc`                         |
| Autenticación   | `Public Key`                  |
| Llave privada   | `<SSH_PRIVATE_KEY_PATH>`      |

No crear un túnel manual adicional ni cambiar el binding de Compose a
`0.0.0.0`.

En `Edit Connection` → `General`, asignar el tipo `Production`. Este tipo usa
manual commit y confirmaciones para cambios. Si una sesión abierta aún muestra
`Auto`, reconectarla y cambiar el selector de transacciones a `Manual commit`.

## 5. Verificar y operar de forma segura

Desde DBeaver:

```sql
SELECT
    current_user,
    current_database(),
    has_schema_privilege(current_user, 'public', 'USAGE')
        AS puede_usar_schema,
    has_schema_privilege(current_user, 'public', 'CREATE')
        AS puede_crear_objetos,
    has_table_privilege(
        current_user,
        'public.movements',
        'SELECT,INSERT,UPDATE,DELETE'
    ) AS puede_modificar_movimientos;
```

La salida esperada identifica `finanzas_operator` y `finanzas`, con valores
`true`, `false` y `true` para los tres permisos respectivamente.

Para cualquier escritura:

1. Confirmar que la conexión y el editor indican `Production` y manual commit.
2. Ejecutar un `SELECT` con el mismo `WHERE` antes del cambio.
3. Ejecutar `UPDATE` o `DELETE` con filtro explícito y revisar las filas
   afectadas.
4. Usar `Commit` solo después de validar; usar `Rollback` ante cualquier duda.
5. No dejar una transacción abierta al cerrar la sesión.

El operador puede alterar o eliminar datos aunque no pueda cambiar el schema.
Los backups no reemplazan la revisión previa de cada sentencia.

## 6. Rotación o revocación

Para cambiar únicamente la contraseña, entrar a `psql` como en la sección 3 y
ejecutar `\password finanzas_operator`.

Para bloquear inmediatamente nuevos accesos:

```sql
ALTER ROLE finanzas_operator NOLOGIN;
```

La sentencia conserva los grants y evita nuevos inicios de sesión. Para
habilitarlo de nuevo después de revisar o rotar credenciales:

```sql
ALTER ROLE finanzas_operator LOGIN;
```
