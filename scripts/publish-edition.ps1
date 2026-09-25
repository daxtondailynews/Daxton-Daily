# Publishes one edition (a JSON object) or several (a JSON array) to the
# Supabase "editions" table via the publish_edition() function in
# supabase/membership.sql. Editions no longer live in the public repo,
# so paid content can't be read by viewing the site's files.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\publish-edition.ps1 -Path <edition.json>
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\publish-edition.ps1 -FromEditionsJs content\editions.js
#
# The publish secret is read from $env:DAXTON_PUBLISH_SECRET, or else from
# a .publish-secret file in the repo root (gitignored — never commit it).

param(
  [string]$Path,
  [string]$FromEditionsJs
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$secret = $env:DAXTON_PUBLISH_SECRET
if (-not $secret) {
  $secretFile = Join-Path $root ".publish-secret"
  if (-not (Test-Path $secretFile)) { throw "No publish secret: set DAXTON_PUBLISH_SECRET or create $secretFile" }
  $secret = (Get-Content $secretFile -Raw).Trim()
}

$config = Get-Content (Join-Path $root "js\supabase-config.js") -Raw
$url = [regex]::Match($config, 'SUPABASE_URL\s*=\s*"([^"]+)"').Groups[1].Value
$key = [regex]::Match($config, 'SUPABASE_ANON_KEY\s*=\s*"([^"]+)"').Groups[1].Value
if (-not $url -or -not $key) { throw "Couldn't read the Supabase URL/key from js\supabase-config.js" }

if ($FromEditionsJs) {
  # One-time migration: pull the array literal out of the old
  # window.EDITIONS = [...]; file.
  $raw = Get-Content $FromEditionsJs -Raw -Encoding UTF8
  $start = $raw.IndexOf("[", $raw.IndexOf("window.EDITIONS"))
  $end = $raw.LastIndexOf("]")
  $json = $raw.Substring($start, $end - $start + 1)
} elseif ($Path) {
  $json = Get-Content $Path -Raw -Encoding UTF8
} else {
  throw "Pass -Path <edition.json> or -FromEditionsJs <content\editions.js>"
}

# Validate it parses, but send the original text — round-tripping through
# ConvertTo-Json in Windows PowerShell can mangle nested arrays.
$parsed = $json | ConvertFrom-Json
$dates = @($parsed | ForEach-Object { $_.date }) -join ", "

$secretJson = ConvertTo-Json $secret
$body = '{"secret":' + $secretJson + ',"edition":' + $json + '}'

$headers = @{ apikey = $key }
if (-not $key.StartsWith("sb_")) { $headers["Authorization"] = "Bearer $key" }

$count = Invoke-RestMethod -Method Post -Uri "$url/rest/v1/rpc/publish_edition" `
  -Headers $headers -ContentType "application/json; charset=utf-8" `
  -Body ([Text.Encoding]::UTF8.GetBytes($body))

Write-Output "Published $count edition(s): $dates"
