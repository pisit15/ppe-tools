# Posts the daily Odoo sync payload (built by build_tools_payload.cjs) to tools.eashe.org/procurement.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File push_tools.ps1 -Ticket <single-use import ticket>
#        powershell -NoProfile -ExecutionPolicy Bypass -File push_tools.ps1 -DryRun   (check the files, send nothing)
#   The ticket is created by the scheduled sync just before this runs (valid 30 minutes, spent by the last request).
#   Only files listed in manifest.json with a matching SHA-256 are sent, so leftovers from older runs are ignored.
#   If the site refuses because the new data would remove more than 10% of a table (HTTP 409), nothing is deleted:
#   an admin checks the files and imports them on the import page (/procurement/import) instead.
#   Every output line is also written to <Dir>\push_result.txt (overwritten each run), so a caller that stops
#   waiting can still read the outcome: the last line starts with OK, DRYRUN or ERROR.
param(
  [string]$Ticket = '',
  [switch]$DryRun,
  [string]$Dir = 'D:\Odoo PR\_scripts\tools_push',
  [string]$Url = 'https://tools.eashe.org/api/procurement/import'
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$resultFile = Join-Path $Dir 'push_result.txt'

function Say([string]$line) {
  Write-Output $line
  try { Add-Content -LiteralPath $resultFile -Value $line -Encoding UTF8 } catch { }
}
function Fail([string]$msg, [int]$code = 1) { Say "ERROR $msg"; exit $code }

try { Set-Content -LiteralPath $resultFile -Value ("started {0:yyyy-MM-dd HH:mm:ss}" -f (Get-Date)) -Encoding UTF8 } catch { }

if (-not $DryRun -and $Ticket -notmatch '^[A-Za-z0-9_-]{40,128}$') { Fail 'ticket format is invalid' 2 }
$manifestPath = Join-Path $Dir 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { Fail "no manifest.json in $Dir" 2 }
$manifest = [IO.File]::ReadAllText($manifestPath, [Text.Encoding]::UTF8) | ConvertFrom-Json

function Checked([string]$name, [string]$sha) {
  $p = Join-Path $Dir $name
  if (-not (Test-Path -LiteralPath $p)) { Fail "missing $name" 2 }
  $h = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower()
  if ($h -ne $sha) { Fail "$name does not match manifest (stale or partial copy)" 2 }
  return $p
}

function Post([string]$path) {
  $bytes = [IO.File]::ReadAllBytes($path)
  try {
    return Invoke-RestMethod -Uri $Url -Method Post -Headers @{ 'x-import-ticket' = $Ticket } `
      -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 180 -UseBasicParsing
  } catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    $detail = $_.ErrorDetails.Message
    if (-not $detail) { $detail = $_.Exception.Message }
    Fail ("{0}: HTTP {1} {2}" -f [IO.Path]::GetFileName($path), $status, $detail) $(if ($status -eq 409) { 3 } else { 1 })
  }
}

# Verify every file first, then send: upserts (parents before children), then finalize.
$files = @($manifest.files | ForEach-Object { Checked $_.name $_.sha256 })
$fin = Checked $manifest.finalize.name $manifest.finalize.sha256
if ($DryRun) {
  Say ("DRYRUN ok files={0} created={1} counts={2}" -f ($files.Count + 1), $manifest.created_at, ($manifest.counts | ConvertTo-Json -Compress))
  exit 0
}
$upserted = 0
$i = 0
foreach ($f in $files) {
  $i++
  $r = Post $f
  $upserted += [int]$r.upserted
  Say ("sent {0}/{1} {2} rows={3}" -f $i, $files.Count, [IO.Path]::GetFileName($f), $r.upserted)
}
$r = Post $fin
Say ("OK upserted={0} counts={1} deleted={2}" -f $upserted, ($r.counts | ConvertTo-Json -Compress), ($r.deleted | ConvertTo-Json -Compress))
