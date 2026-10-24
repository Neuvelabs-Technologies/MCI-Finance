# MCI — UAE e-Invoicing customer data collection

Collects the buyer details UAE e-invoicing (PINT AE) needs — legal name, licence, TRN, TIN, PEPPOL ID, contacts, bank — plus supporting documents, from every MCI Middle East customer.

Each customer gets a **personal link** by email and fills in one form. The MCI finance team tracks progress, **reviews** each submission against the documents, and **exports** a clean Excel file (including a PEPPOL buyer master) for the ERP and the e-invoicing provider.

| | |
|---|---|
| **Users** | MCI finance team (admin panel, `/admin`) · customers (token link, `/f/<token>`, no account) |
| **Stack** | MongoDB · Express · React (Vite) · Node 22 — TypeScript throughout |
| **Design** | MCI design system (same tokens, font and components as MCI HR): MCI rose, Plus Jakarta Sans, light and dark mode |
| **Version** | 1.1.0 — see [CHANGELOG.md](CHANGELOG.md) |

## Documentation

- **How the system works / how to use it** — the **Guide** inside the app (`/admin/guide`). Written for the finance team; values like the due date and reminder days come from the live settings.
- **Running it** (deploy, configuration, backups, upgrades, monitoring, security) — [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Quick start (development)

Requires Node 22.12+.

```bash
npm run install:all
cp backend/.env.example backend/.env

npm run dev:backend:memory     # terminal 1 — API on :4000, throwaway DB with demo data
npm run dev:frontend           # terminal 2 — http://localhost:5173/admin
```

Sign in with **Quick sign-in** on the login page (development only), or with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend/.env`. The in-memory database starts with ~20 sample customers in every state (codes `DEMO-…`, never emailed). Set `DEMO_DATA=0` to start empty, or use `npm run dev:backend` with a real `MONGO_URI`.

Without SMTP settings, emails are written to the backend log instead of being sent.

## Production

```bash
cp backend/.env.example backend/.env    # JWT_SECRET, PUBLIC_BASE_URL (https), COOKIE_SECURE=true, SMTP_*, ADMIN_*
docker compose up -d --build            # frontend (nginx) on :8080 → backend :4000 → mongo
```

Put port 8080 behind HTTPS. Full runbook: [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Commands

| Command | Does |
|---|---|
| `npm run check` | Rules in sync, lint, type-check both apps, run the tests |
| `npm test` | Backend unit + API tests (in-memory MongoDB) |
| `npm run build` | Production build of both apps |
| `npm run demo:load` / `demo:clear` | Load or remove sample customers (refused on a live server unless `ALLOW_DEMO_DATA=true`) |
| `npm run sync:rules` | Copy `backend/src/utils/rules.ts` to `frontend/src/lib/rules.ts` after changing validation |

## Project layout

```
backend/                      Express API (TypeScript)
  src/
    server.ts, app.ts         start-up, graceful shutdown, routes, health check
    config/                   env.ts (settings + start-up checks), db.ts
    models/                   Customer, Entity, Settings, Admin, AuditLog
    modules/<feature>/        *.routes.ts → *.controller.ts → *.service.ts
      public-form/  auth/  customers/  entities/  settings/  admins/  audit/  system/
    middlewares/              auth (sessions), uploads, errors
    services/                 mailer, file storage, Excel import/export, demo data
    jobs/reminders.job.ts     hourly automatic reminders
    seeds/                    first admin + defaults (seed.ts), demo data CLI (demo.ts)
    utils/rules.ts            validation rules (same file as frontend/src/lib/rules.ts)
  tests/                      vitest + supertest

frontend/                     React + Vite (TSX)
  src/
    pages/public/             Landing, PublicForm, LinkProblem (customer side)
    pages/admin/              Overview, customers/, Entities, Activity, settings/, guide/
    components/ui/            buttons, inputs, dialogs, menus, tables (MCI design system)
    components/common/        PageHeader, DataTable, StatCard, FormSection, StatusChip…
    layout/AdminLayout.tsx    sidebar, mobile menu, demo banner
    api/                      one client per backend module
    lib/                      rules.ts, formatting, activity wording
  public/brand/               MCI logo and letterhead artwork
  nginx.conf.template

docs/OPERATIONS.md            runbook for IT
scripts/backup.sh             nightly database + documents backup
.github/workflows/ci.yml      lint, type-check, test, build, Docker build
```

## Conventions

- **Lists**: KPI strip + `DataTable` (serial #, sorting, 20/50/75/100 rows, bulk actions, dropdown filters).
- **Detail pages**: full width, multi-column info grids.
- **Forms**: `FormSection` cards with a 3-column field grid in the admin panel.
- **Validation** lives in `rules.ts`, shared by both apps so the browser and the API always agree.
