# Windows Kiosk Deployment

This guide prepares Phobo for local operation on the Windows Mini PC. Hardware adapter modes stay disabled unless explicitly configured.

## Prerequisites

- Windows Mini PC
- Node.js LTS
- Git
- Chrome or Microsoft Edge
- LAN or internet access
- Android TV connected as the Mini PC display output
- IR touch panel connected as mouse/touch input

## Install

Clone the repository:

```powershell
git clone https://github.com/StefenSutandi/phobo.git
cd phobo
```

Install dependencies:

```powershell
npm install
```

Build:

```powershell
npm run build
```

## Run

Development:

```powershell
npm run dev
```

Production-like local:

```powershell
npm run build
npm run start
```

Open app:

```text
http://localhost:3000
```

Useful routes:

```text
http://localhost:3000/admin
http://localhost:3000/hardware-check
http://localhost:3000/api/diagnostics
```

## .env.local Setup

Create `.env.local` only on the Mini PC. Do not commit it.

Mock mode:

```env
PHOBO_CAMERA_MODE=mock
PHOBO_PRINTER_MODE=mock
PHOBO_STORAGE_MODE=local
PHOBO_DRIVE_ENABLED=false
PHOBO_RESULTS_DIR=public/results
```

Recommended final Canon command mode:

```env
PHOBO_CAMERA_MODE=command
PHOBO_CAMERA_CAPTURE_DIR=C:\PhoboCameraCaptures
PHOBO_CAMERA_CAPTURE_TIMEOUT_MS=20000
PHOBO_CAMERA_COMMAND_PATH=C:\Program Files (x86)\digiCamControl\CameraControlCmd.exe
PHOBO_CAMERA_COMMAND_ARGS_TEMPLATE=/filename "{output}" /capture
```

**Note:** After changing `.env.local`, you must restart the dev or production server for changes to take effect.

Future SELPHY Windows print mode:

```env
PHOBO_PRINTER_MODE=windows
PHOBO_PRINTER_NAME=SELPHY CP1500
PHOBO_PRINT_PAPER=4R
PHOBO_PRINT_WIDTH_PX=1748
PHOBO_PRINT_HEIGHT_PX=1181
```

## Kiosk Browser Launch

The Android TV is only the external display. The IR touch panel acts as mouse/touch input. Make sure the browser opens on the Mini PC display output that is shown on the Android TV.

Chrome app-style launch:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000 --start-fullscreen
```

Chrome kiosk-style launch:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk http://localhost:3000
```

Edge kiosk-style launch:

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk http://localhost:3000 --edge-kiosk-type=fullscreen
```

Manual fallback:

1. Open Chrome or Edge.
2. Go to `http://localhost:3000`.
3. Press `F11` for fullscreen.
4. Confirm touch alignment on the Android TV.

## Helper Scripts

Start Phobo:

```powershell
.\scripts\start-phobo.ps1
```

Open kiosk browser:

```powershell
.\scripts\open-kiosk.ps1
```

If PowerShell blocks local scripts, run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Use this only on the operator account after confirming the Mini PC policy.
