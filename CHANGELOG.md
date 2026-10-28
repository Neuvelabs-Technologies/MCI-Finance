# Changelog

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
