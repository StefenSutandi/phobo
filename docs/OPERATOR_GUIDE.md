# Operator Guide

This guide is for running Phobo during an event. Keep the app in mock mode unless the technical owner explicitly enables hardware modes.

## Normal Startup

1. Turn on the Mini PC, Android TV, IR touch panel, camera, and printer.
2. Confirm the Android TV shows the Mini PC display.
3. Open PowerShell in the Phobo repository.
4. Start the app:

```powershell
.\scripts\start-phobo.ps1
```

5. Open the kiosk browser:

```powershell
.\scripts\open-kiosk.ps1
```

6. Check:

```text
http://localhost:3000/hardware-check
```

## Normal Photobox Flow

1. Landing: tap `CLICK HERE TO CONTINUE`.
2. Select package.
3. Payment confirm: operator uses `DEV CONFIRM PAYMENT`.
4. Select frame.
5. Select background.
6. Shoot.
   - **Automatic Mode (`command`)**: The operator only needs to press SHOOT in Phobo. Phobo will call digiCamControl, trigger the Canon 600D, copy the captured image into the session, then continue automatically to preview/compositing.
   - **Fallback Mode (`eos-watch`)**: If command mode fails, switch to `eos-watch` mode and use EOS Utility 2 to manually save the photo during the capture timeout window.
7. Preview.
8. Result QR.
9. Generate or print 4R from Result/Admin controls.

## Admin Page

Open:

```text
http://localhost:3000/admin
```

Admin functions:

- Confirm payment
- Reset session
- Clear captured photos
- Test camera
- Compose result
- Generate print file
- Open final result
- Open print image
- Test print

## Recovery Scenarios

User stuck at payment:

1. Open `/admin`.
2. Click `Confirm Payment`.
3. Return to `/frames`.

Camera capture fails:

1. Keep `PHOBO_CAMERA_MODE=mock` for event operation.
2. Open `/admin`.
3. Click `Test Camera Capture`.
4. If it still fails in mock mode, refresh the browser and reset the session.

QR result missing:

1. Open `/admin`.
2. Confirm `Final Image URL` exists.
3. Click `Compose Result` if missing.
4. Open `/result` again.

Print file missing:

1. Open `/admin`.
2. Click `Compose Result`.
3. If needed, click `Generate Print File`.
4. Click `Open Print Image`.

Printer fails:

1. Keep `PHOBO_PRINTER_MODE=mock` unless Windows printing has been validated.
2. Confirm `final_print.jpg` opens from Admin.
3. Print manually from Windows if needed.
4. Record the failure and continue with mock mode.

Browser accidentally closed:

1. Leave the app server running.
2. Run:

```powershell
.\scripts\open-kiosk.ps1
```

3. If the app does not load, run:

```powershell
.\scripts\start-phobo.ps1
```
