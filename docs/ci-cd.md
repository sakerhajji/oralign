# CI / CD

| Workflow | When | What |
|---|---|---|
| **CI** (`.github/workflows/ci.yml`) | every pull request, every push to `main` | Backend: Prisma validate, migrations on an empty Postgres 17, drift check, TypeScript, ESLint ratchet, Jest, build. Frontend: TypeScript, ESLint, `node:test` units, Next build. Stack: `docker compose up --build` on an empty database, migrations at boot, API + site health. Security: secret scan, npm audit (reported). |
| **CodeQL** (`codeql.yml`) | push / PR to `main`, Mondays | Static security analysis, results in *Security → Code scanning*. |
| **Deploy to production** (`deploy.yml`) | **manual only** | CI must be green on the commit → approval → backup → `scripts/deploy.sh` → smoke test. |
| **Rollback production** (`rollback.yml`) | **manual only** | `scripts/rollback.sh` to the previous (or given) commit → smoke test. |
| **Dependabot** (`dependabot.yml`) | monthly / weekly | Grouped minor/patch update PRs; CI runs on them. |

**A push to `main` never deploys.** Production only changes when you run *Deploy to production* and approve it.

## One-time setup in GitHub

### 1. The `production` environment

This is where the approval comes from.

1. Open *Settings → Environments → New environment*, name it `production`.
2. Under *Required reviewers*, add yourself.
3. Under *Deployment branches and tags*, choose *Selected branches* → `main`.

### 2. The deploy key

This step fixes the old SSH failure. On your PC:

```bash
ssh-keygen -t ed25519 -C "github-deploy-oralign" -f oralign_deploy -N ""
```

Then:

1. Put `oralign_deploy.pub` on the VPS. Append it to `~/.ssh/authorized_keys` of the deploy user (the owner of `/opt/oralign-app`).
2. In *Settings → Secrets and variables → Actions → New repository secret* (or as environment secrets of `production`), create:

| Secret | Value |
|---|---|
| `VPS_HOST` | the VPS IP or hostname |
| `VPS_USER` | the deploy user |
| `VPS_SSH_KEY` | the whole content of `oralign_deploy`, the `BEGIN` and `END` lines included |
| `VPS_PORT` | optional, default 22 |

3. Delete the local `oralign_deploy` file afterwards.

The deploy job checks these secrets before connecting, without printing them. It names a missing secret, a key that is not a private key, or a key with a passphrase.

### 3. Branch protection (recommended)

Go to *Settings → Branches → Add rule* for `main`:
- *Require status checks to pass*: `Backend`, `Frontend`, `Docker stack (compose up --build)`, `Security`;
- *Require a pull request before merging*, if you want to work with PRs.

## Deploy

1. Open *Actions → Deploy to production → Run workflow*.
2. Leave **sha** empty to deploy the latest `main`, or paste a commit SHA.
3. The **gate** job refuses the commit if it is not on `main`, or if CI did not pass on it.
4. Approve the pending deployment (GitHub e-mails you).
5. On the VPS the workflow runs:
   - `scripts/backup.sh` (Postgres dump checked for corruption, plus uploads tarball). Skip it only with the *skip_backup* box.
   - `DEPLOY_SHA=<sha> scripts/deploy.sh`. It deploys **exactly** that commit, even if `main` moved on since. It then builds, runs the migrations, starts the stack and health-checks it.
6. The smoke test checks <https://oralign.com.tn> and <https://api.oralign.com.tn/api/health>.

Migrations run at boot (`scripts/migrate.mjs`). Backend, frontend and migrations always ship together.

## Rollback

*Actions → Rollback production → Run workflow*, with an empty SHA (the commit before the last deploy) or a SHA.

**Migrations are not undone.** They are forward-only. If a migration damaged data, restore the backup taken just before the deploy.

## Restore a backup (on the VPS)

```bash
cd /opt/oralign-app
ls -lt /var/lib/oralign-app/backups | head          # pick db_<timestamp>.sql.gz
gunzip -c /var/lib/oralign-app/backups/db_<timestamp>.sql.gz \
  | docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.production.yml \
      -p oralign-app exec -T postgres psql -U "$DB_USER" -d "$DB_NAME"
```

The dump is made with `--clean --if-exists`, so it replaces the current tables. Restore uploads with `tar -xzf uploads_<timestamp>.tar.gz -C /var/lib/oralign-app`.

## Lint ratchet

The backend still carries lint debt from before this gate: about 2 700 errors in 120 files, mostly formatting. CI therefore lints only the TypeScript files a change **adds or touches** (`scripts/ci/lint-changed.sh`). Each of them must be error-free. The debt can only shrink.

Fix a touched file locally with `npx eslint --fix <file>`, run from `oralign-backend`.

The frontend has no debt: its whole tree must stay free of errors.

## npm audit

On 2026-11-27 both apps carry high and critical advisories (next, proxy-addr, multer…). The audit step reports them in the run summary but does not fail yet.

Once `npm audit --omit=dev --audit-level=high` is clean in both apps, remove `continue-on-error` from the two audit steps of `ci.yml`.
