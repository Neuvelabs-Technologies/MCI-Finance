<#
.SYNOPSIS
  For MCI IT: make the Tally connector run as SYSTEM, so it keeps working when nobody is signed in.

.DESCRIPTION
  Run once, in an elevated PowerShell (Run as administrator), on the Tally server:

    powershell -ExecutionPolicy Bypass -File <this file>

  It:
    1. Copies the connector (script, settings with the key, and its state) from the folder it was set up in
       (default C:\Users\Ann.Gadiana\MCI-Tally-Connector) to C:\ProgramData\MCI-Tally-Connector.
    2. Lets only SYSTEM and Administrators read that folder (config.json holds the connector key).
    3. Schedules it every 2 minutes as SYSTEM.
    4. Removes the old task that ran as the user who set it up.

  Changes nothing in Tally and nothing in Tally's settings. Safe to run again.
  To undo: Unregister-ScheduledTask -TaskName 'MCI Finance - Tally connector' -Confirm:$false
#>
[CmdletBinding()]
param(
  [string]$From = 'C:\Users\Ann.Gadiana\MCI-Tally-Connector',
  [string]$To = 'C:\ProgramData\MCI-Tally-Connector',
  [string]$TaskName = 'MCI Finance - Tally connector'
)

$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this from an elevated PowerShell (right-click PowerShell > Run as administrator).'
}
foreach ($f in 'tally-sync.ps1', 'config.json') {
  if (-not (Test-Path (Join-Path $From $f))) { throw "$f not found in $From. Point -From at the folder the connector was set up in." }
}

# 1. Copy (keeps config.json with the key, and state.json so it carries on where it left off)
New-Item -ItemType Directory -Force $To | Out-Null
foreach ($f in 'tally-sync.ps1', 'install-task.ps1', 'config.json', 'config.example.json', 'state.json', 'README.md') {
  $src = Join-Path $From $f
  if (Test-Path $src) { Copy-Item $src $To -Force }
}
Write-Host "Copied the connector to $To"

# 2. Only SYSTEM and Administrators may read it
& icacls $To /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' | Out-Null
Write-Host 'Folder limited to SYSTEM and Administrators.'

# 3. Every 2 minutes as SYSTEM (replaces the old task of the same name, which ran as the user)
$script = Join-Path $To 'tally-sync.ps1'
$config = Join-Path $To 'config.json'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -ConfigPath `"$config`"" `
  -WorkingDirectory $To
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
$system = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Limited

$old = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($old) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed the old task (it ran as $($old.Principal.UserId))."
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $system | Out-Null
Write-Host "Scheduled '$TaskName' every 2 minutes as SYSTEM. It no longer needs anyone signed in."
Write-Host "Logs: $(Join-Path $To 'logs')"
Write-Host ''
Write-Host "The old folder $From can be deleted once the dashboard shows a sync from the new task."
Write-Host 'TallyPrime still has to be open with the company loaded (in anyone''s session) for there to be data.'
