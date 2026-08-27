#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly APP_USER="opc"
readonly APP_DIR="/home/opc/finanzas"
readonly COMPOSE_FILE="${APP_DIR}/docker-compose.prod.yml"
readonly STATE_DIR="/home/opc/.local/state"
readonly LOCK_FILE="${STATE_DIR}/finanzas-deploy.lock"

fail() {
  printf 'Deployment failed: %s\n' "$*" >&2
  exit 1
}

[[ "$(id -un)" == "${APP_USER}" ]] ||
  fail "this script must run as ${APP_USER}"

readonly original_command="${SSH_ORIGINAL_COMMAND:-}"
if [[ "${original_command}" =~ ^deploy[[:space:]]+([0-9a-f]{40})$ ]]; then
  readonly target_sha="${BASH_REMATCH[1]}"
else
  fail "the restricted SSH key only accepts: deploy <40-character SHA>"
fi

for required_command in docker flock git sudo; do
  command -v "${required_command}" >/dev/null ||
    fail "required command not found: ${required_command}"
done

mkdir -p "${STATE_DIR}"
exec 9>"${LOCK_FILE}"
flock -n 9 || fail "another deployment is already running"

cd "${APP_DIR}"

[[ "$(git branch --show-current)" == "main" ]] ||
  fail "the production checkout is not on main"

[[ -z "$(git status --porcelain)" ]] ||
  fail "the production checkout has uncommitted or untracked changes"

git fetch --quiet --prune \
  origin \
  "+refs/heads/main:refs/remotes/origin/main"

git cat-file -e "${target_sha}^{commit}" 2>/dev/null ||
  fail "the requested commit does not exist"

git merge-base --is-ancestor "${target_sha}" refs/remotes/origin/main ||
  fail "the requested commit does not belong to origin/main"

readonly current_sha="$(git rev-parse HEAD)"
git merge-base --is-ancestor "${current_sha}" "${target_sha}" ||
  fail "the requested commit is older than or diverges from production HEAD"

printf 'Creating a validated pre-deployment backup...\n'
sudo -n systemctl start finanzas-backup.service

printf 'Updating production to commit %s...\n' "${target_sha}"
git merge --ff-only "${target_sha}"

readonly deployed_sha="$(git rev-parse HEAD)"
[[ "${deployed_sha}" == "${target_sha}" ]] ||
  fail "production HEAD does not match the requested commit"

# Docker Compose pasa este SHA al backend como service.version de OpenTelemetry.
# Permite relacionar trazas y errores con el commit exacto desplegado.
export OTEL_SERVICE_VERSION="${deployed_sha}"

docker compose -f "${COMPOSE_FILE}" config --quiet
docker compose -f "${COMPOSE_FILE}" up --build -d --remove-orphans

for attempt in {1..36}; do
  if docker compose -f "${COMPOSE_FILE}" exec -T backend \
    wget -q -O- http://localhost:3000/health >/dev/null; then
    docker compose -f "${COMPOSE_FILE}" ps
    printf 'Deployment completed successfully: %s\n' "${target_sha}"
    exit 0
  fi

  printf 'Waiting for backend health (%d/36)...\n' "${attempt}"
  sleep 5
done

docker compose -f "${COMPOSE_FILE}" logs \
  --tail=100 \
  backend frontend caddy >&2
fail "the backend did not become healthy within 180 seconds"
