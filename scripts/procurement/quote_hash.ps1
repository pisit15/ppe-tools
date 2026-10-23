# SHA-256 of attachments listed in a JSON array of paths relative to D:\Odoo PR (read-only; nothing is moved or deleted).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File quote_hash.ps1 -List <list.json> -Out <result.json>
# Result: [{"p": path, "s": size or -1 when missing, "h": sha256 lowercase or ""}]
param(
  [Parameter(Mandatory = $true)][string]$List,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Root = 'D:\Odoo PR'
)
$ErrorActionPreference = 'Stop'
$paths = [IO.File]::ReadAllText($List, [Text.Encoding]::UTF8) | ConvertFrom-Json
$rows = foreach ($rel in $paths) {
  $p = Join-Path $Root $rel
  if (Test-Path -LiteralPath $p) {
    [pscustomobject]@{ p = $rel; s = (Get-Item -LiteralPath $p).Length; h = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower() }
  } else {
    [pscustomobject]@{ p = $rel; s = -1; h = '' }
  }
}
[IO.File]::WriteAllText($Out, (ConvertTo-Json @($rows) -Depth 3 -Compress), [Text.UTF8Encoding]::new($false))
"hashed $(@($rows).Count)"
