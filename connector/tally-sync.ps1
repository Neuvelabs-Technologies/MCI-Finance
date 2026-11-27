<#
.SYNOPSIS
  MCI Finance - Tally connector. Reads accounts from TallyPrime (read-only) and sends them to MCI Finance.

.DESCRIPTION
  Runs on MCI's Tally server every 15 minutes (Windows Task Scheduler, see install-task.ps1).
  1. Asks Tally (http://localhost:9001, Tally's own XML port) for the open companies.
  2. Per company: every ledger with its balance, then the vouchers created or changed since the last run
     (Tally's AlterID tells which), and sends them to https://finance-ae.wearemci.com/api/tally/connector/*.
  3. Once a day: the list of every voucher and ledger still in Tally, so ones deleted there are flagged
     (never deleted) in MCI Finance.

  It only sends Export requests to Tally. It never imports, alters or deletes anything in Tally.
  Plain Windows PowerShell 5.1: nothing to install.

.PARAMETER ConfigPath
  The JSON settings file (default: config.json next to this script). See config.example.json.

.PARAMETER Test
  Check the connection to Tally and to MCI Finance, list the open companies, and send nothing.

.PARAMETER Full
  Send every voucher again (not only changes), and run the daily deleted-voucher check now.
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json'),
  [switch]$Test,
  [switch]$Full
)

$ErrorActionPreference = 'Stop'
$ConnectorVersion = '1.0.0'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Invariant = [Globalization.CultureInfo]::InvariantCulture

# ---------------------------------------------------------------- settings, log

if (-not (Test-Path $ConfigPath)) { throw "Settings file not found: $ConfigPath (copy config.example.json to config.json and fill it in)" }
$Config = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($k in 'tallyUrl', 'source', 'apiBase', 'connectorKey') {
  if (-not $Config.$k) { throw "config.json: '$k' is missing" }
}
if ($Config.connectorKey -like 'PASTE*') { throw 'config.json: connectorKey is still the example value' }
$ApiBase = $Config.apiBase.TrimEnd('/')
$FromDate = if ($Config.fromDate) { [datetime]::ParseExact($Config.fromDate, 'yyyy-MM-dd', $Invariant) } else { [datetime]'2020-01-01' }
$BatchSize = if ($Config.batchSize) { [int]$Config.batchSize } else { 500 }
$PresenceHour = if ($null -ne $Config.dailyCheckHour) { [int]$Config.dailyCheckHour } else { 2 }

$DataDir = Split-Path -Parent (Resolve-Path $ConfigPath)
$LogDir = Join-Path $DataDir 'logs'
New-Item -ItemType Directory -Force $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("tally-sync-{0:yyyyMMdd}.log" -f (Get-Date))
$StateFile = Join-Path $DataDir 'state.json'

function Write-Log([string]$Message, [string]$Level = 'INFO') {
  $line = '{0:yyyy-MM-dd HH:mm:ss} [{1}] {2}' -f (Get-Date), $Level, $Message
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  Write-Host $line
}

# Keep 30 days of logs
Get-ChildItem $LogDir -Filter 'tally-sync-*.log' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force -ErrorAction SilentlyContinue

# ---------------------------------------------------------------- Tally (read-only XML export)

function ConvertTo-XmlText([string]$s) { [Security.SecurityElement]::Escape($s) }

function Invoke-Tally([string]$Body) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($Body)
  $r = Invoke-WebRequest -Uri $Config.tallyUrl -Method Post -Body $bytes -ContentType 'text/xml;charset=utf-8' -UseBasicParsing -TimeoutSec 600
  $raw = $r.RawContentStream.ToArray()
  $text = if ($raw.Length -ge 2 -and $raw[0] -eq 0xFF -and $raw[1] -eq 0xFE) { [Text.Encoding]::Unicode.GetString($raw) } else { [Text.Encoding]::UTF8.GetString($raw) }
  # Tally puts control characters (e.g. &#4;) in names; XML parsers refuse them.
  $text = $text -replace '&#(?:[0-8]|1[124-9]|2[0-9]|3[01]);', '' -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', ''
  $xml = [xml]$text
  $err = $xml.SelectSingleNode('//LINEERROR')
  if ($err) { throw "Tally: $($err.InnerText)" }
  return $xml
}

function Get-TallyCollection([string]$Company, [string]$Type, [string]$Fetch, [string]$Extra = '', [datetime]$From = $FromDate, [datetime]$To = (Get-Date).AddYears(1)) {
  $companyVar = if ($Company) { "<SVCURRENTCOMPANY>$(ConvertTo-XmlText $Company)</SVCURRENTCOMPANY>" } else { '' }
  $body = @"
<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>MCIFinance$Type</ID></HEADER>
<BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>`$`$SysName:XML</SVEXPORTFORMAT>$companyVar
<SVFROMDATE>$($From.ToString('yyyyMMdd'))</SVFROMDATE><SVTODATE>$($To.ToString('yyyyMMdd'))</SVTODATE></STATICVARIABLES>
<TDL><TDLMESSAGE><COLLECTION NAME="MCIFinance$Type" ISMODIFY="No"><TYPE>$Type</TYPE><FETCH>$Fetch</FETCH>$Extra</COLLECTION>
</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>
"@
  $xml = Invoke-Tally $body
  return @($xml.SelectNodes("//COLLECTION/$($Type.ToUpper())"))
}

function Get-Text($node, [string]$name) {
  $n = $node.SelectSingleNode($name)
  if ($n) { return $n.InnerText.Trim() } else { return '' }
}

# Tally amounts: "-1234.50", "1,234.50", or "-`$100.00 @ AED 3.67/`$ = -AED 367.00" for foreign currency (take the AED part).
function ConvertTo-Amount([string]$s) {
  if (-not $s) { return 0.0 }
  if ($s.Contains('=')) { $s = $s.Substring($s.LastIndexOf('=') + 1) }
  $neg = $s.Contains('-')
  $digits = ($s -replace '[^0-9.]', '')
  if (-not $digits) { return 0.0 }
  $n = [double]::Parse($digits, $Invariant)
  if ($neg) { return - $n } else { return $n }
}

function Get-OpenCompanies {
  if ($Config.companies -and @($Config.companies).Count -gt 0) { return @($Config.companies) }
  return @(Get-TallyCollection -Company '' -Type 'Company' -Fetch 'Name' | ForEach-Object { $_.GetAttribute('NAME') } | Where-Object { $_ })
}

# ---------------------------------------------------------------- MCI Finance API

function Invoke-Api([string]$Method, [string]$Path, $Body = $null) {
  $headers = @{ 'x-tally-key' = $Config.connectorKey }
  $uri = "$ApiBase/api/tally/connector$Path"
  if ($null -ne $Body) {
    $json = ConvertTo-Json -InputObject $Body -Depth 8 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -Body $bytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 300
  }
  return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -TimeoutSec 60
}

function Send-InBatches([string]$Path, [hashtable]$Target, [string]$Field, [object[]]$Rows) {
  for ($i = 0; $i -lt $Rows.Count; $i += $BatchSize) {
    $chunk = @($Rows[$i..([Math]::Min($i + $BatchSize, $Rows.Count) - 1)])
    $body = @{ source = $Target.source; company = $Target.company }
    $body[$Field] = $chunk
    [void](Invoke-Api 'Post' $Path $body)
  }
}

# ---------------------------------------------------------------- one company

function Get-VoucherTypeBases([string]$Company) {
  $parents = @{}
  foreach ($vt in Get-TallyCollection -Company $Company -Type 'VoucherType' -Fetch 'Name,Parent') {
    $parents[$vt.GetAttribute('NAME')] = Get-Text $vt 'PARENT'
  }
  $bases = @{}
  foreach ($name in $parents.Keys) {
    $cur = $name
    for ($d = 0; $d -lt 10; $d++) {
      $p = $parents[$cur]
      if (-not $p -or $p -eq $cur -or -not $parents.ContainsKey($p)) { break }
      $cur = $p
    }
    $bases[$name] = $cur
  }
  return $bases
}

function Get-Ledgers([string]$Company) {
  $nodes = Get-TallyCollection -Company $Company -Type 'Ledger' -Fetch 'Name,Parent,GUID,AlterID,OpeningBalance,ClosingBalance' `
    -Extra '<COMPUTE>PrimaryGroup : $_PrimaryGroup</COMPUTE>' -To (Get-Date)
  return @($nodes | ForEach-Object {
      [ordered]@{
        guid    = Get-Text $_ 'GUID'
        name    = $_.GetAttribute('NAME')
        alterId = [long](ConvertTo-Amount (Get-Text $_ 'ALTERID'))
        parent  = Get-Text $_ 'PARENT'
        group   = Get-Text $_ 'PRIMARYGROUP'
        opening = ConvertTo-Amount (Get-Text $_ 'OPENINGBALANCE')
        closing = ConvertTo-Amount (Get-Text $_ 'CLOSINGBALANCE')
      }
    } | Where-Object { $_.guid -and $_.name })
}

$VoucherFetch = 'GUID,AlterID,Date,VoucherTypeName,VoucherNumber,Reference,PartyLedgerName,Narration,IsCancelled,IsOptional,' +
'AllLedgerEntries.LedgerName,AllLedgerEntries.Amount,AllInventoryEntries.AccountingAllocations.LedgerName,AllInventoryEntries.AccountingAllocations.Amount'

function Convert-Voucher($v, [hashtable]$Groups, [hashtable]$Bases) {
  $entries = New-Object System.Collections.ArrayList
  foreach ($e in $v.SelectNodes('ALLLEDGERENTRIES.LIST')) {
    $name = Get-Text $e 'LEDGERNAME'
    if ($name) { [void]$entries.Add([ordered]@{ ledger = $name; group = [string]$Groups[$name]; amount = ConvertTo-Amount (Get-Text $e 'AMOUNT') }) }
  }
  # Item invoices keep the sales/purchase ledger under the inventory lines. Add those only if the
  # ledger lines alone don't balance, so nothing is counted twice.
  $sum = 0.0; foreach ($e in $entries) { $sum += $e.amount }
  if ([Math]::Abs($sum) -gt 0.01) {
    foreach ($e in $v.SelectNodes('ALLINVENTORYENTRIES.LIST/ACCOUNTINGALLOCATIONS.LIST')) {
      $name = Get-Text $e 'LEDGERNAME'
      if ($name) { [void]$entries.Add([ordered]@{ ledger = $name; group = [string]$Groups[$name]; amount = ConvertTo-Amount (Get-Text $e 'AMOUNT') }) }
    }
  }
  $type = Get-Text $v 'VOUCHERTYPENAME'
  return [ordered]@{
    guid        = Get-Text $v 'GUID'
    alterId     = [long](ConvertTo-Amount (Get-Text $v 'ALTERID'))
    date        = Get-Text $v 'DATE'
    voucherType = $type
    baseType    = if ($Bases.ContainsKey($type)) { $Bases[$type] } else { $type }
    number      = Get-Text $v 'VOUCHERNUMBER'
    reference   = Get-Text $v 'REFERENCE'
    party       = Get-Text $v 'PARTYLEDGERNAME'
    narration   = Get-Text $v 'NARRATION'
    cancelled   = (Get-Text $v 'ISCANCELLED') -eq 'Yes'
    optional    = (Get-Text $v 'ISOPTIONAL') -eq 'Yes'
    entries     = @($entries)
  }
}

# Month-by-month windows, so the first sync of years of data doesn't ask Tally for everything at once.
function Get-MonthWindows {
  $windows = @()
  $start = Get-Date -Year $FromDate.Year -Month $FromDate.Month -Day 1 -Hour 0 -Minute 0 -Second 0
  $end = (Get-Date).AddYears(1)
  while ($start -lt $end) {
    $windows += , @($start, $start.AddMonths(1).AddDays(-1))
    $start = $start.AddMonths(1)
  }
  return , $windows   # the comma stops PowerShell unrolling the list
}

function Sync-Company([string]$Company, [bool]$RunPresenceCheck) {
  $started = Get-Date
  $target = @{ source = $Config.source; company = $Company }
  $bases = Get-VoucherTypeBases $Company

  $ledgers = @(Get-Ledgers $Company)
  $groups = @{}; foreach ($l in $ledgers) { $groups[$l.name] = $l.group }
  Send-InBatches '/ledgers' $target 'ledgers' $ledgers
  Write-Log "$Company : $($ledgers.Count) ledgers sent"

  $state = Invoke-Api 'Get' ("/state?source={0}&company={1}" -f [uri]::EscapeDataString($Config.source), [uri]::EscapeDataString($Company))
  $since = if ($Full) { 0 } else { [long]$state.maxVoucherAlterId }
  $filter = "<FILTERS>MCIChanged</FILTERS><SYSTEM TYPE=`"Formulae`" NAME=`"MCIChanged`">`$AlterID &gt; $since</SYSTEM>"

  $sent = 0
  # First sync: month by month. After that only changes, in one request.
  if ($since -eq 0) { $windows = Get-MonthWindows } else { $windows = @(, @($FromDate, (Get-Date).AddYears(1))) }
  foreach ($w in $windows) {
    $nodes = @(Get-TallyCollection -Company $Company -Type 'Voucher' -Fetch $VoucherFetch -Extra $filter -From $w[0] -To $w[1])
    if ($nodes.Count -eq 0) { continue }
    $rows = @($nodes | ForEach-Object { Convert-Voucher $_ $groups $bases } | Where-Object { $_.guid -and $_.date })
    Send-InBatches '/vouchers' $target 'vouchers' $rows
    $sent += $rows.Count
  }
  Write-Log "$Company : $sent new or changed vouchers sent (after AlterID $since)"

  if ($RunPresenceCheck) {
    $guids = New-Object System.Collections.ArrayList
    foreach ($w in Get-MonthWindows) {
      foreach ($n in Get-TallyCollection -Company $Company -Type 'Voucher' -Fetch 'GUID' -From $w[0] -To $w[1]) {
        $g = Get-Text $n 'GUID'; if ($g) { [void]$guids.Add($g) }
      }
    }
    if ($guids.Count -gt 0) {
      $r = Invoke-Api 'Post' '/present' @{ source = $Config.source; company = $Company; kind = 'voucher'; guids = @($guids) }
      Write-Log "$Company : daily check - $($guids.Count) vouchers in Tally, $($r.flaggedDeleted) flagged as deleted, $($r.restored) restored"
    }
    if ($ledgers.Count -gt 0) {
      $r = Invoke-Api 'Post' '/present' @{ source = $Config.source; company = $Company; kind = 'ledger'; guids = @($ledgers | ForEach-Object { $_.guid }) }
      Write-Log "$Company : daily check - $($r.flaggedDeleted) ledgers flagged as deleted"
    }
  }

  [void](Invoke-Api 'Post' '/sync-log' @{
      source = $Config.source; company = $Company; ok = $true; ledgers = $ledgers.Count; vouchers = $sent
      full = ($since -eq 0 -or $RunPresenceCheck); durationMs = [int]((Get-Date) - $started).TotalMilliseconds
      connectorVersion = $ConnectorVersion; host = $env:COMPUTERNAME
    })
}

# ---------------------------------------------------------------- main

# One run at a time (a slow first sync must not overlap the next 15-minute run)
$mutex = New-Object System.Threading.Mutex($false, 'Global\MCIFinanceTallyConnector')
if (-not $mutex.WaitOne(0)) { Write-Log 'Another run is still going; skipping this one.'; exit 0 }

try {
  if ($Test) {
    Write-Log "Test run (nothing is sent). Connector $ConnectorVersion, Tally at $($Config.tallyUrl), source '$($Config.source)'"
    $companies = @(Get-OpenCompanies)
    if ($companies.Count -eq 0) { Write-Log 'Tally answered, but no company is open. Open the company in TallyPrime.' 'WARN' }
    foreach ($c in $companies) {
      $count = @(Get-Ledgers $c).Count
      Write-Log "Tally company '$c': $count ledgers readable"
      $s = Invoke-Api 'Get' ("/state?source={0}&company={1}" -f [uri]::EscapeDataString($Config.source), [uri]::EscapeDataString($c))
      Write-Log "MCI Finance accepted the key. Vouchers on record up to AlterID $($s.maxVoucherAlterId)."
    }
    exit 0
  }

  $state = @{ lastPresenceCheck = '' }
  if (Test-Path $StateFile) { try { $state.lastPresenceCheck = (Get-Content $StateFile -Raw | ConvertFrom-Json).lastPresenceCheck } catch { } }
  $today = (Get-Date).ToString('yyyy-MM-dd')
  $presence = $Full -or ($state.lastPresenceCheck -ne $today -and (Get-Date).Hour -ge $PresenceHour)

  try { $companies = @(Get-OpenCompanies) }
  catch { Write-Log "Tally is not answering at $($Config.tallyUrl): $($_.Exception.Message). Is TallyPrime open?" 'WARN'; exit 0 }
  if ($companies.Count -eq 0) { Write-Log 'No company is open in Tally; nothing to send.' 'WARN'; exit 0 }

  $failed = 0
  foreach ($c in $companies) {
    try { Sync-Company $c $presence }
    catch {
      $failed++
      $msg = $_.Exception.Message
      Write-Log "$c : FAILED - $msg" 'ERROR'
      try { [void](Invoke-Api 'Post' '/sync-log' @{ source = $Config.source; company = $c; ok = $false; error = $msg; connectorVersion = $ConnectorVersion; host = $env:COMPUTERNAME }) } catch { }
    }
  }
  if ($presence -and $failed -eq 0) { @{ lastPresenceCheck = $today } | ConvertTo-Json | Set-Content $StateFile -Encoding UTF8 }
  if ($failed -gt 0) { exit 1 }
}
finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
