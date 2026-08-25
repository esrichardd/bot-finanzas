# ADR-009: Desplegar un SHA exacto mediante SSH restringido

- Estado: Aceptado
- Fecha de registro: 2026-08-23

## Contexto

El despliegue automático debe publicar exactamente el commit que pasó CI sin
entregar a GitHub Actions una shell general en la VPS ni permitir downgrades o
divergencias accidentales.

## Decisión

GitHub Actions envía `deploy <SHA_DE_40_CARACTERES>` mediante una llave SSH
exclusiva. `authorized_keys` fuerza la ejecución de
`scripts/deploy-production.sh`, deshabilita PTY y forwarding, y rechaza otros
comandos.

El script valida que el SHA pertenezca a `origin/main`, sea descendiente del
estado desplegado y quede como `HEAD` exacto después de un fast-forward.

## Consecuencias

- CI no puede ejecutar una shell arbitraria con esa llave.
- Cada deploy crea primero un backup validado.
- Los despliegues simultáneos se bloquean mediante `flock`.
- Un rollback se representa con un nuevo revert en `main`.
- El job comprueba salud interna y pública.

## Evidencia

- `.github/workflows/ci-deploy.yml`
- `scripts/deploy-production.sh`
- `docs/operations/deployment.md`
