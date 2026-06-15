param(
  [string]$AppUrl = "http://localhost:3000",
  [switch]$Kiosk
)

# Operator helper:
# - Opens Phobo in Edge or Chrome.
# - Edge is preferred if Chrome is not found.
# - Use -Kiosk for stricter kiosk flags; otherwise app/fullscreen style is used.

$chromeCandidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

$edgeCandidates = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

$chromePath = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$edgePath = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chromePath) {
  if ($Kiosk) {
    Start-Process -FilePath $chromePath -ArgumentList "--kiosk", $AppUrl
  } else {
    Start-Process -FilePath $chromePath -ArgumentList "--app=$AppUrl", "--start-fullscreen"
  }
  exit 0
}

if ($edgePath) {
  if ($Kiosk) {
    Start-Process -FilePath $edgePath -ArgumentList "--kiosk", $AppUrl, "--edge-kiosk-type=fullscreen"
  } else {
    Start-Process -FilePath $edgePath -ArgumentList "--app=$AppUrl", "--start-fullscreen"
  }
  exit 0
}

Write-Host "No supported browser found."
Write-Host "Install Chrome or Edge, then open this URL manually:"
Write-Host $AppUrl
Write-Host "Manual fullscreen fallback: press F11 after opening the page."
exit 1
