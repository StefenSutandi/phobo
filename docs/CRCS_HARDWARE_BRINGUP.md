# CRCS Hardware Bring-Up Checklist

This document is for the first on-site Phobo hardware test at CRCS ITB. The current app uses mock-safe defaults with env-gated camera and printer adapter foundations. Use this checklist to identify what the Mini PC, Android TV, IR touch panel, Canon 600D, and Canon SELPHY CP1500 can do before real hardware modes are enabled.

## Hardware Inventory

| Item | Expected device | Available | Notes |
| --- | --- | --- | --- |
| Main controller | Mini PC | [ ] |  |
| Display | Android TV | [ ] |  |
| Touch input | Infrared touch screen panel | [ ] |  |
| Camera | Canon 600D | [ ] |  |
| Camera power | Canon 600D dummy battery | [ ] |  |
| Printer | Canon SELPHY CP1500 | [ ] |  |
| Network | WiFi or Ethernet | [ ] |  |
| Cables | HDMI, USB camera, USB touch, power | [ ] |  |

## Current Site Findings

- Android TV and IR touch panel work.
- SELPHY CP1500 can print manually from Windows.
- Mini PC has no Wi-Fi/Bluetooth; LAN is OK for app/network access.
- Canon 600D command capture via digiCamControl is validated.

## Mini PC Checklist

| Check | Result | Notes |
| --- | --- | --- |
| OS version recorded | [ ] Pass / [ ] Fail |  |
| Admin access available | [ ] Pass / [ ] Fail |  |
| Node.js installed | [ ] Pass / [ ] Fail | Run `node -v` |
| npm installed | [ ] Pass / [ ] Fail | Run `npm -v` |
| Git installed | [ ] Pass / [ ] Fail | Run `git --version` |
| Browser installed | [ ] Pass / [ ] Fail | Chrome, Edge, or Chromium |
| USB ports available | [ ] Pass / [ ] Fail | Count free ports after camera/touch/printer |
| Storage available | [ ] Pass / [ ] Fail | Confirm free disk space for local results |
| Internet available | [ ] Pass / [ ] Fail | Required for GitHub/package install/QR phone test |
| Repository cloned | [ ] Pass / [ ] Fail | `git clone https://github.com/StefenSutandi/phobo.git` |
| Dependencies installed | [ ] Pass / [ ] Fail | `npm install` |
| App builds | [ ] Pass / [ ] Fail | `npm run build` |

## Android TV + IR Touch Panel Checklist

| Check | Result | Notes |
| --- | --- | --- |
| HDMI from Mini PC to Android TV works | [ ] Pass / [ ] Fail |  |
| Correct display resolution selected | [ ] Pass / [ ] Fail | Record resolution |
| Overscan disabled or corrected | [ ] Pass / [ ] Fail | Kiosk stage should not be cropped |
| IR touch panel connected via USB | [ ] Pass / [ ] Fail |  |
| Touch acts as mouse/touch input | [ ] Pass / [ ] Fail | Tap should trigger clicks |
| Tap alignment is correct | [ ] Pass / [ ] Fail | Test corners and center |
| Browser fullscreen works | [ ] Pass / [ ] Fail | Use F11 or kiosk launch flag |
| On-screen keyboard behavior acceptable | [ ] Pass / [ ] Fail | Admin/debug only |

## Canon 600D Checklist

Do not connect the Canon 600D to the Phobo app as a real capture source yet. This section is only for OS/software bring-up.

| Check | Result | Notes |
| --- | --- | --- |
| Dummy battery stable | [ ] Pass / [ ] Fail | Camera stays powered under load |
| USB detected by OS | [ ] Pass / [ ] Fail | Record device name |
| Camera storage mode understood | [ ] Pass / [ ] Fail | PTP/MTP/other |
| Remote capture possible | [ ] Yes / [ ] No | Record software/command |
| Live view possible | [ ] Yes / [ ] No | Record software/command |
| Captured file can be saved to Mini PC | [ ] Pass / [ ] Fail | Record save directory |
| Test command/software used |  | Example: EOS Utility, gPhoto2, vendor tool |
| Capture latency notes |  | Time from trigger to file available |
| Failure notes |  | USB dropouts, battery, focus, permissions |

### Browser Live View vs. Canon Capture
- **Live View** is purely browser-based via `navigator.mediaDevices.getUserMedia()`.
- **Final Capture** in standard modes is handled by backend Canon 600D command mode.
- If using Canon/digiCamControl virtual webcam, ensure the virtual webcam appears as a Windows camera device.
- **browser-video mode**: If live view conflicts with Canon command capture (e.g., driver locking the camera), you can set `PHOBO_CAMERA_MODE=browser-video` to use the USB Video feed as the actual camera. This avoids command locking and captures what the browser sees, but quality depends on the USB video resolution, and any Canon display overlays (focus boxes, battery icons) will appear in the final image if visible on HDMI.

## Canon 600D Command-Mode Validation

Canon 600D command capture has been manually validated using digiCamControl (`CameraControlCmd.exe`).

**Important Note:** Ensure EOS Utility 2 and any other camera software are **closed** when testing or using `digiCamControl` command mode to avoid camera lock or conflicts.

Manual PowerShell test used:
```powershell
& "C:\Program Files (x86)\digiCamControl\CameraControlCmd.exe" /filename "C:\PhoboCameraCaptures\test.jpg" /capture
```

Observed output:
```text
digiCamControl command line utility running
New Camera is connected ! Driver :Canon EOS 600D
Canon event 520
Photo transfer begin.
Transfer started :C:\PhoboCameraCaptures\test.jpg
Transfer done :C:\PhoboCameraCaptures\test.jpg
Photo transfer done.
```

Set `.env.local` for automatic capture:

```txt
PHOBO_CAMERA_MODE=command
PHOBO_CAMERA_CAPTURE_DIR=C:\PhoboCameraCaptures
PHOBO_CAMERA_CAPTURE_TIMEOUT_MS=20000
PHOBO_CAMERA_COMMAND_PATH=C:\Program Files (x86)\digiCamControl\CameraControlCmd.exe
PHOBO_CAMERA_COMMAND_ARGS_TEMPLATE=/filename "{output}" /capture
```

Fallback Mode:
If command mode fails or is unreliable, you can fall back to the semi-automatic `eos-watch` mode using EOS Utility 2 folder-watch (`PHOBO_CAMERA_MODE=eos-watch`).

Start app:

```bash
npm run dev
```

Open:

```txt
http://localhost:3000/admin
```

Click:

```txt
Test Camera Capture
```

Expected:

- Captured image is saved under `public/results/{sessionId}/captures/`.
- The image link opens in the browser.
- If command capture fails, switch back to `PHOBO_CAMERA_MODE=mock` until the Canon 600D and capture tool can be validated manually.

## Canon SELPHY CP1500 Checklist

SELPHY CP1500 manual printing from Windows is confirmed. Keep `PHOBO_PRINTER_MODE=mock` until the env-gated Windows print adapter is validated on the Mini PC.

| Check | Result | Notes |
| --- | --- | --- |
| Connection mode selected | [ ] USB / [ ] WiFi |  |
| Printer detected by OS | [ ] Pass / [ ] Fail | Record printer name |
| Driver installed | [ ] Pass / [ ] Fail | Record driver/version |
| Test print from OS works | [ ] Pass / [ ] Fail | Use OS print dialog first |
| Print from local image file works | [ ] Pass / [ ] Fail | Use a saved `public/results/.../final.*` file |
| Paper size/output size confirmed | [ ] Pass / [ ] Fail | Record size/media |
| Print latency notes |  | Time from print command to finished print |
| Failure notes |  | Driver, spooler, media, WiFi, USB, power |

## 4R Print Output Pipeline

- Paper target: 4R / postcard / 4x6.
- App print output: `public/results/{sessionId}/final_print.jpg`.
- Image size: `1748 x 1181 px`.
- Orientation: landscape.
- Template includes safe margins because borderless SELPHY printing may crop edges.
- The app generates `final_print.jpg` before sending anything to the printer adapter.

Default `.env.local` print mode should stay mock:

```txt
PHOBO_PRINTER_MODE=mock
PHOBO_PRINTER_NAME=SELPHY CP1500
PHOBO_PRINT_COMMAND_MODE=powershell-printto
PHOBO_PRINT_PAPER=4R
PHOBO_PRINT_WIDTH_PX=1748
PHOBO_PRINT_HEIGHT_PX=1181
```

Future Windows print adapter validation:

1. Keep manual SELPHY printing working from Windows first.
2. Generate a print file from `/result` or `/admin`.
3. Confirm `public/results/{sessionId}/final_print.jpg` opens in the browser.
4. Set `PHOBO_PRINTER_MODE=windows` only for controlled validation.
5. Use `/admin` -> `Test Print`.
6. If command printing fails or opens OS dialogs, switch back to `PHOBO_PRINTER_MODE=mock` and record the Windows printer behavior.

## Network/Internet Checklist

| Check | Result | Notes |
| --- | --- | --- |
| Mini PC can reach GitHub | [ ] Pass / [ ] Fail |  |
| Mini PC can reach npm registry | [ ] Pass / [ ] Fail |  |
| Phone can reach kiosk URL on LAN | [ ] Pass / [ ] Fail | Needed for QR result test |
| Static local result URL opens from Mini PC | [ ] Pass / [ ] Fail | Example `/results/{sessionId}/final.svg` |
| Static local result URL opens from phone | [ ] Pass / [ ] Fail | Requires LAN-accessible base URL |
| Public base URL decision recorded | [ ] Pass / [ ] Fail | `PHOBO_PUBLIC_BASE_URL` future setting |

## Kiosk Run Checklist

1. Clone or pull the repository.
2. Copy `.env.example` to `.env.local` only if local overrides are needed.
3. Confirm default modes remain mock:
   - `PHOBO_CAMERA_MODE=mock`
   - `PHOBO_PRINTER_MODE=mock`
   - `PHOBO_STORAGE_MODE=local`
   - `PHOBO_DRIVE_ENABLED=false`
4. Install dependencies with `npm install`.
5. Build with `npm run build`.
6. Start with `npm run start` after build, or `npm run dev` during testing.
7. Open `http://localhost:3000`.
8. Open `/hardware-check` and record diagnostics.
9. Run MVP flow:
   - Landing
   - Package selection
   - Dev confirm payment
   - Frame selection
   - Background selection
   - Mock shoot
   - Preview
   - Result QR
   - Mock print
10. Confirm generated result files appear under `public/results/{sessionId}/`.
11. Confirm generated result files are not committed to Git.

## Test Result Table

| Date | Tester | Area | Pass/Fail | Evidence/Notes |
| --- | --- | --- | --- | --- |
|  |  | Mini PC |  |  |
|  |  | Display/touch |  |  |
|  |  | Canon 600D OS detection |  |  |
|  |  | Canon 600D capture test |  |  |
|  |  | SELPHY OS detection |  |  |
|  |  | SELPHY test print |  |  |
|  |  | Kiosk MVP flow |  |  |
|  |  | QR result download |  |  |

## Known Risks

- Canon 600D remote capture support depends on OS, driver, USB mode, and available tooling.
- Live view may require different tooling than still capture.
- Dummy battery instability can look like camera integration failure.
- SELPHY CP1500 print behavior may differ between USB and WiFi modes.
- OS print dialogs are not acceptable for kiosk operation; later integration needs silent print behavior.
- Android TV overscan can crop the fixed kiosk stage unless display scaling is corrected.
- IR touch panel calibration may drift or map to the wrong display if multiple monitors are connected.
- Phone QR download requires the result URL to be reachable from the phone, not just `localhost`.
- Local result files can grow over time and need an operator cleanup policy.

## Next Integration Decision Tree

1. Can the Mini PC reliably run the app and produce local QR results?
   - No: fix Mini PC OS/browser/runtime first.
   - Yes: continue.
2. Does Android TV + IR touch work as a stable kiosk input?
   - No: fix display resolution, overscan, and touch calibration.
   - Yes: continue.
3. Can the Canon 600D save a captured file to the Mini PC using any external test tool?
   - No: do not code integration yet; resolve camera OS/tooling.
   - Yes: define the capture command/API boundary and add a controlled adapter mode.
4. Can the SELPHY print a local result file from the OS without dialogs?
   - No: resolve driver/spooler/silent print path first.
   - Yes: define the print command/API boundary and add a controlled adapter mode.
5. Can phones on the target network open kiosk result URLs?
   - No: decide LAN hostname, static IP, or public tunnel/base URL.
   - Yes: configure `PHOBO_PUBLIC_BASE_URL` in a future checkpoint.
6. Are camera and print both stable in manual tests?
   - No: keep app in mock mode.
   - Yes: implement real adapter modes behind explicit environment flags.
