# Changelog

## 1.7.0 — unreleased

### New
- **Tally reports** (`/admin/tally`). Income, expenses, net result, receivables, payables and cash & bank; income and expenses by month; top customers; who owes MCI and whom MCI owes; every voucher (with its ledger lines) and every ledger, searchable. Period: this year, last 12 months, last year or all dates. Read-only: nothing changes Tally.
  - **Only for chosen users.** Any admin switches it on or off per user in **Settings → Users** (new "Tally reports" column). The optional `TALLY_USERS` server setting lists emails that always have it; usually it's left empty. Everyone else doesn't see the menu item, and the API refuses them (403). Changes are recorded in Activity.
- **Tally connector** (`connector/`): a PowerShell script for MCI's Tally server. Every 15 minutes it reads ledgers and new or changed vouchers from TallyPrime's XML port (export only) and sends them to `/api/tally/connector/*` with its own key (`TALLY_CONNECTOR_KEY`, optionally limited to `TALLY_ALLOWED_IPS`). Once a day it flags vouchers and ledgers deleted in Tally; nothing is ever deleted in MCI Finance. Setup and hand-over: [docs/TALLY.md](docs/TALLY.md).

- **Tally connection panel** at the top of Tally reports, in plain words: connected to TallyPrime (and whose session it runs in) and which company is open; or Tally not open, no company loaded, Tally not answering (a message box waiting), another Tally (e.g. ERP 9) holding the port, or the connector itself offline. Shows when data last arrived, when the next sync is due, and when the connector last checked in. Refreshes every 20 seconds and reloads the figures when a sync lands.
- **Sync now** button: the connector picks the request up at its next check-in (within 2 minutes) if Tally is open with the company. Recorded in Activity.
- **Reports tab**: quarter and year summary (income, expenses, net, margin, by calendar quarter), profit and loss by ledger, and sales by customer, each downloadable as CSV.
- **More periods**: this month, last month, this quarter, last quarter, this year, last year, last 12 months, all dates, or custom dates.
- Connector 1.1.0: checks in every 2 minutes (`/api/tally/connector/heartbeat`) and syncs every 15 minutes or on request. Only simple export requests, each with a time limit, so a busy Tally can't hold it up; works out primary groups itself instead of asking Tally to compute them. Reads only `expectProduct` (TallyPrime) and reports any other Tally on the port instead of reading it. Re-run `install-task.ps1` to switch the schedule to every 2 minutes.
- **Group P&L** tab in Tally reports: MCI Group's management P&L with the group tool's rows and columns. Actual from Tally (year to date, to the end of a chosen month) next to the uploaded full-year forecast, with variance and % of forecast for any column. Click an account to see its Tally ledgers. **Excel** downloads Actual, Forecast and Actual vs Forecast sheets.
  - **Upload forecast**: the monthly P&L export from the group planning tool, as it is. Year, version and entity are read from the file. Older uploads are kept and can be picked.
  - **Setup**: link Tally ledgers or whole Tally groups to group accounts (one click for ledgers named like an account); give each project (Tally cost centre) its service line; choose how each account is spread (by project, FTE, headcount, gross margin or office m², or kept in Local HQ / Local Adjustments); enter FTE, headcount and m² per service line from the HR report. Back-office costs are spread in the app only. Changes are recorded in Activity.
  - Anything not yet placed (unlinked ledgers, projects without a service line, revenue without a project, missing HR figures) is listed above the table and kept in Back-Office, so totals always match the books.
- Connector 1.2.0: also reads the cost centres on each voucher line and each ledger's chain of groups. After the update, the next sync reads every voucher again once.

### Changed
- Pushes that only change `connector/` don't redeploy the App Service.

## 1.6.0 — 2026-11-21

### New
- **Vendors.** Suppliers who invoice MCI now have their own **Vendors** list next to **Customers** in the sidebar (under "Send links to"), with a count on each. They fill the same form through the same kind of personal link. Add, import, invite, remind, review and export them just like customers.
  - Vendors get their own invite and reminder wording ("Dear Valued Supplier… supplier information form"). Edit it in **Settings → Emails** with the new Customers / Vendors switch. The preview shows the selected set.
  - Codes are unique across both lists. A code already used by a customer can't be given to a vendor, and the import skips that row and says why.
  - On the form, vendors see "Supplier code", and the "companies you deal with" text is worded for suppliers. Finance's submission alert says whether a customer or a vendor submitted.
  - **Overview** has a Customers / Vendors switch. The **Emails** page can be filtered to either group and marks vendor emails. Excel exports have a **Type** column, and the PEPPOL sheet covers both groups.
  - Demo data includes six sample vendors.
- **New home page** at https://finance-ae.wearemci.com. It explains what the site is for, how it works in three steps, and which documents to have ready. **Staff sign-in** is in the top right.
- **"Can't find your link?"** on the home page. A customer or vendor who was already invited enters their email address and gets their link again, sent only to the addresses on their record. The answer is always the same, so it can't reveal who is registered. Requests are limited to 5 per 15 minutes per visitor and 1 email per company every 30 minutes, and only for companies we are still waiting on. Each request is recorded in Activity.

### Changed
- Existing records are marked as customers the first time the server starts. Nothing else needs to be migrated.
- The correction email greets vendors as "Dear Valued Supplier". The new placeholder `{{partyType}}` gives "customer" or "supplier" in any template.

## 1.5.0 — 2026-11-20

### New
- **Production on MCI's Azure** (https://finance-ae.wearemci.com): pushing to `main` tests the code, deploys it to the App Service `app-finance-ae-prod-001` and checks that the new version answers `/api/health`. The UAT server (Tencent) now deploys from the `uat` branch.
- **Sign in with Microsoft** (MCI's Entra ID, `ENTRA_*` settings). Members of MCI's finance app group can sign in; their admin account is created the first time. `PASSWORD_LOGIN=false` turns off email-and-password sign-in. It stays on until Microsoft sign-in is fully set up, so a missing setting can't lock everyone out.
- **Documents in Azure Blob storage** when `AZURE_STORAGE_BLOB_ENDPOINT` is set, reached with the app's managed identity. Without it, documents stay on the server's disk as before.
- On Azure, the API serves the frontend itself (no nginx).

### Changed
- Reads `MONGODB_URI` (MCI's setting name) as well as `MONGO_URI`. When the URI names no database, the database is `finance` (`MONGODB_DB` overrides).
- `/api/health` also reports where documents are kept and, on Azure, the deployed commit.
- Sign-in rate limits work behind Azure's front end (it adds a port to the client address).
- Mongoose updated to 9.12 (security fixes).

## 1.4.1 — 2026-10-28

### Fixed
- **"Email customer to correct" didn't send anything**: it failed with "Already submitted". A customer marked *Needs correction* now gets a correction email containing the review note and their form link ("Action needed: please update your UAE e-invoicing details"). It shows as *Correction request* in their history and on the Emails page.
- A failed or bounced email to a customer asked to correct their submission now shows under **Emails that failed** (Overview and Customers filter). It used to be hidden because they had already submitted.
- Searching while the *failed email* filter was on ignored the filter.

## 1.4.0 — 2026-10-28

### New
- **Emails page**: every email the system sends (invites, reminders, confirmations, submission alerts, test emails), one row per recipient, with its delivery status from Mailjet: Waiting, Delivered, Opened, Bounced, Blocked, Marked as spam, Failed. Tiles to filter problems, search, filters by status and type, and Excel export. Click an email to see Mailjet's reason and every delivery event.
- **Customer page → Emails card**: whether each email to that customer arrived.
- Delivery status arrives through a Mailjet webhook (`MAILJET_WEBHOOK_SECRET`, set up with `npm run mailjet:webhook:prod`). **Refresh from Mailjet** updates recent emails without it.
- A bounced or blocked invite or reminder now counts as a **failed email** on the Customers list and the Overview.
- Settings → System shows whether delivery tracking is live. New Guide topic: *Emails and delivery status*.

### Changed
- Click tracking is off on every email, so customers' form links are never rewritten through Mailjet's tracking domain.
- A failed confirmation email no longer stops the submission alert to finance.

## 1.3.1 — 2026-10-28

### Fixed
- Mailjet rejected the sender when `MAIL_FROM` was quoted in a Docker env file (Docker keeps the quotes). The quotes are now ignored.

## 1.3.0 — 2026-10-28

### Changed
- **Emails are sent through Mailjet** (MCI's email provider) using its Send API. Set `MAILJET_API_KEY`, `MAILJET_SECRET_KEY` and `MAIL_FROM` (a sender verified in Mailjet) in the backend `.env`. SMTP still works as a fallback when the Mailjet keys are empty.
- Mailjet's reason for a failed email (bad keys, unverified sender…) is shown in the customer's email log and on Settings → Emails → Send test.

## 1.2.0 — 2026-10-26

### Changed
- **Customers can upload any document or photo** (PDF, Word, Excel, scans, iPhone HEIC, zip…) with **no size limit** by default (`MAX_FILE_MB=0`). Programs and scripts are still refused, by name and by contents, so a renamed program is caught too.
- PDFs and images open in the browser as before; every other file type is downloaded, never opened, so an uploaded web page can't run inside the admin panel.
- The customer's form link is checked **before** any upload is stored, so made-up links can't fill the disk.

### New
- **Bulk delete** on the Customers list: tick customers → Delete. Removes their details, all uploaded documents (including earlier versions) and their links.

### Deployment note
- Proxies in front of the app must allow large uploads: `client_max_body_size 0;` (nginx defaults to 1 MB). The bundled `frontend/nginx.conf.template` already does this.

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
