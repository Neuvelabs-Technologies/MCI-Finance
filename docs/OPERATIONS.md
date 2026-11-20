# Operations runbook

For IT and whoever runs the server. For how the finance team uses the system, see the **Guide** page inside the app (`/admin/guide`).

| Server | Branch | Address | Section |
|---|---|---|---|
| **Production**: MCI's Azure App Service | `main` | https://finance-ae.wearemci.com | [Azure (production)](#azure-production) |
| **UAT**: Tencent, Docker | `uat` | https://crm-mci.neuvebooks.com | sections 1–10 below |

---

## Azure (production)

Push to `main` → `.github/workflows/azure-prod.yml` runs the full CI, builds one zip (compiled API, production `node_modules`, the frontend in `public/`, `build.json` with the commit), signs in to Azure as `id-finance-github-prod` (federated, no secrets), zip-deploys to `app-finance-ae-prod-001`, then waits until `/api/health` answers `ok:true` **with that commit**. If it doesn't within 10 minutes the run fails: open *Log stream* in the Azure portal.

Changes reach UAT first: merge into `uat`, check, then merge `uat` into `main`.

| Resource (rg-finance-prod-001, UAE North) | Use |
|---|---|
| App Service `app-finance-ae-prod-001` (Node 22, 1 instance, Always On) | API + frontend + hourly reminder job. Startup `node dist/server.js`, health check `/api/health`. Keep it at **1 instance** or reminders go out twice |
| DocumentDB `docdb-finance-prod-001` (private endpoint) | Database `finance` (the URI names none; `MONGODB_DB` overrides) |
| Storage `stfinanceaeprod001`, container `finance-documents` | All documents and the logo. App's managed identity has Storage Blob Data Contributor. **Production refuses to start without Blob storage** |
| Entra app `APP-0029-FINANCE-prod` | Microsoft sign-in. Only members of `AZR-0029-FINANCE-prod-Users` get through; their admin account is created at first sign-in |
| Identity `id-finance-github-prod` | GitHub deploys from `main` only. This repo sends GitHub's *immutable* OIDC subject, trusted by the credential `github-mci-finance-main-immutable` |

**App settings** (App Service → Environment variables; never in the repo):

| Setting | Value / who sets it |
|---|---|
| `MONGODB_URI`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_REDIRECT_URI`, `AZURE_STORAGE_BLOB_ENDPOINT`, `AZURE_STORAGE_CONTAINER` | MCI IT |
| `MAILJET_API_KEY`, `MAILJET_SECRET_KEY` | MCI IT (Franck). Until set, emails are only written to the log |
| `NODE_ENV=production`, `JWT_SECRET` (random), `PUBLIC_BASE_URL=https://finance-ae.wearemci.com`, `COOKIE_SECURE=true`, `PASSWORD_LOGIN=false`, `MAIL_FROM`, `TZ=Asia/Dubai`, `SCM_DO_BUILD_DURING_DEPLOYMENT=false` | Neuvelabs |
| `MAILJET_WEBHOOK_SECRET`, `NOTIFY_EMAILS` | Neuvelabs, once Mailjet is live |

Changing an app setting restarts the app. `JWT_SECRET` changing signs everyone out.

**Removing someone's access**: MCI IT removes them from `AZR-0029-FINANCE-prod-Users`, then remove them under Settings → Users (sessions last at most 12 hours).

---

## 1. What runs where

```
  Customers / finance team (browser)
              │  HTTPS
              ▼
   ┌──────────────────────┐     your HTTPS proxy (nginx, Caddy, Azure App Gateway…)
   │  frontend container  │     terminates TLS and forwards to port 8080
   │  nginx :80           │──── serves the React app
   │                      │──── /api/*  ───────────┐
   └──────────────────────┘                        ▼
                                     ┌──────────────────────┐
                                     │  backend container   │  Express API :4000 (internal only)
                                     │  Node 22             │  hourly reminder job
                                     └─────────┬────────────┘
                                               │
                    ┌──────────────────────────┴──────────────┐
                    ▼                                         ▼
          ┌──────────────────┐                     ┌────────────────────┐
          │ mongo container  │                     │ uploads volume     │
          │ volume: mongo    │                     │ customer documents │
          └──────────────────┘                     └────────────────────┘
```

- Only the **frontend** port is published. The browser talks to one address, so the admin login cookie works without CORS.
- **Customer documents** (licences, Emirates IDs, passports, bank letters) live in the `uploads` volume, never in the web root. They are served only through signed-in admin API routes.
- The **reminder job** runs inside the backend, once an hour. Run **one** backend instance; two would send reminders twice.

## 2. First deployment

```bash
git clone <repo> /opt/einvoice && cd /opt/einvoice
cp backend/.env.example backend/.env
# Edit backend/.env — at least:
#   JWT_SECRET        openssl rand -base64 48
#   PUBLIC_BASE_URL   https://einvoice.wearemci.com   (the address customers open)
#   COOKIE_SECURE     true
#   ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME         (first admin; change the password after first sign-in)
#   MAILJET_API_KEY / MAILJET_SECRET_KEY / MAIL_FROM / NOTIFY_EMAILS
docker compose up -d --build
docker compose ps            # all three should become "healthy"
```

Point the HTTPS proxy at port **8080** (change with `APP_PORT=… docker compose up -d`). Allow large request bodies: uploads have **no size limit** by default, so set `client_max_body_size 0;` on your proxy (nginx's own default is only 1 MB) and generous timeouts.

Then sign in at `https://<host>/admin` and follow the **Before you go live** checklist on the Overview page.

## 3. Configuration reference (`backend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `PUBLIC_BASE_URL` | `http://localhost:5173` | Address customers open; used in every form link and in emails. **https in production.** |
| `JWT_SECRET` | — | Long random string. The server refuses to start in production with the default. Changing it signs everyone out. |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS. |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/mci_einvoice` | Set by docker-compose to the `mongo` container. |
| `UPLOAD_DIR` | `./uploads` | Set by docker-compose to `/data/uploads` (the `uploads` volume). |
| `MAX_FILE_MB` | `0` | Per-document size limit in MB; `0` = no limit. Any document type is accepted; programs and scripts are always refused. If you set a limit, keep the proxy's `client_max_body_size` ≥ 6 × this. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | | Used **only** when there are no admins yet. |
| `MAILJET_API_KEY`, `MAILJET_SECRET_KEY` | | Mailjet account keys (Account settings → API key management). When both are set, every email goes through Mailjet's Send API (HTTPS, no SMTP port needed). |
| `MAIL_FROM` | | Sender, e.g. `"MCI Middle East – Accounts <mci.admin@wearemci.com>"`. With Mailjet the address or its domain **must be verified** in Mailjet, and the domain should have Mailjet's SPF/DKIM records so emails don't land in spam. |
| `MAILJET_WEBHOOK_SECRET` | | Long random string (`openssl rand -hex 24`). Mailjet uses it as the password when it reports delivery events (delivered, opened, bounced, blocked, spam) to `/api/webhooks/mailjet`. Empty = webhook off; statuses then only update with **Refresh from Mailjet** on the Emails page. See *Email delivery tracking* below. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | | Fallback, used only when the Mailjet keys are empty. With neither set, emails are logged, not sent. |
| `NOTIFY_EMAILS` | | Comma-separated; told about every submission. |
| `LOG_LEVEL` | `info` (prod) | `debug`, `info`, `warn`, `error`. |
| `ALLOW_DEMO_DATA` | off in production | `true` only on a **staging** server used for training. |
| `QUICK_LOGIN` | off in production | One-click sign-in buttons on the login page (no password). Always on in development. `true` only on a **staging/demo** server — never the live one. |
| `USE_MEMORY_DB`, `DEMO_DATA` | | Development only. |

At startup the backend logs a `[config]` warning for anything risky (HTTP links, insecure cookies, default admin password, no email provider, demo data allowed). Check `docker compose logs backend | grep config` after every change.

### Email delivery tracking (Mailjet)

Every email is recorded on the admin **Emails** page (one row per recipient). Mailjet tells the server what happened to each one through a webhook. To set it up on a server:

1. Put `MAILJET_WEBHOOK_SECRET=<long random string>` in the backend `.env` and redeploy (the container reads `.env` when it is created).
2. Register the webhook with Mailjet, once per server: `docker exec <backend-container> npm run mailjet:webhook:prod`. It points Mailjet's `sent`, `open`, `click`, `bounce`, `blocked`, `spam` and `unsub` events at `PUBLIC_BASE_URL/api/webhooks/mailjet`, with the secret as basic-auth password. `… mailjet:webhook:prod -- status` shows the current setting.
3. Settings → System shows **Delivery tracking: Live (Mailjet webhook)**.

The webhook belongs to the **Mailjet API key**, not the server. If UAT and live used the same key, whichever registered last would get the events (the other server's emails would stay "Waiting" until someone presses **Refresh from Mailjet**). Give each server its own Mailjet API key (Mailjet → Account settings → API key management → create a sub-account key).

Click tracking is turned off on every email, so customers' private form links are never rewritten through Mailjet's tracking domain. "Opened" relies on Mailjet's tracking pixel and is a hint only — many mail apps block it.

## 4. Health, logs and monitoring

- **Health check:** `GET /api/health` → `200 {"ok":true,"db":"up","version":"1.1.0"}`, or `503` when MongoDB is unreachable. Docker uses it; point your uptime monitor at `https://<host>/api/health` too.
- **Logs:** JSON lines in production (one per request, with a request id). `docker compose logs -f backend`. Logs rotate at 5 × 20 MB.
- **Request ids:** server errors return a `requestId` to the browser and the same id is in the log line. Ask users for it when they report a problem.
- **Version and status** are also visible to admins under Settings → System.

## 5. Backups

What to back up: the **MongoDB database** and the **uploads volume**. One without the other is not enough.

```bash
./scripts/backup.sh /var/backups/einvoice      # keeps the last 14
```

Schedule it nightly (example cron line in the script header) and copy the folder to storage **off this server**. The backups contain identity documents and bank details: encrypt them at rest and restrict access.

### Restore from a backup

```bash
B=/var/backups/einvoice/2026-11-02_0215
docker compose stop backend
docker compose exec -T mongo mongorestore --archive --gzip --drop < "$B/mongo.archive.gz"
docker compose run --rm --no-deps -T --entrypoint sh backend -c 'rm -rf /data/uploads/* && tar -xzf - -C /data' < "$B/uploads.tar.gz"
docker compose start backend
```

Test a restore on a spare machine at least once before go-live.

## 6. Upgrades

```bash
cd /opt/einvoice
./scripts/backup.sh /var/backups/einvoice     # always back up first
git pull
docker compose up -d --build
docker compose ps && curl -fsS https://<host>/api/health
```

Always deploy **frontend and backend together** — they are released as one version.

Notes for upgrading to **1.1.0**:
- Existing data needs no migration. On first start, emails switch from the old blue to MCI rose (only if the colour was never changed).
- Existing admin sessions stay signed in.

## 7. Staging and demo data

For a training or demo server, deploy a second copy with its own database and set `ALLOW_DEMO_DATA=true` (and `QUICK_LOGIN=true` if presenters should sign in with one click). Admins can then load and remove sample customers under Settings → System, or from the command line:

```bash
docker compose exec backend npm run demo:load:prod
docker compose exec backend npm run demo:clear:prod
```

Demo customers have `DEMO-` codes and `.example` addresses and are never emailed. Never enable demo data on the live server.

## 8. Security checklist

- [ ] HTTPS only; `COOKIE_SECURE=true`; `PUBLIC_BASE_URL` starts with `https://`.
- [ ] Strong `JWT_SECRET`, stored only in `backend/.env` (not in git).
- [ ] The first admin's password changed after first sign-in; each person has their own account.
- [ ] Only port 8080 (or your proxy) reachable from outside; MongoDB not published.
- [ ] Nightly encrypted backups, copied off the server, restore tested.
- [ ] Server OS and Docker images updated regularly (`docker compose pull && docker compose up -d --build`).
- [ ] `ALLOW_DEMO_DATA` and `QUICK_LOGIN` unset on the live server.

Built in: rate-limited sign-in (10 attempts / 15 min) and form submissions, bcrypt passwords, 12-hour httpOnly sessions revoked on password change or user removal, uploaded files type-checked by content, security headers (CSP, nosniff, frame options) on both nginx and the API, and an audit log of every action.

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| Backend container restarts | `docker compose logs backend` — a `[config]` FATAL line names the setting; otherwise MongoDB isn't reachable. |
| `/api/health` returns 503 | MongoDB is down or unreachable: `docker compose ps mongo`, disk space. |
| Emails appear only in logs | `MAILJET_API_KEY` / `MAILJET_SECRET_KEY` not set. Use Settings → Emails → Send test after setting them. |
| "Mailjet rejected the API key or secret key" | Keys copied wrongly, swapped, or the key pair was revoked in Mailjet. |
| Mailjet error about the sender / `From.Email` | The `MAIL_FROM` address (or its domain) isn't verified in the Mailjet account. |
| Sent but customers don't receive it | Open the email on the **Emails** page: Bounced/Blocked show Mailjet's reason. "Delivered" means their server accepted it — ask them to check junk mail. Add Mailjet's SPF and DKIM records to the sender domain. |
| Emails stay "Waiting" | The webhook isn't set up or points at another server (`npm run mailjet:webhook:prod -- status`). **Refresh from Mailjet** on the Emails page updates them meanwhile. |
| Customers' links point to the wrong address | `PUBLIC_BASE_URL`. Existing links change automatically (they are built from the token). |
| Upload fails with "file too large" (HTTP 413) | The proxy's `client_max_body_size` (nginx defaults to 1 MB), then `MAX_FILE_MB`. |
| Admins are signed out unexpectedly | `JWT_SECRET` changed, or a password was changed in another browser. |

## 10. Development

```bash
npm run install:all
npm run dev:backend:memory     # API on :4000 with a throwaway DB and demo data
npm run dev:frontend           # http://localhost:5173/admin
npm run check                  # rules in sync, lint, typecheck, tests
```

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend/.env`.
