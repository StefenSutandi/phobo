param(
  [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [switch]$Dev,
  [switch]$OpenBrowser,
  [string]$AppUrl = "http://localhost:3000"
)

# Operator helper:
# - Run from any directory.
# - Defaults to production-like `npm run start`.
# - Use -Dev for `npm run dev`.
# - Use -OpenBrowser to launch the kiosk browser after starting the server.

Set-Location -Path $RepoPath

if ($Dev) {
  Write-Host "Starting Phobo in development mode..."
  if ($OpenBrowser) {
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "open-kiosk.ps1"), "-AppUrl", $AppUrl
  }
  npm run dev
} else {
  Write-Host "Starting Phobo in production-like local mode..."
  Write-Host "If this fails, run: npm run build"
  if ($OpenBrowser) {
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "open-kiosk.ps1"), "-AppUrl", $AppUrl
  }
  npm run start
}
