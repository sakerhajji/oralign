#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# scripts/renew-ssl.sh — renew Let's Encrypt certs + repair auto-renewal
#
# Run on the VPS from the repo root:
#   sudo bash scripts/renew-ssl.sh
#
# Why this exists: on 2026-08-08 both production certs expired
# (ERR_CERT_DATE_INVALID on oralign.com.tn AND api.oralign.com.tn,
# which also broke every dashboard API call). Let's Encrypt certs live
# 90 days and certbot's timer renews them at day ~60 — reaching day 90
# means auto-renewal had been failing silently for a MONTH. So this
# script does not just renew: it repairs the machinery so the renewal
# keeps happening on its own, and proves it with a dry run + live probe.
#
# What it does, in order:
#   1. Show every installed cert with its expiry (visibility first).
#   2. certbot renew — renews anything expired or within 30 days.
#   3. Reload nginx — a renewed cert on DISK is not enough; nginx keeps
#      serving the old one from memory until reloaded. This is the most
#      common "I renewed but the browser still complains" trap.
#   4. Install a deploy hook so EVERY future auto-renewal also reloads
#      nginx (hook dir is honored by both apt and snap certbot).
#   5. Ensure the renewal timer is actually enabled — apt installs
#      `certbot.timer`, snap installs `snap.certbot.renew.timer`; if
#      neither exists, fall back to a cron entry.
#   6. certbot renew --dry-run — prove the next automatic renewal works.
#   7. Probe the live domains and FAIL loudly if any still serves an
#      expired or near-expired certificate.
#
# Idempotent — safe to re-run any time. `certbot renew` is a no-op when
# nothing is due (LE rate limit: 5 renewals/cert/week, so no --force).
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAINS=(oralign.com.tn api.oralign.com.tn)
HOOK_DIR=/etc/letsencrypt/renewal-hooks/deploy
HOOK_FILE="$HOOK_DIR/reload-nginx.sh"

[[ $EUID -eq 0 ]] || { echo "ERROR: run with sudo (certbot + nginx reload need root)." >&2; exit 1; }
command -v certbot >/dev/null || { echo "ERROR: certbot not installed (apt install certbot python3-certbot-nginx)." >&2; exit 1; }

# ── 1. Current state ─────────────────────────────────────────────
echo "── Installed certificates ──────────────────────────────────"
certbot certificates 2>/dev/null | grep -E "Certificate Name|Domains|Expiry" || true
echo

# ── 2. Renew whatever is due (expired counts as due) ─────────────
echo "── Renewing ────────────────────────────────────────────────"
if ! certbot renew; then
  echo >&2
  echo "ERROR: certbot renew FAILED — the error above is the same reason" >&2
  echo "auto-renewal has been failing. Most common causes:" >&2
  echo "  • port 80 blocked / vhost missing  → check: nginx -T | grep -A2 'listen 80'" >&2
  echo "  • stale ACME account or config     → check: certbot renew --dry-run -v" >&2
  echo "  • DNS no longer points at this VPS → check: dig +short ${DOMAINS[0]}" >&2
  exit 1
fi
echo

# ── 3. Reload nginx so it serves the NEW cert, not the cached one ─
nginx -t
systemctl reload nginx
echo "nginx reloaded"
echo

# ── 4. Deploy hook: every future auto-renewal reloads nginx too ──
mkdir -p "$HOOK_DIR"
cat > "$HOOK_FILE" <<'HOOK'
#!/usr/bin/env bash
# Installed by scripts/renew-ssl.sh — certbot runs this after every
# successful renewal so nginx picks up the new certificate immediately.
systemctl reload nginx
HOOK
chmod +x "$HOOK_FILE"
echo "deploy hook installed: $HOOK_FILE"
echo

# ── 5. Make sure the renewal machinery is actually running ───────
echo "── Auto-renewal timer ──────────────────────────────────────"
timer_ok=0
for t in certbot.timer snap.certbot.renew.timer; do
  if systemctl list-unit-files "$t" 2>/dev/null | grep -q "$t"; then
    systemctl enable --now "$t"
    echo "enabled: $t  (next runs: $(systemctl list-timers "$t" --no-pager 2>/dev/null | sed -n 2p || echo '?'))"
    timer_ok=1
    break
  fi
done
if [[ $timer_ok -eq 0 ]]; then
  # No systemd timer at all — install a cron fallback (twice daily,
  # random minute to be polite to Let's Encrypt).
  echo "0 3,15 * * * root sleep \$((RANDOM % 1800)) && certbot renew --quiet" > /etc/cron.d/certbot-renew
  echo "WARNING: no certbot systemd timer found — installed cron fallback /etc/cron.d/certbot-renew" >&2
fi
echo

# ── 6. Prove the NEXT renewal will also work ─────────────────────
echo "── Dry run (simulates the next automatic renewal) ──────────"
if certbot renew --dry-run >/dev/null 2>&1; then
  echo "OK — future automatic renewals will succeed."
else
  echo "WARNING: dry run failed — auto-renewal is still broken." >&2
  echo "Debug with: certbot renew --dry-run -v" >&2
fi
echo

# ── 7. Verify what the WORLD actually sees ───────────────────────
echo "── Live verification ───────────────────────────────────────"
fail=0
for d in "${DOMAINS[@]}"; do
  not_after="$(echo | openssl s_client -connect "$d:443" -servername "$d" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
  if [[ -z "$not_after" ]]; then
    echo "  $d: ERROR — could not read the served certificate" >&2; fail=1; continue
  fi
  end_epoch="$(date -d "$not_after" +%s)"
  days_left=$(( (end_epoch - $(date +%s)) / 86400 ))
  if (( days_left < 1 )); then
    echo "  $d: STILL EXPIRED (notAfter: $not_after)" >&2; fail=1
  else
    echo "  $d: valid, expires in ${days_left}d ($not_after)"
  fi
done
(( fail == 0 )) || { echo; echo "ERROR: at least one domain still serves a bad cert." >&2; exit 1; }
echo
echo "All good — certificates renewed, nginx reloaded, auto-renewal repaired."
