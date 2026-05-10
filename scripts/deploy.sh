#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# scripts/deploy.sh — production deploy on the VPS
#
# Run from the repo root (e.g. /opt/oralign-app):
#   bash scripts/deploy.sh
#
# What it does:
#   • validates required env vars
#   • snapshots the current commit for rollback
#   • git fetch + fast-forward pull from origin/main
#   • builds new images with --pull for base-image security updates
#   • runs `prisma migrate deploy` in a one-shot container BEFORE
#     restarting services (so a bad migration aborts deploy without
#     touching the running app)
#   • brings services up
#   • health-checks frontend + backend
#   • prunes only oralign-app's dangling images (viewer is untouched)
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Locate ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

step() { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
fail() { printf "  \033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }

# ── 1. Env file ──────────────────────────────────────────────────
step "Checking environment"
ENV_FILE="${REPO_DIR}/.env.production"
[[ -f "${ENV_FILE}" ]] || fail "Missing ${ENV_FILE} — run scripts/setup-vps.sh and edit the file first."

# Refuse to deploy with placeholders still in the env file
if grep -E '^[A-Z_]+=__' "${ENV_FILE}" >/dev/null; then
  fail "${ENV_FILE} still contains __PLACEHOLDER__ values — fill them before deploying."
fi

# Load env so we can validate critical vars without leaking them to logs.
# `set -a` exports each var, `set +a` restores normal scoping.
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

REQUIRED_VARS=(
  COMPOSE_PROJECT_NAME DATABASE_URL JWT_SECRET JWT_REFRESH_SECRET
  JWT_RESET_SECRET FRONTEND_URL NEXT_PUBLIC_API_URL
  POSTGRES_HOST_DIR UPLOADS_HOST_DIR
)
for var in "${REQUIRED_VARS[@]}"; do
  [[ -n "${!var:-}" ]] || fail "Required env var ${var} is empty"
done
ok "Env file loaded (${#REQUIRED_VARS[@]} required vars present)"

# ── 2. Snapshot for rollback ─────────────────────────────────────
step "Recording rollback point"
PREV_COMMIT=$(git rev-parse HEAD)
echo "${PREV_COMMIT}" > .deploy.previous
ok "Previous commit: ${PREV_COMMIT:0:12}"

# ── 3. Pull latest ───────────────────────────────────────────────
step "Pulling latest code"
git fetch --prune origin
git checkout main
git pull --ff-only origin main
NEW_COMMIT=$(git rev-parse HEAD)
ok "Now at ${NEW_COMMIT:0:12} ($(git log -1 --pretty=%s))"

# ── 4. Compose helper ────────────────────────────────────────────
COMPOSE=(docker compose
  --env-file "${ENV_FILE}"
  -f docker-compose.yml
  -f docker-compose.production.yml
  -p "${COMPOSE_PROJECT_NAME}")

# ── 5. Build images ──────────────────────────────────────────────
step "Building images"
"${COMPOSE[@]}" build --pull
ok "Images built"

# ── 6. Migrations BEFORE restart ─────────────────────────────────
# Run in a one-shot container so a bad migration aborts the deploy
# without taking down the running backend.
step "Running database migrations (prisma migrate deploy)"
"${COMPOSE[@]}" up -d postgres
"${COMPOSE[@]}" run --rm --no-deps backend \
  node node_modules/.bin/prisma migrate deploy
ok "Migrations applied"

# ── 7. Start / restart services ──────────────────────────────────
step "Starting services"
"${COMPOSE[@]}" up -d --remove-orphans
ok "Services up"

# ── 8. Health checks ─────────────────────────────────────────────
step "Health-checking"
sleep 5
attempt=0
until curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; do
  ((attempt++))
  if (( attempt > 18 )); then
    fail "Backend health check never passed. Logs: docker compose -p ${COMPOSE_PROJECT_NAME} logs backend"
  fi
  sleep 5
done
ok "Backend healthy"

attempt=0
until curl -fsS -o /dev/null "http://127.0.0.1:3001"; do
  ((attempt++))
  if (( attempt > 12 )); then
    fail "Frontend never responded. Logs: docker compose -p ${COMPOSE_PROJECT_NAME} logs frontend"
  fi
  sleep 5
done
ok "Frontend healthy"

# ── 9. Safe prune (only this project's dangling layers) ──────────
step "Pruning unused images for ${COMPOSE_PROJECT_NAME}"
docker image prune -f --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" >/dev/null
ok "Pruned"

step "Done"
echo "  Deployed commit:  ${NEW_COMMIT:0:12}"
echo "  Rollback target:  ${PREV_COMMIT:0:12}"
echo "  Logs:             docker compose -p ${COMPOSE_PROJECT_NAME} logs -f"
