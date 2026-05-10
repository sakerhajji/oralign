#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# scripts/backup.sh — timestamped Postgres + uploads backup
#
# Suggested cron (as the deploy user):
#   0 3 * * * /opt/oralign-app/scripts/backup.sh >> /var/log/oralign-backup.log 2>&1
#
# Backups land in ${BACKUPS_HOST_DIR} (default /var/lib/oralign-app/backups):
#   db_<timestamp>.sql.gz
#   uploads_<timestamp>.tar.gz
#
# Old backups beyond ${BACKUP_KEEP_LAST} are deleted.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

step() { printf "\n\033[1;34m▸ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
fail() { printf "  \033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }

ENV_FILE="${REPO_DIR}/.env.production"
[[ -f "${ENV_FILE}" ]] || fail "Missing ${ENV_FILE}"
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME not set}"
: "${DB_USER:?DB_USER not set}"
: "${DB_NAME:?DB_NAME not set}"
: "${UPLOADS_HOST_DIR:?UPLOADS_HOST_DIR not set}"
: "${BACKUPS_HOST_DIR:?BACKUPS_HOST_DIR not set}"
KEEP="${BACKUP_KEEP_LAST:-14}"

mkdir -p "${BACKUPS_HOST_DIR}"
TS=$(date -u +%Y%m%dT%H%M%SZ)
DB_FILE="${BACKUPS_HOST_DIR}/db_${TS}.sql.gz"
UP_FILE="${BACKUPS_HOST_DIR}/uploads_${TS}.tar.gz"

# ── Postgres ─────────────────────────────────────────────────────
step "Postgres dump → ${DB_FILE}"
docker exec -e PGPASSWORD="${DB_PASSWORD}" \
  "${COMPOSE_PROJECT_NAME}-postgres-1" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" --no-owner --clean --if-exists \
  | gzip > "${DB_FILE}"
ok "$(du -h "${DB_FILE}" | cut -f1) written"

# ── Uploads ──────────────────────────────────────────────────────
step "Uploads tarball → ${UP_FILE}"
if [[ -d "${UPLOADS_HOST_DIR}" ]]; then
  tar -czf "${UP_FILE}" -C "$(dirname "${UPLOADS_HOST_DIR}")" "$(basename "${UPLOADS_HOST_DIR}")"
  ok "$(du -h "${UP_FILE}" | cut -f1) written"
else
  ok "${UPLOADS_HOST_DIR} does not exist yet — skipped uploads tarball"
fi

# ── Rotation ─────────────────────────────────────────────────────
step "Rotation — keeping last ${KEEP} of each type"
prune() {
  local pattern="$1"
  # mapfile collects the file list, then we delete past the keep count
  mapfile -t files < <(find "${BACKUPS_HOST_DIR}" -maxdepth 1 -type f -name "${pattern}" -printf "%T@ %p\n" \
                       | sort -nr | awk '{ $1=""; sub(/^ /, ""); print }')
  if (( ${#files[@]} > KEEP )); then
    for f in "${files[@]:KEEP}"; do
      rm -f "$f"
      ok "removed $(basename "$f")"
    done
  fi
}
prune "db_*.sql.gz"
prune "uploads_*.tar.gz"

step "Backup complete"
ls -lh "${BACKUPS_HOST_DIR}" | tail -n 6
