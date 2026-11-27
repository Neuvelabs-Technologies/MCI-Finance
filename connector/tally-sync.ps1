<#
.SYNOPSIS
  MCI Finance - Tally connector. Reads accounts from TallyPrime (read-only) and sends them to MCI Finance.

.DESCRIPTION
  Runs on MCI's Tally server every 2 minutes (Windows Task Scheduler, see install-task.ps1).

  Every run (a "check-in", a second or two):
    - Looks at Tally's XML port: is Tally running, which Tally (TallyPrime or Tally.ERP 9), whose
      Windows session it runs in, which companies are open. Reports that to MCI Finance, so the
      dashboard can say what is going on, and learns whether someone pressed "Sync now".
  When a sync is due (every 15 minutes by default) or was asked for:
    - Per company: every ledger with its balance, then the vouchers created or changed since the last
      sync (Tally's AlterID tells which). The first sync goes month by month.
  Once a day: the list of every voucher and ledger still in Tally, so ones deleted there are flagged
  (never deleted) in MCI Finance.
  Each voucher line carries its cost centres (MCI's projects), and each ledger its chain of groups,
  for the Group P&L. After an update that reads more per voucher, the next sync re-reads every
  voucher once (dataVersion in state.json).

  It only sends simple Export requests to Tally, each with a time limit. It never imports, alters or
  deletes anything in Tally. Plain Windows PowerShell 5.1: nothing to install.

.PARAMETER ConfigPath
  The JSON settings file (default: config.json next to this script). See config.example.json.

.PARAMETER Test
  Check Tally and MCI Finance, list the open companies, and send no data (a check-in is still sent).

.PARAMETER Full
  Sync now, send every voucher again (not only changes), and run the daily deleted-records check.
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json'),
  [switch]$Test,
  [switch]$Full
)

$ErrorActionPreference = 'Stop'
$ConnectorVersion = '1.2.2'
# Bumped when vouchers carry more than before: the next sync then re-reads every voucher once.
$DataVersion = 2
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
# 127.0.0.1 rather than "localhost": avoids a slow IPv6 attempt first
$TallyUrl = ($Config.tallyUrl.TrimEnd('/')) -replace '//localhost', '//127.0.0.1'
$TallyPort = ([uri]$TallyUrl).Port
$FromDate = if ($Config.fromDate) { [datetime]::ParseExact($Config.fromDate, 'yyyy-MM-dd', $Invariant) } else { [datetime]'2020-01-01' }
$BatchSize = if ($Config.batchSize) { [int]$Config.batchSize } else { 500 }
$PresenceHour = if ($null -ne $Config.dailyCheckHour) { [int]$Config.dailyCheckHour } else { 2 }
$SyncMinutes = if ($Config.syncMinutes) { [int]$Config.syncMinutes } else { 15 }
$CheckMinutes = if ($Config.checkMinutes) { [int]$Config.checkMinutes } else { 2 }
# Which Tally the connector should read. Another one on the port (e.g. Tally.ERP 9) is reported, not read.
$ExpectProduct = if ($Config.expectProduct) { [string]$Config.expectProduct } else { 'TallyPrime' }

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

function Invoke-Tally([string]$Body, [int]$TimeoutSec = 300) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($Body)
  $r = Invoke-WebRequest -Uri $TallyUrl -Method Post -Body $bytes -ContentType 'text/xml;charset=utf-8' -UseBasicParsing -TimeoutSec $TimeoutSec
  $raw = $r.RawContentStream.ToArray()
  $text = if ($raw.Length -ge 2 -and $raw[0] -eq 0xFF -and $raw[1] -eq 0xFE) { [Text.Encoding]::Unicode.GetString($raw) } else { [Text.Encoding]::UTF8.GetString($raw) }
  # Tally puts control characters (e.g. &#4;) in names; XML parsers refuse them.
  $text = $text -replace '&#(?:[0-8]|1[124-9]|2[0-9]|3[01]);', '' -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', ''
  # Custom (TDL) fields come as <UDF:NAME> with an undeclared prefix; rename them so the XML reads.
  $text = $text -replace '<(/?)([A-Za-z_][\w.-]*):', '<$1$2_'
  try { $xml = [xml]$text }
  catch { throw "Tally sent XML that could not be read ($($_.Exception.InnerException.Message))" }
  $err = $xml.SelectSingleNode('//LINEERROR')
  if ($err) { throw "Tally: $($err.InnerText)" }
  return $xml
}

# When only one company is open, requests leave the company out (Tally uses the open one): naming it
# makes some Tally setups try to switch to it and wait on a prompt. Dates are sent only for vouchers.
$script:OnlyOneCompany = $false

function Get-TallyCollection([string]$Company, [string]$Type, [string]$Fetch, [string]$Extra = '', [datetime]$From = $FromDate, [datetime]$To = (Get-Date).AddYears(1), [int]$TimeoutSec = 300, [switch]$Dated, [string]$Formula = '') {
  $companyVar = if ($Company -and -not $script:OnlyOneCompany) { "<SVCURRENTCOMPANY>$(ConvertTo-XmlText $Company)</SVCURRENTCOMPANY>" } else { '' }
  # Tally ignores dates sent as 20261101 and returns its whole current period; '1-Nov-2026' is respected.
  $dates = if ($Dated) { "<SVFROMDATE TYPE=`"Date`">$($From.ToString('d-MMM-yyyy', $Invariant))</SVFROMDATE><SVTODATE TYPE=`"Date`">$($To.ToString('d-MMM-yyyy', $Invariant))</SVTODATE>" } else { '' }
  $body = @"
<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>MCIFinance$Type</ID></HEADER>
<BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>`$`$SysName:XML</SVEXPORTFORMAT>$companyVar
$dates</STATICVARIABLES>
<TDL><TDLMESSAGE><COLLECTION NAME="MCIFinance$Type" ISMODIFY="No"><TYPE>$Type</TYPE><FETCH>$Fetch</FETCH>$Extra</COLLECTION>$Formula
</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>
"@
  $xml = Invoke-Tally $body $TimeoutSec
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

# Which Windows user's session the program holding Tally's port runs in (no admin rights needed).
function Get-PortOwnerUser {
  try {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $TallyPort -ErrorAction Stop | Select-Object -First 1
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)"
    $sessionId = [string]$proc.SessionId
    foreach ($line in (quser 2>$null | Select-Object -Skip 1)) {
      $parts = ($line.Trim().TrimStart('>') -split '\s+')
      $idIndex = [array]::IndexOf($parts, $sessionId)
      if ($idIndex -ge 1) { return $parts[0] }
    }
  } catch { }
  return ''
}

<#
  What is on Tally's port. Tally answers a plain GET with "<RESPONSE>TallyPrime Server is Running</RESPONSE>"
  (or "Tally.ERP 9 Server is Running"). Returns @{ state = running|not_running|not_responding; product; user }.
#>
function Get-TallyProbe {
  $probe = @{ state = 'not_running'; product = ''; user = ''; port = $TallyPort }
  try {
    $r = Invoke-WebRequest -Uri $TallyUrl -UseBasicParsing -TimeoutSec 15
    $probe.state = 'running'
    if ($r.Content -match '<RESPONSE>\s*(.+?)\s+Server is Running') { $probe.product = $Matches[1] } else { $probe.product = 'Tally' }
  } catch {
    $msg = $_.Exception.Message
    if ($msg -match 'timed out|timeout') { $probe.state = 'not_responding' }
    elseif ($msg -match 'refused|Unable to connect|actively refused') { $probe.state = 'not_running' }
    else { $probe.state = 'not_responding' }
  }
  if ($probe.state -ne 'not_running') { $probe.user = Get-PortOwnerUser }
  return $probe
}

function Get-OpenCompanies {
  if ($Config.companies -and @($Config.companies).Count -gt 0) { return @($Config.companies) }
  return @(Get-TallyCollection -Company '' -Type 'Company' -Fetch 'Name' -TimeoutSec 30 | ForEach-Object { $_.GetAttribute('NAME') } | Where-Object { $_ })
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

# Tells MCI Finance what is going on. Never fails the run; returns whether "Sync now" was pressed.
function Send-Heartbeat([string]$Status, [string]$Message, $Probe, [string[]]$Companies = @(), [switch]$StartingRequestedSync, [switch]$Synced) {
  $body = @{
    source = $Config.source; status = $Status; message = $Message; companies = @($Companies)
    tally = @{ product = $Probe.product; user = $Probe.user; port = $Probe.port }
    host = $env:COMPUTERNAME; connectorVersion = $ConnectorVersion; checkMinutes = $CheckMinutes; syncMinutes = $SyncMinutes
  }
  if ($StartingRequestedSync) { $body.startingRequestedSync = $true }
  if ($Synced) { $body.synced = $true }
  try {
    $r = Invoke-Api 'Post' '/heartbeat' $body
    # "Automatic sync" switched off on the dashboard: read nothing from Tally until it's back on.
    $script:Paused = [bool]$r.paused
    return [bool]$r.syncRequested
  }
  catch { Write-Log "Could not reach MCI Finance: $($_.Exception.Message)" 'WARN'; return $false }
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
  foreach ($vt in Get-TallyCollection -Company $Company -Type 'VoucherType' -Fetch 'Name,Parent' -TimeoutSec 120) {
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

# Each group's chain up to its primary group, by Tally's names: @('Rent', 'Office Costs', 'Indirect Expenses'),
# and its primary group by Tally's built-in name (RESERVEDNAME), so a group MCI renamed, e.g.
# "Trade Receivables" for Sundry Debtors, still counts as Sundry Debtors in the reports.
function Get-GroupChains([string]$Company) {
  $parents = @{}
  $reserved = @{}
  foreach ($g in Get-TallyCollection -Company $Company -Type 'Group' -Fetch 'Name,Parent,ReservedName' -TimeoutSec 120) {
    $name = $g.GetAttribute('NAME')
    $p = (Get-Text $g 'PARENT').Trim()
    if ($p -eq 'Primary') { $p = '' }
    $parents[$name] = $p
    $r = $g.GetAttribute('RESERVEDNAME')
    if (-not $r) { $r = Get-Text $g 'RESERVEDNAME' }
    if ($r) { $reserved[$name] = $r.Trim() }
  }
  $chains = @{}
  $primary = @{}
  foreach ($name in $parents.Keys) {
    $chain = New-Object System.Collections.ArrayList
    $cur = $name
    [void]$chain.Add($cur)
    for ($d = 0; $d -lt 20; $d++) {
      $p = $parents[$cur]
      if (-not $p -or $p -eq $cur -or -not $parents.ContainsKey($p)) { break }
      $cur = $p
      [void]$chain.Add($cur)
    }
    $chains[$name] = @($chain)
    $primary[$name] = if ($reserved.ContainsKey($cur)) { $reserved[$cur] } else { $cur }
  }
  return @{ chains = $chains; primary = $primary }
}

function Get-Ledgers([string]$Company) {
  $tree = Get-GroupChains $Company
  $chains = $tree.chains
  $primary = $tree.primary
  $nodes = Get-TallyCollection -Company $Company -Type 'Ledger' -Fetch 'Name,Parent,GUID,AlterID,OpeningBalance,ClosingBalance' -TimeoutSec 300
  return @($nodes | ForEach-Object {
      $parent = Get-Text $_ 'PARENT'
      [ordered]@{
        guid    = Get-Text $_ 'GUID'
        name    = $_.GetAttribute('NAME')
        alterId = [long](ConvertTo-Amount (Get-Text $_ 'ALTERID'))
        parent  = $parent
        group   = if ($primary.ContainsKey($parent)) { $primary[$parent] } else { $parent }
        groups  = if ($chains.ContainsKey($parent)) { @($chains[$parent]) } elseif ($parent) { @($parent) } else { @() }
        opening = ConvertTo-Amount (Get-Text $_ 'OPENINGBALANCE')
        closing = ConvertTo-Amount (Get-Text $_ 'CLOSINGBALANCE')
      }
    } | Where-Object { $_.guid -and $_.name })
}

$VoucherFetch = 'GUID,AlterID,Date,VoucherTypeName,VoucherNumber,Reference,PartyLedgerName,Narration,IsCancelled,IsOptional,' +
'AllLedgerEntries.LedgerName,AllLedgerEntries.Amount,AllInventoryEntries.AccountingAllocations.LedgerName,AllInventoryEntries.AccountingAllocations.Amount,' +
'AllLedgerEntries.CategoryAllocations.CostCentreAllocations.Name,AllLedgerEntries.CategoryAllocations.CostCentreAllocations.Amount,' +
'AllInventoryEntries.AccountingAllocations.CategoryAllocations.CostCentreAllocations.Name,AllInventoryEntries.AccountingAllocations.CategoryAllocations.CostCentreAllocations.Amount'

# One voucher line, with its cost centres (MCI's projects) if it has any.
function Convert-Entry($e, [hashtable]$Groups) {
  $name = Get-Text $e 'LEDGERNAME'
  if (-not $name) { return $null }
  $centres = New-Object System.Collections.ArrayList
  foreach ($c in $e.SelectNodes('CATEGORYALLOCATIONS.LIST/COSTCENTREALLOCATIONS.LIST')) {
    $cc = Get-Text $c 'NAME'
    if ($cc) { [void]$centres.Add([ordered]@{ name = $cc; amount = ConvertTo-Amount (Get-Text $c 'AMOUNT') }) }
  }
  $row = [ordered]@{ ledger = $name; group = [string]$Groups[$name]; amount = ConvertTo-Amount (Get-Text $e 'AMOUNT') }
  if ($centres.Count -gt 0) { $row.costCentres = @($centres) }
  return $row
}

function Convert-Voucher($v, [hashtable]$Groups, [hashtable]$Bases) {
  $entries = New-Object System.Collections.ArrayList
  foreach ($e in $v.SelectNodes('ALLLEDGERENTRIES.LIST')) {
    $row = Convert-Entry $e $Groups
    if ($row) { [void]$entries.Add($row) }
  }
  # Item invoices keep the sales/purchase ledger under the inventory lines. Add those only if the
  # ledger lines alone don't balance, so nothing is counted twice.
  $sum = 0.0; foreach ($e in $entries) { $sum += $e.amount }
  if ([Math]::Abs($sum) -gt 0.01) {
    foreach ($e in $v.SelectNodes('ALLINVENTORYENTRIES.LIST/ACCOUNTINGALLOCATIONS.LIST')) {
      $row = Convert-Entry $e $Groups
      if ($row) { [void]$entries.Add($row) }
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

function Sync-Company([string]$Company, [bool]$RunPresenceCheck, [bool]$Refetch) {
  $started = Get-Date
  $target = @{ source = $Config.source; company = $Company }
  $bases = Get-VoucherTypeBases $Company

  $ledgers = @(Get-Ledgers $Company)
  $groups = @{}; foreach ($l in $ledgers) { $groups[$l.name] = $l.group }
  Send-InBatches '/ledgers' $target 'ledgers' $ledgers
  Write-Log "$Company : $($ledgers.Count) ledgers sent"

  $state = Invoke-Api 'Get' ("/state?source={0}&company={1}" -f [uri]::EscapeDataString($Config.source), [uri]::EscapeDataString($Company))
  $since = if ($Full -or $Refetch) { 0 } else { [long]$state.maxVoucherAlterId }
  # The filter's formula is its own definition next to the collection, not inside it.
  $filter = '<FILTERS>MCIChanged</FILTERS>'
  $formula = "<SYSTEM TYPE=`"Formulae`" NAME=`"MCIChanged`">`$AlterID &gt; $since</SYSTEM>"

  $sent = 0
  # First sync: month by month. After that only changes, in one request.
  if ($since -eq 0) { $windows = Get-MonthWindows } else { $windows = @(, @($FromDate, (Get-Date).AddYears(1))) }
  $k = 0
  foreach ($w in $windows) {
    $k++
    $nodes = @(Get-TallyCollection -Company $Company -Type 'Voucher' -Fetch $VoucherFetch -Extra $filter -Formula $formula -From $w[0] -To $w[1] -Dated)
    if ($nodes.Count -eq 0) { continue }
    $rows = @($nodes | ForEach-Object { Convert-Voucher $_ $groups $bases } | Where-Object { $_.guid -and $_.date })
    Send-InBatches '/vouchers' $target 'vouchers' $rows
    $sent += $rows.Count
    # Progress for the dashboard, so a long first sync isn't mistaken for a stopped connector
    if ($windows.Count -gt 1) {
      [void](Send-Heartbeat 'syncing' ("Syncing {0}: {1:MMMM yyyy} done ({2} of {3} months), {4:N0} vouchers so far." -f $Company, $w[0], $k, $windows.Count, $sent) $script:Probe @($Company))
      if ($script:Paused) { throw 'Automatic sync was switched off on the dashboard; stopped part-way. It carries on when switched back on.' }
    }
  }
  Write-Log "$Company : $sent new or changed vouchers sent (after AlterID $since)"

  if ($RunPresenceCheck) {
    $guids = New-Object System.Collections.ArrayList
    foreach ($w in Get-MonthWindows) {
      foreach ($n in Get-TallyCollection -Company $Company -Type 'Voucher' -Fetch 'GUID' -From $w[0] -To $w[1] -Dated) {
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

# One run at a time (a long sync must not overlap the next check-in)
$mutex = New-Object System.Threading.Mutex($false, 'Global\MCIFinanceTallyConnector')
if (-not $mutex.WaitOne(0)) { Write-Log 'A sync is still running; skipping this check-in.'; exit 0 }

try {
  $state = @{ lastPresenceCheck = ''; lastSyncAt = ''; dataVersion = 0 }
  if (Test-Path $StateFile) {
    try {
      $saved = Get-Content $StateFile -Raw | ConvertFrom-Json
      $state.lastPresenceCheck = [string]$saved.lastPresenceCheck; $state.lastSyncAt = [string]$saved.lastSyncAt
      if ($saved.dataVersion) { $state.dataVersion = [int]$saved.dataVersion }
    } catch { }
  }
  # Vouchers sent by an older connector lack what this one reads (cost centres): re-read them all once.
  $refetch = $state.dataVersion -lt $DataVersion
  function Save-State { $state | ConvertTo-Json | Set-Content $StateFile -Encoding UTF8 }

  # 1. What is on Tally's port?
  $probe = Get-TallyProbe
  $script:Probe = $probe
  if ($probe.state -eq 'not_running') {
    [void](Send-Heartbeat 'tally_not_running' "Nothing is answering on port $TallyPort. Data syncs once someone opens $ExpectProduct with the company." $probe)
    Write-Log "Tally is not running (nothing on port $TallyPort)." 'WARN'; exit 0
  }
  if ($probe.state -eq 'not_responding') {
    [void](Send-Heartbeat 'tally_not_responding' 'Tally is open but not answering. Usually a message box or an open entry screen in Tally is waiting: close it and go back to Gateway of Tally.' $probe)
    Write-Log "Tally is open (session of '$($probe.user)') but not answering." 'WARN'; exit 0
  }
  $who = if ($probe.user) { " (opened by $($probe.user))" } else { '' }
  if ($ExpectProduct -and $probe.product -and $probe.product -notlike "*$ExpectProduct*") {
    [void](Send-Heartbeat 'wrong_tally' "$($probe.product)$who is using port $TallyPort, not $ExpectProduct. Close it, then reopen $ExpectProduct." $probe)
    Write-Log "$($probe.product)$who holds port $TallyPort, not $ExpectProduct; not reading it." 'WARN'; exit 0
  }

  # 2. Which companies are open?
  try { $companies = @(Get-OpenCompanies) }
  catch {
    [void](Send-Heartbeat 'tally_not_responding' "Tally did not list its companies: $($_.Exception.Message)" $probe)
    Write-Log "Tally did not list its companies: $($_.Exception.Message)" 'WARN'; exit 0
  }
  $script:OnlyOneCompany = ($companies.Count -eq 1)
  if ($companies.Count -eq 0) {
    [void](Send-Heartbeat 'no_company' "$($probe.product)$who is open, but no company is loaded in it." $probe)
    Write-Log "$($probe.product)$who is open, but no company is loaded." 'WARN'; exit 0
  }

  # 3. Is a sync due?
  $last = [datetime]::MinValue
  if ($state.lastSyncAt) { try { $last = [datetime]::Parse($state.lastSyncAt, $Invariant) } catch { } }
  $due = $Full -or $refetch -or ((Get-Date) - $last).TotalMinutes -ge ($SyncMinutes - 0.5)
  $requested = Send-Heartbeat 'idle' "$($probe.product)$who is open with $($companies -join ', ')." $probe $companies

  if ($Test) {
    Write-Log "Test: $($probe.product)$who on port $TallyPort; open: $($companies -join ', ')"
    foreach ($c in $companies) { Write-Log "Tally company '$c': $(@(Get-Ledgers $c).Count) ledgers readable" }
    Write-Log 'MCI Finance accepted the check-in. No data was sent.'
    exit 0
  }
  if ($script:Paused) {
    [void](Send-Heartbeat 'paused' "Automatic sync is switched off on the dashboard. $($probe.product)$who is open with $($companies -join ', '); nothing is read from it." $probe $companies)
    Write-Log 'Automatic sync is switched off on the dashboard; not reading Tally.'
    exit 0
  }
  if (-not $due -and -not $requested) { exit 0 }

  # 4. Sync
  $today = (Get-Date).ToString('yyyy-MM-dd')
  $presence = $Full -or ($state.lastPresenceCheck -ne $today -and (Get-Date).Hour -ge $PresenceHour)
  $why = if ($requested) { 'requested from the dashboard' } elseif ($Full) { 'full sync' } elseif ($refetch) { 'connector updated: reading every voucher again once' } else { "every $SyncMinutes minutes" }
  Write-Log "Sync starting ($why): $($companies -join ', ')"
  [void](Send-Heartbeat 'syncing' "Syncing $($companies -join ', ') ($why)." $probe $companies -StartingRequestedSync:$requested)

  $failed = @()
  foreach ($c in $companies) {
    try { Sync-Company $c $presence $refetch }
    catch {
      $failed += $c
      $msg = $_.Exception.Message
      Write-Log "$c : FAILED - $msg" 'ERROR'
      try { [void](Invoke-Api 'Post' '/sync-log' @{ source = $Config.source; company = $c; ok = $false; error = $msg; connectorVersion = $ConnectorVersion; host = $env:COMPUTERNAME }) } catch { }
    }
  }
  if ($failed.Count -eq 0) {
    $state.lastSyncAt = (Get-Date).ToString('o')
    $state.dataVersion = $DataVersion
    if ($presence) { $state.lastPresenceCheck = $today }
    Save-State
    [void](Send-Heartbeat 'synced' "Synced $($companies -join ', ')." $probe $companies -Synced)
  } elseif ($script:Paused) {
    [void](Send-Heartbeat 'paused' 'Automatic sync was switched off during a sync; it stopped part-way and carries on when switched back on.' $probe $companies)
  } else {
    [void](Send-Heartbeat 'error' "Sync failed for $($failed -join ', '). See the connector log on the Tally server." $probe $companies)
    exit 1
  }
}
finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
