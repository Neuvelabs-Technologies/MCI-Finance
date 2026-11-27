<#
.SYNOPSIS
  Schedules the Tally connector to check in every 2 minutes (it syncs every 15, or on "Sync now").

.DESCRIPTION
  Default (no admin rights needed): runs as the signed-in Windows user, only while that user is signed in
  (a disconnected Remote Desktop session still counts; signing out stops it).

  -AsSystem (run from an elevated PowerShell, i.e. by MCI IT): runs as the SYSTEM account whether or not
  anyone is signed in. Tally itself still has to be open with the company loaded for there to be data.

  Changes nothing in Tally. Re-running replaces the existing task of the same name.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-task.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-task.ps1 -AsSystem
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-task.ps1 -Remove
#>
[CmdletBinding()]
param(
  [switch]$AsSystem,
  [switch]$Remove,
  [string]$TaskName = 'MCI Finance - Tally connector',
  # How often the connector checks in. It syncs data every syncMinutes (config.json, 15) or when "Sync now" is pressed.
  [int]$Minutes = 2
)

$ErrorActionPreference = 'Stop'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed scheduled task '$TaskName'. The connector files and logs are left in place."
  return
}

$script = Join-Path $PSScriptRoot 'tally-sync.ps1'
$config = Join-Path $PSScriptRoot 'config.json'
if (-not (Test-Path $script)) { throw "tally-sync.ps1 not found next to this file ($PSScriptRoot)" }
if (-not (Test-Path $config)) { throw "config.json not found in $PSScriptRoot. Copy config.example.json to config.json and fill it in first." }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -ConfigPath `"$config`"" `
  -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutes)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries

if ($AsSystem) {
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Limited
} else {
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
$who = if ($AsSystem) { 'SYSTEM (runs without anyone signed in)' } else { "$env:USERDOMAIN\$env:USERNAME (runs while this user is signed in)" }
Write-Host "Scheduled '$TaskName' every $Minutes minutes as $who."
Write-Host "Logs: $(Join-Path $PSScriptRoot 'logs')"
