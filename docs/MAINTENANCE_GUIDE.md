# Maintenance Guide

This guide is for technical maintenance on the Windows Mini PC.

## Result Files

Generated result files are stored at:

```text
public/results/{sessionId}
```

Common files:

- `final_screen.png`
- `final_print.jpg`
- `captures/*.jpg`

`public/results/*` is ignored by Git except `public/results/.gitkeep`.

## Clear Old Results Safely

Close the kiosk browser first if operators are using the app.

PowerShell example:

```powershell
Get-ChildItem .\public\results -Directory | Remove-Item -Recurse -Force
```

Keep `.gitkeep`:

```powershell
Test-Path .\public\results\.gitkeep
```

Do not delete files while an active session is being printed or downloaded.

## Check Environment

Local configuration is in:

```text
.env.local
```

Do not commit `.env.local`.

Safe default modes:

```env
PHOBO_CAMERA_MODE=mock
PHOBO_PRINTER_MODE=mock
PHOBO_STORAGE_MODE=local
PHOBO_DRIVE_ENABLED=false
```

## Switch Camera Modes

Mock camera:

```env
PHOBO_CAMERA_MODE=mock
```

Validated Canon command mode (digiCamControl):

```env
PHOBO_CAMERA_MODE=command
PHOBO_CAMERA_CAPTURE_DIR=C:\PhoboCameraCaptures
PHOBO_CAMERA_COMMAND_PATH=C:\Program Files (x86)\digiCamControl\CameraControlCmd.exe
PHOBO_CAMERA_COMMAND_ARGS_TEMPLATE=/filename "{output}" /capture
```

### Camera Troubleshooting

- **If command mode says command path missing**: Verify the path exists in PowerShell:
  `Test-Path "C:\Program Files (x86)\digiCamControl\CameraControlCmd.exe"`
- **If camera does not trigger**: Close EOS Utility 2 and any other camera apps that might be locking the connection.
- **If capture times out**: Check USB cable connection, camera power/dummy battery, camera auto-sleep settings, and digiCamControl hardware detection.
- **If test.jpg is not created**: Test the raw PowerShell command first outside of Phobo.
- **If command capture works manually but not in Phobo**: Check `.env.local` for typos and restart the Next.js server.
- **Fallback**: If command mode remains unreliable, switch back to mock mode or use `eos-watch` mode with EOS Utility 2 folder-watching.

## Switch Printer Modes

Mock printer:

```env
PHOBO_PRINTER_MODE=mock
```

Future Windows printer mode:

```env
PHOBO_PRINTER_MODE=windows
PHOBO_PRINTER_NAME=SELPHY CP1500
```

If Windows printing opens dialogs, fails silently, or prints the wrong size, switch back to mock mode and print manually from `final_print.jpg`.

## Diagnostics

Open:

```text
http://localhost:3000/api/diagnostics
http://localhost:3000/hardware-check
```

Check:

- camera mode
- printer mode
- result directory
- camera command configured
- printer configured
- print target size
- browser origin

## Update Repository

Run from the Phobo repository:

```powershell
git pull
npm install
npm run build
```

Restart the app after a successful build.

## Git Safety

Do not commit:

- `.env.local`
- `public/results/*`
- local screenshots
- generated test photos

Before committing, check:

```powershell
git status
```
