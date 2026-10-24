# Changelog

## 1.1.0 — 2026-10-24

### Design
- Moved to the MCI design system shared with MCI HR: MCI rose, Plus Jakarta Sans (self-hosted), the MCI logo and letterhead artwork, light and dark mode.
- Rebuilt every screen on shared components (Radix + Tailwind): page headers, KPI strips, data tables, dialogs, toasts, empty/error/loading states.
- Customer form: branded header, sticky progress with section links, numbered section cards, clearer file uploads, mobile layout.
- Emails carry the MCI logo, accent bar and footer.

### New
- **Overview** dashboard: response funnel, “Needs attention” list, review queue, recent activity, go-live checklist.
- **Guide** inside the admin panel explaining how the system works, with live values from Settings.
- **Demo data**: ~20 sample customers in every state with sample documents and history; never emailed; removable in one step (Settings → System or `npm run demo:*`).
- **Quick sign-in** on the login page for development and staging (one click per admin, no password). Off on the live server unless `QUICK_LOGIN=true`; logged in Activity like any sign-in.
- **Settings → System**: version, database, email and security status.
- Customer list: sortable columns, rows-per-page, issue filters (failed email, expired link, no email), filtered export, URL-based filters.
- Activity log: search, filter by type, pagination, plain-English descriptions.

### Production readiness
- Structured JSON logging with request ids (pino); error responses include the request id.
- `/api/health` checks the database (503 when down); Docker health checks; ordered start-up.
- Graceful shutdown; start-up configuration checks with warnings.
- Changing a password signs out the user’s other sessions; removed admins are signed out immediately.
- Backend tests (validation rules and API), oxlint, CI workflow, backup script, operations runbook.
- Patched a moderate `uuid` advisory in a transitive dependency.

## 1.0.0
- Initial release: token-link customer form, admin panel, Excel import/export, reminders, audit log. Restructured into `frontend/` and `backend/` in TypeScript.
