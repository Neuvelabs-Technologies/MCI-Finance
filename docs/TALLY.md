# Tally connector and Tally reports

Neuvelabs Technologies, for MCI · set up 27 November 2026

MCI Finance shows a **Tally reports** dashboard (`/admin/tally`) with figures copied from MCI's TallyPrime. A small PowerShell script, the **connector**, runs on the Tally server, reads Tally, and pushes the data to MCI Finance. Only the users chosen for it can open the dashboard.

```
Tally server EUAZRAPP001P (MCIGROUP.LAN, Azure)            MCI Finance (Azure App Service)
┌──────────────────────────────────────────┐              ┌───────────────────────────────────────────┐
│ TallyPrime "Gold"  ── XML port :9001     │              │ https://finance-ae.wearemci.com           │
│        ▲  Export requests only           │   HTTPS 443  │  /api/tally/connector/*  (X-Tally-Key)    │
│        │                                 │ ───────────► │        │                                  │
│ connector\tally-sync.ps1                 │   outbound   │        ▼                                  │
│ (Task Scheduler, every 15 min)           │   only       │  DocumentDB "finance": tallyledgers,      │
└──────────────────────────────────────────┘              │  tallyvouchers, tallysyncs                │
                                                          │        │                                  │
                                                          │        ▼                                  │
                                                          │  /admin/tally — only users with access    │
                                                          └───────────────────────────────────────────┘
```

## Why it is built this way

| Decision | Reason |
|---|---|
| **Push from the Tally server, not pull from Azure** | Tally's XML port has no password and also accepts imports (writes). Keeping it reachable only on the Tally machine itself (`localhost`) is safer than opening it to the network. The connector needs only outbound HTTPS. |
| **PowerShell, no installs** | The Tally server has no Node, Python or git, and the account used has no admin rights. Windows PowerShell 5.1 is already there. |
| **Read-only towards Tally** | The connector only sends `Export` requests. It never imports, alters or deletes anything in Tally. |
| **Nothing is deleted in MCI Finance** | Records are added or updated, matched on Tally's own GUID. A voucher or ledger deleted in Tally is only flagged `deletedInTally` (and left out of the reports); the history stays. |
| **Inside the existing MCI Finance app** | Same Microsoft sign-in, same deploy pipeline, same database. No new server or Azure resource. |
| **Access per user, not a new Entra group** | Only ~2 people need it. Access is a switch per user (see below), so no Entra permission request is needed. |

## What was found on the Tally server (27 Nov 2026)

| | Tally Gold — **TallyPrime 1.1.7** | Tally.ERP 9 (older) |
|---|---|---|
| Program | `C:\Program Files\TallyPrime` (also `TallyPrime (1)`) | `C:\Program Files\Tally\Tally.ERP9` |
| Data | `D:\Tally Data MCI 02.06.2026\08.06.2026` | `C:\DataCentre1` (company 10001) |
| XML / ODBC port | **9001** | **9001 as well** — see *Port clash* below |
| Licence server | `EUAZRAPP001P:10000` (Tally Gateway Server 11.0) | same |
| State on 27 Nov | Running, **no company open** (data not moved into Gold yet) | — |

The connector is pointed at **Tally Gold** (`"source": "gold"`). Until the data is moved and the company is opened in TallyPrime, the connector runs, finds no open company, logs that, and sends nothing. As soon as a company is open, data appears in the dashboard within 15 minutes. No code change is needed when the data arrives.

## What we did on the Tally server

Nothing in Tally was changed. No data was deleted. Nothing was installed system-wide.

1. **Looked around (read-only):** Tally installs, `tally.ini` files, services, ports, firewall rules. Asked Tally once for its list of open companies (an Export request).
2. **Downloaded the repo** (zip from GitHub) to `C:\Users\Ann.Gadiana\Desktop\Neuvelabs\MCI-Finance` and wrote the code there.
3. **Copied the connector** to `C:\Users\Ann.Gadiana\MCI-Tally-Connector\` and created its `config.json` with a **new random connector key** (64 hex characters). That file is not in git.
4. **Tested the connector** with `-Test`: it reached TallyPrime on `localhost:9001`, which answered that no company is open. Nothing was sent.
5. Found the server's outbound public IP: **13.81.244.133** (for `TALLY_ALLOWED_IPS`).
6. *(If you approved it)* registered the scheduled task — see step B below.

> **Before signing out of the Tally server for the last time:** copy the `connectorKey` value from
> `C:\Users\Ann.Gadiana\MCI-Tally-Connector\config.json` into your password manager. MCI IT needs it for step A,
> and nobody can read it from the repo. If it's lost, generate a new one and change it in both places.

## What is left to do (from your own computer)

### A. MCI Finance app settings (MCI IT, Azure portal → App Service `app-finance-ae-prod-001` → Environment variables)

| Setting | Value |
|---|---|
| `TALLY_CONNECTOR_KEY` | the `connectorKey` from `config.json` on the Tally server |
| `TALLY_ALLOWED_IPS` | `13.81.244.133` (the Tally server's outbound IP; leave empty if it can change) |
| `TALLY_USERS` | *optional, usually empty.* Access is set in the app (step D). Emails listed here always have it and can't be switched off in the app |

Saving restarts the app (a few seconds). Until `TALLY_CONNECTOR_KEY` is set, the connector gets *503 not set up* and nothing is stored.

### B. Keep the connector running after you sign out (MCI IT, needs admin once)

A task registered under **your** Windows account runs only while you are signed in to the Tally server. A disconnected Remote Desktop session keeps it alive; **signing out stops it**. For it to keep running, MCI IT should register it under SYSTEM:

```powershell
# On EUAZRAPP001P, in an elevated (Run as administrator) PowerShell:
New-Item -ItemType Directory -Force 'C:\ProgramData\MCI-Tally-Connector'
Copy-Item 'C:\Users\Ann.Gadiana\MCI-Tally-Connector\*' 'C:\ProgramData\MCI-Tally-Connector\'
# Only Administrators and SYSTEM may read the folder (config.json holds the key)
icacls 'C:\ProgramData\MCI-Tally-Connector' /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F'
powershell -ExecutionPolicy Bypass -File 'C:\ProgramData\MCI-Tally-Connector\install-task.ps1' -AsSystem
# If a task was registered under Ann.Gadiana earlier, remove that one:
#   Unregister-ScheduledTask -TaskName 'MCI Finance - Tally connector' -Confirm:$false   (run as that user)
```

Tally itself must still be **open with the company loaded** for there to be anything to read. The XML port is served by whichever TallyPrime instance is running on the machine, in any user's session.

### C. Port clash between Tally Gold and Tally.ERP 9 (MCI IT, needs admin)

Both `tally.ini` files say `ServerPort=9001`. Whichever Tally starts first takes the port, so the connector could read ERP 9 and label it "gold". Fix: give Gold its own port.

1. Back up `C:\Program Files\TallyPrime\tally.ini` (and `TallyPrime (1)\tally.ini` if that copy is used).
2. Change `ServerPort=9001` to `ServerPort=9002` in it and restart TallyPrime.
3. In the connector's `config.json`, set `"tallyUrl": "http://localhost:9002"`.
4. Run `tally-sync.ps1 -Test` to check.

Once ERP 9 is retired, this doesn't matter.

### D. Give the users access

Any admin opens **Settings → Users** and turns on the *Tally reports* switch for each person who should see it (they can turn it on for themselves too). Those users then see **Reports → Tally reports** in the sidebar. Nobody else sees the menu or can call the API. Every change is recorded in Activity.

### E. Check it works

On the Tally server, with the company open in TallyPrime:

```powershell
powershell -ExecutionPolicy Bypass -File C:\ProgramData\MCI-Tally-Connector\tally-sync.ps1 -ConfigPath C:\ProgramData\MCI-Tally-Connector\config.json -Test
```

It should list the company, its ledger count, and say *MCI Finance accepted the key*. Then open https://finance-ae.wearemci.com/admin/tally. The badge under the title shows when it last synced. Logs: `logs\tally-sync-YYYYMMDD.log` next to the script (kept 30 days).

## How the connector works

| Every 15 minutes | Once a day (after 02:00) |
|---|---|
| Finds the companies open in Tally (or the ones listed in `config.json`). | Sends the GUID of every voucher and ledger still in Tally. |
| Sends **every ledger** with its opening and closing balance (balances move without the ledger changing). | MCI Finance flags the ones that are missing as `deletedInTally` (kept, never deleted). |
| Asks MCI Finance for the highest voucher AlterID it holds, then sends only vouchers **created or changed since** (Tally bumps AlterID on every change). The first run goes month by month from `fromDate`. | It refuses if Tally lists fewer than half of what is on record, which usually means a half-loaded company, so a bad read can't hide data. |
| Records the run (OK / failed, counts, duration) — shown on the dashboard. | |

`tally-sync.ps1 -Full` resends everything and runs the daily check now. Overlapping runs are prevented.

### Settings (`config.json`)

| Key | Meaning |
|---|---|
| `tallyUrl` | Tally's XML port, `http://localhost:9001` (or 9002 after step C) |
| `source` | `gold` for Tally Gold. Another installation would get its own name, e.g. `erp9`, and appear separately in the dashboard's company picker |
| `companies` | `[]` = every company open in Tally, or a list of exact company names |
| `apiBase` | `https://finance-ae.wearemci.com` |
| `connectorKey` | same value as `TALLY_CONNECTOR_KEY` in the App Service |
| `fromDate` | earliest voucher date to read on the first run |
| `batchSize` | records per request (500) |
| `dailyCheckHour` | hour after which the daily deleted-records check runs (2) |

### How figures are worked out

Tally stores credit as positive and debit as negative, and the data keeps that sign.

| Figure | From |
|---|---|
| Income | Ledger lines in *Sales Accounts, Direct Incomes, Indirect Incomes* in the period |
| Expenses | Ledger lines in *Purchase Accounts, Direct Expenses, Indirect Expenses* in the period |
| Receivables / Payables | Today's closing balances of *Sundry Debtors* / *Sundry Creditors* ledgers |
| Cash & bank | Today's closing balances of *Bank Accounts, Cash-in-Hand, Bank OD A/c* |
| Top customers | Vouchers based on the *Sales* type, by party |

Cancelled and optional vouchers are left out. If MCI has renamed Tally's primary groups, add the new names to `GROUPS` in `backend/src/modules/tally/tally.controller.ts`.

## Changing things later (CI/CD)

**One repo** (`Neuvelabs-Technologies/MCI-Finance`), no separate git for the connector.

| You change | What happens |
|---|---|
| The dashboard or API (`frontend/`, `backend/`) | Normal flow: push to `uat` → UAT (Tencent) → merge to `main` → GitHub Actions tests and deploys to Azure. |
| The connector (`connector/`) | No deploy. `azure-prod.yml` ignores `connector/**`. Copy the new `tally-sync.ps1` over the old one on the Tally server (keep `config.json`). It changes rarely. |

**Why no automatic deploy to the Tally server:** that would need a GitHub runner or an inbound connection on a production Tally machine with admin rights, and code from GitHub running there unattended. For one small script that changes rarely, copying it by hand is safer. The connector reports its version with every sync (shown on the dashboard), so an outdated copy is easy to spot.

## API reference

Connector (header `X-Tally-Key`):

| Method | Path | Body / query |
|---|---|---|
| GET | `/api/tally/connector/state` | `?source=&company=` → `{ maxVoucherAlterId, lastSync }` |
| POST | `/api/tally/connector/ledgers` | `{ source, company, ledgers: [{ guid, name, alterId, parent, group, opening, closing }] }` (≤ 20,000) |
| POST | `/api/tally/connector/vouchers` | `{ source, company, vouchers: [{ guid, alterId, date, voucherType, baseType, number, reference, party, narration, cancelled, optional, entries: [{ ledger, group, amount }] }] }` (≤ 5,000) |
| POST | `/api/tally/connector/present` | `{ source, company, kind: "ledger" \| "voucher", guids: [...], force? }` |
| POST | `/api/tally/connector/sync-log` | `{ source, company, ok, ledgers, vouchers, full, durationMs, error?, connectorVersion?, host? }` |

Dashboard (signed in, with Tally access): `GET /api/tally/companies`, `/summary`, `/vouchers`, `/ledgers` (`?source=&company=&from=&to=&type=&group=&q=&page=&limit=`). Access: `PUT /api/admins/:id/tally { enabled }`.

## Security notes

- The connector key is stored only in the App Service setting and in `config.json` on the Tally server. It is never in git (`connector/config.json` is git-ignored).
- With `TALLY_ALLOWED_IPS` set, a stolen key is useless from anywhere else.
- **This GitHub repo is public.** The connector code holds no secrets, but consider making the repo private: `docs/` describes MCI's Azure setup.
- To revoke the connector: empty `TALLY_CONNECTOR_KEY` in the App Service (intake stops at once), or change it.
