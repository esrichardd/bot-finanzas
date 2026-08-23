# SPEC-013: CI y despliegue automático a producción

**Estado: ✅ completado — 2026-08-23**

Ejecutar cumpliendo `ARCHITECTURE.md` y `docs/OPERATIONS.md`.

## Objetivo

Validar cada cambio con GitHub Actions y desplegar automáticamente los pushes a
`main` en la VPS, sin almacenar el `.env` de producción ni reutilizar la llave
SSH personal del administrador.

## Alcance

Incluye:

- checks independientes de backend y frontend;
- deploy únicamente después de que todos los checks pasen;
- llave SSH exclusiva, con comando forzado y sin sesión interactiva;
- despliegue serializado del SHA exacto que disparó el workflow;
- backup validado antes de ejecutar migraciones;
- actualización Git fast-forward;
- reconstrucción con Docker Compose;
- verificaciones de salud interna y pública;
- omisión del deploy para pushes exclusivamente documentales;
- procedimiento manual como fallback.

No incluye:

- cambiar el repositorio a privado;
- almacenar secretos de aplicación en GitHub;
- rollback automático de migraciones;
- runners autohospedados;
- Cloudflare Tunnel.

## Seguridad

- El workflow usa `push`, `pull_request` y `workflow_dispatch`; queda prohibido
  `pull_request_target`.
- `GITHUB_TOKEN` recibe únicamente `contents: read`.
- No se usan actions de terceros para SSH.
- La llave de CI solo puede invocar `deploy <SHA>` mediante
  `SSH_ORIGINAL_COMMAND`; se deshabilitan PTY, forwarding y sesiones arbitrarias
  en `authorized_keys`.
- La host key de la VPS se fija en `known_hosts`; no se permite
  `StrictHostKeyChecking=no`.
- Los secretos viven en el environment de GitHub `production`.
- La variable de repositorio `PRODUCTION_DEPLOY_ENABLED` se habilita solamente
  después de completar y probar la configuración de la VPS.

## Checks requeridos

Backend:

1. `npm ci`;
2. typecheck;
3. pruebas, incluidas las integraciones con Testcontainers/PostgreSQL;
4. build TypeScript.

Frontend:

1. instalación pnpm con lockfile congelado;
2. lint;
3. pruebas;
4. build Next.js.

## Criterios de aceptación

- [x] Existe `.github/workflows/ci-deploy.yml`.
- [x] Existe `scripts/deploy-production.sh`.
- [x] Los checks no reciben secretos de producción.
- [x] El job de deploy queda deshabilitado hasta la activación explícita.
- [x] Los pushes exclusivamente documentales conservan CI y omiten el deploy.
- [x] La llave exclusiva está instalada y restringida en la VPS.
- [x] El environment `production` contiene los cuatro secrets requeridos.
- [x] El primer deploy manual desde Actions termina correctamente.
- [x] Un push posterior a `main` despliega automáticamente.
- [x] UptimeRobot permanece `Up` después de la prueba.
- [x] `docs/OPERATIONS.md` registra la activación y fecha de verificación.
