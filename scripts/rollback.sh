#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# scripts/rollback.sh — revert to the previous deployment
#
# Usage:
#   bash scripts/rollback.sh              # uses .deploy.previous
#   bash scripts/rollback.sh <commit-sha> # explicit target
#
# What it does:
#   • git resets to the target commit
#   • rebuilds images
#   • restarts only this project's services
#   • does NOT roll back database migrations (Prisma migrations are
#     forward-only by design — recover the DB from a backup if a
#     destructive migration shipped). See scripts/backup.sh.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

step() { printf "\n\033[1;33m▸ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
fail() { printf "  \033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }

ENV_FILE="${REPO_DIR}/.env.production"
[[ -f "${ENV_FILE}" ]] || fail "Missing ${ENV_FILE}"

# Compose project name from env
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
: "${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME not set}"

# ── Determine target ─────────────────────────────────────────────
TARGET="${1:-}"
if [[ -z "${TARGET}" ]]; then
  [[ -f .deploy.previous ]] || fail "No .deploy.previous and no commit argument given."
  TARGET=$(< .deploy.previous)
fi
git rev-parse --quiet --verify "${TARGET}^{commit}" >/dev/null \
  || fail "Commit ${TARGET} not found in repo. Try: git fetch --all"

CURRENT=$(git rev-parse HEAD)
step "Rolling back"
echo "  From: ${CURRENT:0:12}"
echo "  To:   ${TARGET:0:12} ($(git log -1 --pretty=%s "${TARGET}"))"

# Save the commit we are abandoning, so the next rollback can
# move forward again if needed.
echo "${CURRENT}" > .deploy.previous

git checkout "${TARGET}"
ok "Checked out ${TARGET:0:12}"

# ── Rebuild + restart ────────────────────────────────────────────
COMPOSE=(docker compose
  --env-file "${ENV_FILE}"
  -f docker-compose.yml
  -f docker-compose.production.yml
  -p "${COMPOSE_PROJECT_NAME}")

step "Rebuilding"
"${COMPOSE[@]}" build --pull
ok "Built"

step "Restarting"
"${COMPOSE[@]}" up -d --remove-orphans
ok "Up"

# ── Health checks ────────────────────────────────────────────────
step "Health-checking"
attempt=0
until curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; do
  ((attempt++))
  if (( attempt > 18 )); then
    fail "Backend still unhealthy after rollback. Investigate immediately."
  fi
  sleep 5
done
ok "Backend healthy"

step "Rollback complete"
echo "  Live commit: $(git rev-parse --short HEAD)"
echo "  ⚠ Database migrations are NOT rolled back. If a destructive"
echo "    migration shipped, restore from /var/lib/oralign-app/backups."
