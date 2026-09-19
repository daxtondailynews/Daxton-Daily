Set-Location $PSScriptRoot

git add content/editions.js

$staged = git diff --cached --name-only
if ([string]::IsNullOrWhiteSpace($staged)) {
    exit 0
}

$date = Get-Date -Format "yyyy-MM-dd"
git commit -m "Automated daily content update - $date"
git push origin main
