# Posts the daily Odoo sync payload (built by build_tools_payload.cjs) to tools.eashe.org/procurement.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File push_tools.ps1 -Ticket <single-use import ticket>
#        powershell -NoProfile -ExecutionPolicy Bypass -File push_tools.ps1 -DryRun   (check the files, send nothing)
#   The ticket is created by the scheduled sync just before this runs (valid 30 minutes, spent by the last request).
#   Only files listed in manifest.json with a matching SHA-256 are sent, so leftovers from older runs are ignored.
#   If the site refuses because the new data would remove more than 10% of a table (HTTP 409), nothing is deleted:
#   an admin checks the files and imports them on the import page (/procurement/import) instead.
param(
  [string]$Ticket = '',
  [switch]$DryRun,
  [string]$Dir = 'D:\Odoo PR\_scripts\tools_push',
  [string]$Url = 'https://tools.eashe.org/api/procurement/import'
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Fail([string]$msg, [int]$code = 1) { Write-Output "ERROR $msg"; exit $code }

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
  Write-Output ("DRYRUN ok files={0} created={1} counts={2}" -f ($files.Count + 1), $manifest.created_at, ($manifest.counts | ConvertTo-Json -Compress))
  exit 0
}
$upserted = 0
$i = 0
foreach ($f in $files) {
  $i++
  $r = Post $f
  $upserted += [int]$r.upserted
  Write-Output ("sent {0}/{1} {2} rows={3}" -f $i, $files.Count, [IO.Path]::GetFileName($f), $r.upserted)
}
$r = Post $fin
Write-Output ("OK upserted={0} counts={1} deleted={2}" -f $upserted, ($r.counts | ConvertTo-Json -Compress), ($r.deleted | ConvertTo-Json -Compress))
