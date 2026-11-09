# Deploying ManiPOS

Three GitHub Actions workflows handle building, staging, production deploys and
alerting.

| Workflow | File | Trigger |
|---|---|---|
| CI | `.github/workflows/ci.yml` | Every push to `main` and every pull request |
| E2E Tests | `.github/workflows/e2e.yml` | Every push to `main`, pull request, and manual |
| Deploy | `.github/workflows/deploy.yml` | Push to `main` → staging; manual → production |
| Monitor | `.github/workflows/monitor.yml` | Every 5 minutes |

## Environments

| Target | URL | Directory on the server |
|---|---|---|
| Production | https://manipos.com | `public_html/` |
| Staging | https://manipos.com/staging/ | `public_html/staging/` |

Staging is served from a subdirectory, so the staging build is compiled with
`--base /staging/` and its own service worker. Nothing on the production origin
is touched by a staging deploy.

A push to `main` builds and deploys to **staging** automatically. Production is
**manual** — nothing reaches a real restaurant without someone clicking
"Run workflow".

## One-time setup

### 1. Add repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Value |
|---|---|
| `FTP_HOST` | `ftp.manipos.com` |
| `FTP_USER` | Hostinger FTP user |
| `FTP_PASS` | Hostinger FTP password |
| `FTP_PORT` | `21` |
| `FTP_STAGING_REMOTE_DIR` | `/staging/` |
| `VITE_SUPER_ADMIN_EMAILS` | `potofjollofke@gmail.com` |
| `TELEGRAM_BOT_TOKEN` | bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | chat to send alerts to |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role` |

### 2. Create the staging directory

The FTP user can create `public_html/staging/` itself on the first staging
deploy. If you prefer to create it first: hPanel → **Files → File Manager** →
`public_html` → **New Folder** → `staging`.

> If you later want a dedicated origin instead, create the `staging.manipos.com`
> subdomain in hPanel pointing at `public_html/staging`, then deploy with
> `BASE=/ FTP_REMOTE_DIR=/staging/`.

## Everyday operations

### Deploy to production

1. Go to **Actions → Deploy → Run workflow**.
2. Set **Target environment** to `production`.
3. Leave **ref** blank to deploy the latest commit on `main`.
4. Click **Run workflow**.

### Roll back production

1. Find the last known-good commit on the **Actions → Deploy** history, or in
   `git log`.
2. Run the **Deploy** workflow with **Target environment** = `production` and
   **ref** set to that commit SHA or tag.
3. That commit is rebuilt and uploaded, replacing the current production build.

Because builds are reproducible from source, there is no need to keep old
bundles on the server.

### Test a change safely

Push a branch and open a pull request — CI builds it. Merge to `main` and the
Deploy workflow pushes it to **staging**; verify at
https://staging.manipos.com before deploying to production.

### Trigger the monitor by hand

**Actions → Monitor → Run workflow** runs the uptime check and error-forwarding
steps immediately.

### Run the E2E tests locally

```bash
npm ci
npx playwright install chromium   # skip on macOS 13 — use the system Chrome
E2E_BROWSER_CHANNEL=chrome \
SUPABASE_SERVICE_KEY=<service_role_key> \
E2E_STAFF_EMAIL=admin@chopnownow.com \
E2E_STAFF_PASSWORD=<password> \
npx playwright test
```

The suite covers the marketing site, the tenant microsite, the POS login page,
staff sign-in, and a full microsite checkout (the order is created, asserted in
`pos_orders`, then deleted).

On macOS 13 the bundled Chromium is unavailable (Playwright needs macOS 14+),
so set `E2E_BROWSER_CHANNEL=chrome` to use the installed Google Chrome.

## Notes

- After any deploy, flush the hCDN cache: hPanel → **Performance → CDN → Flush
  cache**, for each domain (including `potofjollof.pos.manipos.com`).
- The monitor keeps its uptime state in a GitHub Actions cache so it only
  alerts when a site changes state (down → up, or up → down).
- `scripts/deploy-hostinger.sh --target staging` does the same thing locally.
