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

`certbot` installs a systemd timer that runs twice a day. To force a renewal:

```bash
sudo certbot renew
sudo systemctl reload nginx
```

To check expiry:

```bash
sudo certbot certificates
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
| Backend runtime vars (`JWT_*`, `MAIL_*`, `DATABASE_URL`, `REDIS_PASSWORD`, `LOG_LEVEL`, …) | `docker compose -p oralign-app -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production up -d backend` |
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
