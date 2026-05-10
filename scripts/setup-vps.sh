#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# scripts/setup-vps.sh — first-time VPS preparation for oralign-app
#
# What it does (idempotent — safe to re-run):
#   • verifies Docker is installed
#   • creates /opt/oralign-app and persistent dirs under
#     /var/lib/oralign-app/{postgres,uploads,backups}
#   • configures UFW firewall (22, 80, 443 — DB stays internal)
#   • detects existing Nginx and viewer.oralign.com.tn config
#   • copies .env.production.example to .env.production if missing
#   • prints the manual steps the operator must perform next
#
# What it does NOT do:
#   • does not touch viewer.oralign.com.tn config
#   • does not pull repo (do that with `git clone` once, then deploy.sh)
#   • does not issue SSL (certbot is a separate manual step)
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

readonly APP_DIR="${APP_DIR:-/opt/oralign-app}"
readonly STATE_DIR="/var/lib/oralign-app"
readonly POSTGRES_DIR="${STATE_DIR}/postgres"
readonly UPLOADS_DIR="${STATE_DIR}/uploads"
readonly BACKUPS_DIR="${STATE_DIR}/backups"

step() { printf "\n\033[1;33m▸ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[1;33m!\033[0m %s\n" "$*"; }
fail() { printf "  \033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }

if [[ $EUID -ne 0 ]]; then
  fail "Run as root (or via sudo). This script touches /opt, /var/lib, and ufw."
fi

# ── 1. Docker present? ───────────────────────────────────────────
step "Checking Docker"
command -v docker >/dev/null 2>&1 || fail "Docker not found. Install it first."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 plugin not found."
ok "$(docker --version)"
ok "$(docker compose version)"

# ── 2. Persistent directories ────────────────────────────────────
step "Creating directories"
install -d -m 0755 "${APP_DIR}"
install -d -m 0700 "${POSTGRES_DIR}"   # Postgres requires 0700 on PGDATA parent
install -d -m 0755 "${UPLOADS_DIR}"
install -d -m 0750 "${BACKUPS_DIR}"
ok "${APP_DIR}"
ok "${POSTGRES_DIR}"
ok "${UPLOADS_DIR}"
ok "${BACKUPS_DIR}"

# Postgres in the official image runs as uid 70 (alpine) — chown so the
# container can write to the bind mount on first start.
chown -R 70:70 "${POSTGRES_DIR}" || warn "Could not chown ${POSTGRES_DIR} (will retry on first container start)"
# Backend container runs as uid 1001 (see Dockerfile)
chown -R 1001:1001 "${UPLOADS_DIR}" || warn "Could not chown ${UPLOADS_DIR}"

# ── 3. Firewall ──────────────────────────────────────────────────
step "Configuring firewall (ufw)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  # Postgres + Redis are bound to 127.0.0.1 in the production compose,
  # so no public ufw rule for them. Be defensive anyway:
  ufw deny 5432/tcp >/dev/null || true
  ufw deny 6379/tcp >/dev/null || true
  if ! ufw status | grep -q "Status: active"; then
    warn "ufw is installed but inactive. Enable with: ufw --force enable"
  else
    ok "ufw active — 22/80/443 allowed, 5432/6379 denied externally"
  fi
else
  warn "ufw not installed — install with: apt-get install ufw"
fi

# ── 4. Nginx detection ───────────────────────────────────────────
step "Detecting existing Nginx"
if command -v nginx >/dev/null 2>&1; then
  ok "Nginx present: $(nginx -v 2>&1)"
  if [[ -f /etc/nginx/sites-enabled/viewer.oralign.com.tn ]] || \
     grep -rq "viewer.oralign.com.tn" /etc/nginx/sites-enabled 2>/dev/null; then
    ok "viewer.oralign.com.tn server block detected — will NOT be touched"
  else
    warn "No viewer.oralign.com.tn server block found in /etc/nginx/sites-enabled"
    warn "If viewer is served via another mechanism (Apache, Caddy, Docker), verify before continuing."
  fi
else
  warn "Nginx not installed. Install with: apt-get install nginx"
fi

# ── 5. .env.production scaffolding ───────────────────────────────
step "Environment file"
ENV_FILE="${APP_DIR}/.env.production"
EXAMPLE_FILE="${APP_DIR}/.env.production.example"
if [[ -f "${ENV_FILE}" ]]; then
  ok ".env.production already exists — leaving untouched"
elif [[ -f "${EXAMPLE_FILE}" ]]; then
  cp "${EXAMPLE_FILE}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  ok "Created ${ENV_FILE} from example (mode 600)"
  warn "Edit ${ENV_FILE} and replace every __PLACEHOLDER__ before deploying."
else
  warn "${EXAMPLE_FILE} not found yet — create after first git clone, then re-run this script."
fi

# ── 6. Next steps ────────────────────────────────────────────────
step "Manual steps you still need to do"
cat <<EOF

  1. Clone the repo (once) and put it at ${APP_DIR}:
       cd /opt && rm -rf oralign-app
       git clone https://github.com/sakerhajji/oralign.git oralign-app

  2. Edit ${ENV_FILE} and replace EVERY value marked __...__
     Generate strong secrets with:
       openssl rand -base64 48

  3. Copy Nginx server blocks (without touching viewer.oralign.com.tn):
       cp ${APP_DIR}/deploy/nginx/oralign.com.tn.conf      /etc/nginx/sites-available/
       cp ${APP_DIR}/deploy/nginx/api.oralign.com.tn.conf  /etc/nginx/sites-available/
       ln -sf /etc/nginx/sites-available/oralign.com.tn      /etc/nginx/sites-enabled/
       ln -sf /etc/nginx/sites-available/api.oralign.com.tn  /etc/nginx/sites-enabled/
       nginx -t && systemctl reload nginx

  4. Issue Let's Encrypt certificates (only for the new domains;
     viewer's existing cert is untouched):
       certbot --nginx -d oralign.com.tn -d www.oralign.com.tn
       certbot --nginx -d api.oralign.com.tn

  5. First deploy:
       cd ${APP_DIR}
       bash scripts/deploy.sh

  6. Verify viewer is unaffected:
       curl -I https://viewer.oralign.com.tn

EOF

ok "Setup complete."
