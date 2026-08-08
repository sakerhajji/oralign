# Oralign — Production Deployment Guide

> Goal: ship `oralign.com.tn` (Next.js) + `api.oralign.com.tn` (NestJS) + Postgres on the same VPS that already serves `viewer.oralign.com.tn`, **without touching the viewer**.

---

## 1. Architecture at a glance

```
                  ┌────────────────────────────────────────────────┐
   Internet ──▶   │           Nginx (system service, host)         │
                  │                                                │
                  │  ▶ viewer.oralign.com.tn   (existing — UNTOUCHED)
                  │  ▶ oralign.com.tn          → 127.0.0.1:3001    │
                  │  ▶ api.oralign.com.tn      → 127.0.0.1:3000    │
                  └─────────────┬──────────────────────────────────┘
                                │  (only on loopback — never public)
        ┌───────────────────────┼─────────────────────────┐
        │                       │                         │
   ┌────▼──────┐          ┌─────▼──────┐          ┌───────▼─────┐
   │ frontend  │          │  backend   │          │  postgres   │
   │ Next.js   │          │  NestJS    │ ───────▶ │  127.0.0.1  │
   │ :3001     │ ───────▶ │  :3000     │          │  :5432      │
   └───────────┘          └─────┬──────┘          └─────────────┘
                                │
                                ▼
                          ┌───────────────────────────┐
                          │ /var/lib/oralign-app/...  │  ← bind mounts
                          │   postgres/  uploads/     │     (survive
                          │   backups/                │      rebuild)
                          └───────────────────────────┘
```

**Why this shape:**
- System Nginx (not Dockerized) — viewer already uses port 80/443, swapping the proxy would break it.
- API on its own subdomain — clean CORS, simpler cookies, independent SSL.
- Postgres + Redis bound to **`127.0.0.1`** only — never publicly reachable.
- Compose project name `oralign-app` — keeps containers/volumes namespaced away from any viewer containers.

---

## 2. Files this repo now contains

```
.
├── .env.production.example              ← copy to .env.production on VPS
├── docker-compose.production.yml        ← overlay applied on top of docker-compose.yml
├── deploy/nginx/
│   ├── oralign.com.tn.conf              ← copy to /etc/nginx/sites-available/
│   └── api.oralign.com.tn.conf          ← copy to /etc/nginx/sites-available/
├── scripts/
│   ├── setup-vps.sh                     ← one-time VPS prep
│   ├── deploy.sh                        ← every-deploy entry point
│   ├── rollback.sh                      ← revert to previous commit
│   └── backup.sh                        ← Postgres + uploads backup
└── .github/workflows/deploy.yml         ← CI/CD on push to main
```

The existing `docker-compose.yml`, `oralign-backend/Dockerfile`, and `oralign-frontend/Dockerfile` are **kept as-is** so your local dev workflow (`docker compose up`) keeps working unchanged.

---

## 3. One-time VPS setup

### 3.1 SSH in as a sudo user, then:

```bash
# 1. Clone the repo (the one place it'll live)
sudo mkdir -p /opt && cd /opt
sudo git clone https://github.com/sakerhajji/oralign.git oralign-app
sudo chown -R "$USER":"$USER" /opt/oralign-app
cd /opt/oralign-app

# 2. Run the prep script
sudo bash scripts/setup-vps.sh
```

The script:
- verifies Docker + Docker Compose v2,
- creates `/var/lib/oralign-app/{postgres,uploads,backups}` with the right ownership,
- configures `ufw` (allow 22/80/443, deny 5432/6379 from the public),
- detects the existing `viewer.oralign.com.tn` Nginx block and confirms it will not be touched,
- copies `.env.production.example` → `.env.production` (mode 600).

### 3.2 Fill in `.env.production`

```bash
cd /opt/oralign-app
nano .env.production
```

Replace **every** `__PLACEHOLDER__`. Generate strong JWT/DB secrets with:

```bash
openssl rand -base64 48
```

### 3.3 Install Nginx server blocks (without touching viewer)

```bash
sudo cp /opt/oralign-app/deploy/nginx/oralign.com.tn.conf      /etc/nginx/sites-available/
sudo cp /opt/oralign-app/deploy/nginx/api.oralign.com.tn.conf  /etc/nginx/sites-available/

sudo ln -sf /etc/nginx/sites-available/oralign.com.tn      /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/api.oralign.com.tn  /etc/nginx/sites-enabled/

sudo nginx -t            # MUST be ok before reload
sudo systemctl reload nginx
```

Verify viewer is still alive:

```bash
curl -I https://viewer.oralign.com.tn
```

### 3.4 Issue Let's Encrypt certs (only for new domains)

```bash
# certbot picks up the new server blocks automatically
sudo certbot --nginx -d oralign.com.tn -d www.oralign.com.tn
sudo certbot --nginx -d api.oralign.com.tn
```

`certbot` rewrites those two server blocks in place to add SSL. The viewer's certificate (separate file in `/etc/letsencrypt/live/viewer.oralign.com.tn/`) is untouched.

Cron-based auto-renewal is installed by certbot:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run    # confirms renewal will work
```

### 3.5 First deploy

```bash
cd /opt/oralign-app
bash scripts/deploy.sh
```

Watch logs:

```bash
docker compose -p oralign-app logs -f
```

---

## 4. GitHub Actions setup

### 4.1 Add an SSH deploy key on the VPS

```bash
# As the deploy user on the VPS:
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/oralign_deploy -N ""
cat ~/.ssh/oralign_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/oralign_deploy   # ← copy this whole private key
```

### 4.2 Add GitHub Secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Example | Notes |
|---|---|---|
| `VPS_HOST` | `203.0.113.42` | VPS public IP or hostname |
| `VPS_USER` | `deploy` | the SSH user |
| `VPS_PORT` | `22` | SSH port |
| `VPS_SSH_KEY` | `-----BEGIN OPENSSH...` | the private key from §4.1 |
| `NEXT_PUBLIC_API_URL` | `https://api.oralign.com.tn/api` | baked into the FE bundle by CI |

The other secrets (`DATABASE_URL`, `JWT_SECRET`, etc.) live in `.env.production` on the VPS — never sent to GitHub.

### 4.3 Workflow behavior

`.github/workflows/deploy.yml`:

1. **`verify` job** — runs on every push. Installs both apps, runs Prisma generate, lint, and full builds. Fails the run before any VPS contact if something is broken.
2. **`deploy` job** — runs only on `main`. SSHes to the VPS and runs `bash scripts/deploy.sh`.
3. **Smoke checks** — final two steps `curl https://oralign.com.tn` and `https://api.oralign.com.tn/api/health` from the GitHub runner. If either fails the workflow is red even if the deploy script printed "done".

### 4.4 Trigger a deploy

```bash
git push origin main
```

Or manually: **Actions → Deploy to VPS → Run workflow**.

---

## 5. Day-to-day operations

### 5.1 Logs

```bash
docker compose -p oralign-app logs -f                    # all services
docker compose -p oralign-app logs -f backend            # one service
docker compose -p oralign-app logs --since 1h backend    # last hour
sudo tail -f /var/log/nginx/oralign.com.tn.access.log
sudo tail -f /var/log/nginx/api.oralign.com.tn.error.log
```

### 5.2 Run a Prisma migration manually

```bash
cd /opt/oralign-app
docker compose -p oralign-app \
  --env-file .env.production \
  -f docker-compose.yml -f docker-compose.production.yml \
  run --rm --no-deps backend \
  node node_modules/.bin/prisma migrate deploy
```

(`scripts/deploy.sh` already does this on every deploy. Run it manually only if you've applied schema changes via a different path.)

### 5.3 Inspect data with Prisma Studio

Postgres is **not** publicly reachable — tunnel locally first:

```bash
ssh -L 5432:127.0.0.1:5432 deploy@oralign.com.tn

# In another terminal on your laptop:
DATABASE_URL="postgresql://oralign:THE_PASSWORD@localhost:5432/oralign_db" \
  npx prisma studio --schema oralign-backend/prisma/schema.prisma
```

### 5.4 SSL renewal

One command does everything — renew, reload nginx, repair the
auto-renewal timer, install the reload deploy-hook, dry-run the next
renewal, and probe the live domains:

```bash
sudo bash scripts/renew-ssl.sh
```

> **Incident note (2026-08-08):** both certs reached day 90 and expired
> (`ERR_CERT_DATE_INVALID` on the site AND the API, which also broke
> every dashboard call). Auto-renewal had been failing silently since
> ~day 60 — that is why the script repairs the timer and verifies with
> a dry run rather than just renewing. Run it after any nginx or
> certbot change.

Manual equivalents, if you ever need them piecemeal:

```bash
sudo certbot certificates      # check expiry
sudo certbot renew             # renew whatever is due
sudo systemctl reload nginx    # nginx serves the old cert until reloaded
sudo certbot renew --dry-run   # prove the NEXT auto-renewal will work
```

### 5.5 Backups

Manual:

```bash
bash /opt/oralign-app/scripts/backup.sh
```

Cron (run as the deploy user):

```bash
crontab -e
# add:
0 3 * * * /opt/oralign-app/scripts/backup.sh >> /var/log/oralign-backup.log 2>&1
```

Backups land in `/var/lib/oralign-app/backups/`:

```
db_20260510T030000Z.sql.gz
uploads_20260510T030000Z.tar.gz
```

`BACKUP_KEEP_LAST` in `.env.production` controls retention (default 14).

#### Restoring a backup

```bash
# Stop the app
cd /opt/oralign-app
docker compose -p oralign-app -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production stop backend

# Restore Postgres
gunzip -c /var/lib/oralign-app/backups/db_20260510T030000Z.sql.gz \
  | docker exec -i oralign-app-postgres-1 psql -U oralign -d oralign_db

# Restore uploads
sudo rm -rf /var/lib/oralign-app/uploads
sudo tar -xzf /var/lib/oralign-app/backups/uploads_20260510T030000Z.tar.gz \
  -C /var/lib/oralign-app/

# Restart
docker compose -p oralign-app -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production start backend
```

### 5.6 Rollback

If a deploy goes bad:

```bash
cd /opt/oralign-app
bash scripts/rollback.sh                 # to previous commit (.deploy.previous)
# or:
bash scripts/rollback.sh <commit-sha>    # to a specific commit
```

**Database migrations are forward-only.** If a deploy shipped a destructive migration, restore the DB from backup *before* rolling back code.

### 5.7 Verify the viewer is unaffected

After every deploy:

```bash
curl -I https://viewer.oralign.com.tn       # 200 OK expected
sudo nginx -T 2>/dev/null | grep -A2 "server_name viewer"   # config unchanged
```

### 5.8 Editing `.env.production` after first deploy

`.env.production` lives at `/opt/oralign-app/.env.production` on the VPS, mode `600`, owned by the deploy user. It is **not** in git — every edit happens directly on the box.

```bash
ssh deploy@<VPS>
cd /opt/oralign-app

# 1. Back up the current file
sudo cp .env.production .env.production.bak.$(date +%Y%m%dT%H%M%S)

# 2. Edit
nano .env.production           # or: sudo -e .env.production

# 3. Re-check permissions (editors sometimes reset them)
sudo chmod 600 .env.production
sudo chown "$USER":"$USER" .env.production
```

**Apply the change** — which command depends on what you edited:

| What you changed | What to run |
|---|---|
| Backend runtime vars (`JWT_*`, `MAIL_*`, `API_PUBLIC_URL`, `DATABASE_URL`, `REDIS_PASSWORD`, `LOG_LEVEL`, …) | `docker compose -p oralign-app -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production up -d backend` |
| `NEXT_PUBLIC_*` (frontend) | **Rebuild required** — they are baked at build time: `bash scripts/deploy.sh` |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Postgres credentials are **set on volume init**. Changing them in `.env.production` only affects fresh volumes; you must also `ALTER USER` inside Postgres, or restore from backup with the new credentials. |
| `POSTGRES_HOST_DIR` / `UPLOADS_HOST_DIR` / `BACKUPS_HOST_DIR` | Stop the stack, move the data, then `up -d`. Bind-mount paths are not hot-swappable. |
| `BACKUP_KEEP_LAST` | No restart needed — read by `scripts/backup.sh` on next run. |

**Verify** after restart:

```bash
docker compose -p oralign-app ps                    # all services healthy
docker compose -p oralign-app logs --tail=50 backend
curl -fsS https://api.oralign.com.tn/api/health     # should return 200
```

**Rollback** if something breaks:

```bash
sudo cp .env.production.bak.<timestamp> .env.production
docker compose -p oralign-app -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production up -d
```

> **Security:** Never paste secrets into chat, screenshots, or commit messages. Rotating `JWT_*` invalidates every issued token — which is the desired behavior on rotation.

### 5.9 Email deliverability (why mail goes to spam, and the fix)

Spam placement is almost always a **DMARC alignment** failure: the `From:`
domain must be authenticated (SPF + DKIM) for the SMTP provider that
actually sends the message. Two supported setups:

**A. Gmail SMTP (current / simplest)**

`MAIL_FROM` **must equal** `MAIL_USER` (the authenticated Gmail account) —
Gmail only DKIM-signs for the account itself (or a Gmail-verified alias).
Set a display name instead of a custom From-domain:

```dotenv
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=you@gmail.com
MAIL_PASSWORD=<app password>
MAIL_FROM=you@gmail.com        # SAME as MAIL_USER — never a custom domain
MAIL_FROM_NAME=Oralign
```

Limits: ~500 recipients/day, and the sender shows as @gmail.com. Fine for
transactional volume while starting out.

**B. Branded domain (`no-reply@oralign.com.tn`) — the professional setup**

1. Pick a transactional provider (Brevo free 300/day, SMTP2GO, Mailgun,
   Resend, or Google Workspace) and add `oralign.com.tn` as a verified
   sender domain there.
2. Publish the DNS records the provider gives you on `oralign.com.tn`:
   * **SPF** (TXT on `@`): `v=spf1 include:<provider-spf> ~all`
     — only ONE SPF record per domain; merge includes if one exists.
   * **DKIM**: the provider's CNAME/TXT selector records (e.g.
     `s1._domainkey`, `s2._domainkey`).
   * **DMARC** (TXT on `_dmarc`):
     `v=DMARC1; p=quarantine; rua=mailto:dmarc@oralign.com.tn; fo=1`
     (start with `p=none` to observe, tighten to `quarantine`/`reject`).
3. Point the backend at the provider's SMTP and switch the From:

```dotenv
MAIL_HOST=smtp-relay.brevo.com     # per provider
MAIL_PORT=587
MAIL_USER=<provider smtp login>
MAIL_PASSWORD=<provider smtp key>
MAIL_FROM=no-reply@oralign.com.tn
MAIL_FROM_NAME=Oralign
MAIL_REPLY_TO=contact@oralign.com.tn
```

4. Restart the backend (env-only change): see §5.8.

**Verify**: send any app email to a Gmail inbox → open it → ⋮ →
*Show original* → all three of `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`
must show. For a full spam-score audit, send one email to the address
shown at [mail-tester.com](https://www.mail-tester.com) and aim for ≥ 9/10.

The backend also logs a startup **warning** if `MAIL_FROM`'s domain differs
from the authenticated account's domain — if you see it, the config is in
the misaligned (spam-prone) state.

**C. Hostinger mailbox (`contact@aura-aligners.com`) — current setup**

The domain's auth records (checked live 2026-07-19): SPF ✓
(`include:_spf.mail.hostinger.com`), DKIM ✓ (Hostinger's
`hostingermail-a/b/c` CNAME selectors), DMARC present but weak
(`p=none`, no reporting). For inbox placement:

1. `MAIL_HOST` **must** be `smtp.hostinger.com` (port 587, or 465 with
   TLS) and `MAIL_USER`/`MAIL_FROM` **must** both be the mailbox itself —
   SPF+DKIM only cover mail that actually flows through Hostinger's
   relay from the authenticated account.
2. Upgrade the DMARC TXT record on `_dmarc.aura-aligners.com` (hPanel →
   Domains → DNS) to add reporting, then tighten after a clean week:
   `v=DMARC1; p=none; rua=mailto:contact@aura-aligners.com; fo=1`
   → later: `v=DMARC1; p=quarantine; rua=mailto:contact@aura-aligners.com; fo=1`
3. Verify like in section B: Gmail → *Show original* → SPF / DKIM /
   DMARC all `PASS`, and a ≥9/10 on mail-tester.com.

> **`MAIL_FROM` must be a BARE address** (`contact@aura-aligners.com`),
> never `Oralign <contact@…>` or `Oralign contact@…`. A display name in
> the value corrupts the SMTP envelope and strict servers reject with
> `553 … Sender address rejected: not owned by user`. Put the display
> name in `MAIL_FROM_NAME`. The backend now sanitises the value (and
> logs an error when it has to), but the env should still be clean.

### 5.10 Troubleshooting — finder distance & appointment emails

**Finder shows no distances** (`/trouver-un-praticien`): the browser can
only send its position if the page's `Permissions-Policy` allows
geolocation. The repo's nginx conf grants it (`geolocation=(self)`), but
an older conf deployed on the VPS blocks it (`geolocation=()`), which
silently disables the "Use my location" flow. Fix by re-applying the conf:

```bash
sudo cp /opt/oralign-app/deploy/nginx/oralign.com.tn.conf /etc/nginx/sites-available/
sudo nginx -t && sudo systemctl reload nginx
# verify — MUST print geolocation=(self):
curl -sI https://oralign.com.tn/trouver-un-praticien | grep -i permissions-policy
```

**Appointment emails**: three independent requirements, all visible in
`docker logs oralign-backend`:
1. `MAIL_*` set and valid — otherwise `Mail configuration is incomplete`
   at startup (no mail is sent at all).
2. `MAIL_FROM` is a bare address — otherwise the `553 Sender address
   rejected` above.
3. `API_PUBLIC_URL` set (compose defaults it to
   `https://api.oralign.com.tn`) — otherwise the accept/decline links in
   the practitioner email point at `http://localhost:3000` and the
   backend logs `API_PUBLIC_URL is not set`.

---

## 6. Common errors & fixes

| Symptom | Cause | Fix |
|---|---|---|
| `bind: address already in use 0.0.0.0:80` when starting compose | You forgot to use the production overlay; base compose tries to map ports publicly | Always pass `-f docker-compose.yml -f docker-compose.production.yml`. `scripts/deploy.sh` does this for you. |
| `Could not connect to database` from backend | `DATABASE_URL` host wrong | Inside Docker the host is `postgres`, not `localhost`. |
| `prisma migrate deploy` fails with "drift detected" | Manual schema changes were applied with `db push` previously | Reconcile by hand. Use `prisma migrate resolve --applied <name>` or recreate from backup. |
| `502 Bad Gateway` from Nginx | App container down or port not bound | `docker compose -p oralign-app ps` then `logs <service>`. Check `127.0.0.1:3000` / `:3001` is listening with `ss -tlnp \| grep -E "3000\|3001"`. |
| Frontend shows old API URL | `NEXT_PUBLIC_*` is **build-time** in Next.js | Rebuild: `bash scripts/deploy.sh` (it does `--pull` + rebuild). |
| Certbot fails: "Could not bind to port 80" | Nginx not running or another service grabbed it | `sudo systemctl status nginx`, then `ss -tlnp \| grep :80`. |
| Uploads disappear after deploy | Bind mount path mismatch | Verify `UPLOADS_HOST_DIR` in `.env.production` matches the directory created by setup-vps.sh, and that the backend container shows `/app/uploads` as the bind mount target: `docker inspect oralign-app-backend-1 \| grep -A2 Mounts`. |
| GitHub Actions stuck on "Connect to host" | Wrong `VPS_PORT` / firewall blocks runner IP | Check VPS sshd_config and `ufw status`. Runner IPs change — port 22 must be open to the public. |

---

## 7. Security checklist

- [x] `.env.production` is mode `600`, owned by the deploy user, **not in git**.
- [x] `.gitignore` excludes `.env*` (verify `git check-ignore -v .env.production`).
- [x] Postgres bound to `127.0.0.1:5432` (verify `ss -tlnp \| grep 5432`).
- [x] Redis bound to `127.0.0.1:6379` and password-protected (`REDIS_PASSWORD`).
- [x] `ufw` allows only 22/80/443.
- [x] HTTPS forced via `301` redirect in Nginx; HSTS header set.
- [x] Backend `client_max_body_size 256m` only on the API host (frontend is 10m).
- [x] Containers run as **uid 1001** (Dockerfile `USER nodejs`).
- [x] Backend `NODE_ENV=production` strips Nest debug error details from responses.
- [ ] **You must rotate** the SMTP credentials previously committed in `.env.docker` and remove that file from git history (`git filter-repo` or BFG).

---

## 8. CORS (verify after first deploy)

The backend allowlist must include exactly the production origins. In your NestJS bootstrap:

```ts
app.enableCors({
  origin: [
    'https://oralign.com.tn',
    'https://www.oralign.com.tn',
    // Only add 'https://viewer.oralign.com.tn' if the viewer calls this API.
  ],
  credentials: true,
});
```

(Adjust if you currently allow a wildcard — production should not.)

---

## 9. Summary of what to do, in order

1. **Local prep** (your laptop)
   ```bash
   git add .
   git commit -m "chore(deploy): production docker + nginx + ci"
   git push origin main
   ```
2. **VPS prep** (one time)
   ```bash
   ssh deploy@<VPS>
   sudo git clone https://github.com/sakerhajji/oralign.git /opt/oralign-app
   cd /opt/oralign-app
   sudo bash scripts/setup-vps.sh
   nano .env.production           # fill in placeholders
   sudo cp deploy/nginx/oralign.com.tn.conf      /etc/nginx/sites-available/
   sudo cp deploy/nginx/api.oralign.com.tn.conf  /etc/nginx/sites-available/
   sudo ln -sf /etc/nginx/sites-available/oralign.com.tn      /etc/nginx/sites-enabled/
   sudo ln -sf /etc/nginx/sites-available/api.oralign.com.tn  /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d oralign.com.tn -d www.oralign.com.tn -d api.oralign.com.tn
   bash scripts/deploy.sh
   ```
3. **GitHub Secrets** (once)
   Add `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_SSH_KEY`, `NEXT_PUBLIC_API_URL`.
4. **Every future deploy**
   `git push origin main` — GitHub Actions takes it from there.
