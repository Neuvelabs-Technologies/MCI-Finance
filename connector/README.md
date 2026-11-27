# Tally connector

Runs on MCI's Tally server. Reads TallyPrime (export only) every 15 minutes and pushes ledgers and vouchers to MCI Finance.

| File | |
|---|---|
| `tally-sync.ps1` | The connector. `-Test` checks Tally and the key without sending; `-Full` resends everything |
| `install-task.ps1` | Schedules it every 15 minutes (`-AsSystem` from an elevated prompt to run without anyone signed in; `-Remove` to unschedule) |
| `config.example.json` | Copy to `config.json` and fill in. `config.json` holds the key and is git-ignored |

Setup, hand-over checklist, and how it works: [../docs/TALLY.md](../docs/TALLY.md).
