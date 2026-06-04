# Phobo Photobox Kiosk System

Phobo is a Next.js and TypeScript photobox kiosk MVP for a Mini PC controller, Android TV + infrared touch screen panel, Canon 700D camera, and Canon SELPHY CP1500 printer.

Current status: the app is mock-only. The kiosk UI, session flow, local result storage, QR sharing, and mock print flow are implemented. Real Canon capture, real SELPHY printing, Google Drive upload, and payment gateway integration are not implemented yet.

## Development Run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful development routes:

- `http://localhost:3000/hardware-check`
- `http://localhost:3000/admin`
- `http://localhost:3000/api/diagnostics`

## Production-Like Local Run

```bash
npm install
npm run build
npm run start
```

Open:

```text
http://localhost:3000
```

If the kiosk must be reachable from phones for QR testing, use the Mini PC LAN IP or a configured base URL instead of `localhost`.

## Kiosk Browser Mode

For on-site testing, open the app in a fullscreen browser on the Mini PC connected to the Android TV.

Options:

- Use browser fullscreen with `F11`.
- Use a browser kiosk launch command if available on the target OS.
- Confirm Android TV overscan/scaling does not crop the kiosk stage.
- Confirm IR touch taps line up with the UI before testing the full flow.

## Hardware Bring-Up

Use the CRCS hardware checklist before implementing real hardware adapters:

```text
docs/CRCS_HARDWARE_BRINGUP.md
```

The checklist covers:

- Mini PC readiness
- Android TV + IR touch panel setup
- Canon 700D OS/tooling tests
- Canon SELPHY CP1500 OS print tests
- Network and QR result access
- Next integration decision tree

## Hardware Check Page

Open:

```text
http://localhost:3000/hardware-check
```

This page shows safe diagnostics for:

- App mode
- Camera mode
- Printer mode
- Storage mode
- Result directory
- Drive enabled/disabled
- Browser and current origin
- Mock camera status
- Mock printer status
- Mock storage status

All device status values are mock unless a future real adapter mode is explicitly implemented and enabled.

## Current MVP Flow

1. Open `/`.
2. Tap `CLICK HERE TO CONTINUE`.
3. Select `PACKAGE 1`, `PACKAGE 2`, or `PACKAGE 3`.
4. On `/payment`, use `DEV CONFIRM PAYMENT`.
5. Select a frame on `/frames`.
6. Select a background on `/camera`.
7. Tap `SHOOT`.
8. Review mock captured photo on `/preview`.
9. Tap `NEXT`.
10. Scan the QR on `/result` or use the small download link.
11. Use `MOCK PRINT` from `/result` or `/admin` to test the mock print flow.

Generated result files are saved under:

```text
public/results/{sessionId}/final.{ext}
```

Generated result files are ignored by Git.

## Environment

Copy `.env.example` to `.env.local` only when local overrides are needed.

Default safe modes:

```env
PHOBO_CAMERA_MODE=mock
PHOBO_PRINTER_MODE=mock
PHOBO_STORAGE_MODE=local
PHOBO_DRIVE_ENABLED=false
PHOBO_RESULTS_DIR=public/results
```

Do not add secrets to `.env.example`.

## Integration Warning

Do not assume Canon 700D capture or Canon SELPHY CP1500 printing works from the app yet. First verify each device through the operating system or vendor/test tooling, then add real adapter modes behind explicit environment flags in a future checkpoint.
