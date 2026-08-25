#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# scripts/apply-nginx.sh — sync the repo's nginx vhosts to the VPS
#
# Run from the repo root on the VPS (e.g. /opt/oralign-app):
#   sudo bash scripts/apply-nginx.sh
#
# Why this exists: the vhost files live in the repo (deploy/nginx/) but
# nginx serves the COPIES under /etc/nginx/. Editing the repo without
# re-copying leaves nginx on a stale config — exactly how the finder's
# geolocation ended up blocked in production (the live server kept the
# old "Permissions-Policy: geolocation=()" header for weeks).
#
# Idempotent: install the error pages, copy both vhosts, ensure the
# symlinks, validate, reload, then VERIFY the served headers so drift is
# caught immediately.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITES=(oralign.com.tn api.oralign.com.tn)
ERROR_DIR=/var/www/oralign-errors

# ── Static error pages FIRST ─────────────────────────────────────
# oralign.com.tn.conf points error_page at these files. nginx -t does
# NOT check that they exist, and a missing file turns every 502 into a
# bare 500 at request time — so they must land before the reload, not
# after it.
install -d -m 755 "$ERROR_DIR"
for page in 50x.html 4xx.html; do
  src="$REPO_DIR/deploy/nginx/errors/$page"
  [[ -f "$src" ]] || { echo "ERROR: missing $src" >&2; exit 1; }
  install -m 644 "$src" "$ERROR_DIR/$page"
  echo "synced: error page $page"
done

for site in "${SITES[@]}"; do
  src="$REPO_DIR/deploy/nginx/$site.conf"
  [[ -f "$src" ]] || { echo "ERROR: missing $src" >&2; exit 1; }
  cp "$src" "/etc/nginx/sites-available/$site"
  ln -sf "/etc/nginx/sites-available/$site" "/etc/nginx/sites-enabled/$site"
  echo "synced: $site"
done

nginx -t
systemctl reload nginx
echo "nginx reloaded"

# ── Verify the header that gates the finder's geolocation ────────
echo
echo "Served Permissions-Policy (must contain geolocation=(self)):"
header="$(curl -sI --max-time 15 https://oralign.com.tn/ | grep -i '^permissions-policy' || true)"
echo "  ${header:-<header not found>}"
if [[ "$header" == *"geolocation=(self)"* ]]; then
  echo "OK — geolocation is allowed for the site origin."
else
  echo "WARNING: geolocation still blocked or header missing." >&2
  echo "Another config may also add Permissions-Policy — check:" >&2
  echo "  grep -Rni 'permissions-policy' /etc/nginx/" >&2
  exit 1
fi
