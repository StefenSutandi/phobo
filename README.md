# Phobo Photobox Kiosk System

Phobo is a production-oriented photobox kiosk application built with Next.js + TypeScript for a Windows Mini PC, Canon EOS 600D, Canon SELPHY CP1500, and a large touchscreen display.

This README is intentionally written as the primary developer/AI handover document. If a new developer, ChatGPT session, or coding agent joins the project, read this file first before changing code.

> **Current production baseline (2026-09-24):** `fix: require consecutive fresh DCC frames`

---

## 1. Current Project Status

The main customer flow is implemented end-to-end:

- package selection
- payment
- frame selection
- DSLR live preview
- background replacement / chroma key
- Canon shutter capture
- photo selection/replacement
- sticker placement
- final composition
- QR result sharing
- Google Drive upload
- Canon SELPHY printing
- paid add-print flow
- session/edit/result timers
- operator/admin fallback tools

Recent physical testing confirmed:

- DSLR shutter capture works
- photo replacement works
- stickers work
- result QR can be scanned
- Canon SELPHY print works
- print count orchestration works
- camera recovery logic has been hardened
- DCC live view and DSLR capture now use the same Canon/digiCamControl camera session

The two most important remaining production checks are:

1. physical validation of the new digiCamControl-primary live preview on the actual Mini PC
2. final Midtrans production QRIS/network validation from the actual Mini PC

Do not redesign stable subsystems unless a physical test demonstrates a real failure.

---

## 2. Hardware

Target deployment:

- **Controller:** Windows Mini PC
- **Camera:** Canon EOS 600D
- **Camera control:** digiCamControl
- **Customer display:** large display / Android TV with IR touch overlay
- **Printer:** Canon SELPHY CP1500
- **Internet:** required for Midtrans production payment and Google Drive upload

Typical production repository path on the Mini PC:

```text
C:\Users\DELL\Downloads\Phobo_live
```

Developer machine has also used:

```text
C:\KYLO\INSTITUT TEKNOLOGI BANDUNG\ITB 22\Project\Phobo
```

and a junction at:

```text
C:\Users\stefe\Downloads\Phobo
```

Do not assume those developer paths exist on the production Mini PC.

---

## 3. Software Stack

- Next.js 16
- React 19
- TypeScript
- Sharp
- qrcode
- googleapis
- midtrans-client
- Windows direct printing via the printer adapter
- digiCamControl local webserver/raw TCP integration

Useful package scripts:

```bash
npm run dev
npm run build
npm run start
npm run start:prod
npm run lint
```

---

## 4. High-Level Architecture

```text
Customer
   |
   v
Phobo Next.js Kiosk
   |
   +----------------------- Payment ----------------------+
   |                                                      |
   |                        Midtrans QRIS                  |
   |                        operator fallback             |
   |                                                      |
   +----------------------- Camera -----------------------+
   |                                                      |
   |      Canon EOS 600D                                  |
   |          |                                           |
   |          v                                           |
   |      digiCamControl                                  |
   |          |                                           |
   |          +--> /liveview.jpg --> Phobo live preview  |
   |          |                     + chroma key          |
   |          |                     + background          |
   |          |                                           |
   |          +--> shutter/capture --> full-res JPEG      |
   |                                                      |
   +----------------------- Result -----------------------+
   |                                                      |
   |      compose final_screen.png                        |
   |      compose final_print.jpg                         |
   |      Google Drive upload                             |
   |      QR result                                       |
   |                                                      |
   +----------------------- Print ------------------------+
                                                          |
                                  Canon SELPHY CP1500 <---+
```

Important design rule:

> **Live preview frames are never the authoritative final photo.**

The final captured photo always comes from the real Canon DSLR shutter flow through digiCamControl.

---

## 5. Customer Flow

Main flow:

```text
/
-> package
-> payment
-> frames
-> camera
-> preview
-> result
-> closing
```

Additional print flow:

```text
/result
-> additional-frame
-> additional-preview
-> add-print-payment
-> additional result/print flow
```

Admin/operator tooling is separate from the normal customer path.

---

## 6. Package Contract

Current code source of truth: `src/lib/phobo-data.ts`.

| Package | Price | Required shots | Included prints | Legacy package duration metadata |
|---|---:|---:|---:|---:|
| BASIC | Rp45.000 | 8 | 1 | 5 min |
| DUO | Rp60.000 | 8 | 2 | 7 min |
| PREMIUM | Rp65.000 | 16 | 2 | 10 min |

Additional print:

```text
Rp20.000
```

Important:

- `includedPrintCount` controls physical print quantity.
- Basic prints 1 copy.
- Duo prints 2 sequential copies.
- Premium prints 2 sequential copies.
- Each printer API call represents one physical print job.
- Do not convert this into `Copies=2` inside a single Windows print request unless the print pipeline is deliberately redesigned and physically revalidated.

---

## 7. Session Timers

There are multiple timers with different responsibilities.

### Global paid session timer

A persistent **8-minute global session timer** starts once after payment is confirmed and the customer enters `/frames`.

Stored in session as:

```text
sessionStartedAt
sessionDeadlineAt
```

The global timer:

- does not reset on navigation
- does not reset on rerender
- does not reset on reload
- remains active through frames, camera, and preview
- does not interrupt an already committed camera/recovery operation
- is not displayed on `/result`

### Preview edit timer

`/preview` has an independent **2-minute edit timer**.

- **Authoritative initialization:** `beginMainPreview()` is the **only** authoritative operation that creates a fresh main preview window, invoked when the customer completes required photos on `/camera` and clicks NEXT before routing to `/preview`. This guarantees a fresh 120-second editing cycle while strictly preserving all captured photos, frame selections, per-photo backgrounds, stickers, payment status, and the global session timer.
- **Slot filling isolation:** Auto-assigning or filling slots (`isReady = true`) **never** automatically triggers composition or navigation. The customer is guaranteed their full editing time to rearrange photos, swap slots, and add stickers.
- **Navigation triggers:** Navigation to `/result` only occurs when:
  1. The customer manually clicks the NEXT button, or
  2. The fresh 120-second preview timer genuinely elapses to `00:00` (`isExpired = true`).
- **Reload & refresh persistence:** Reloading `/preview` preserves the remaining countdown against `previewDeadlineAt` (e.g. resuming at ~90s if 30s have passed). Reloading after genuine expiry stays expired (`remainingSeconds = 0`) and allows normal exactly-once auto-compose to `/result`. An expired deadline is never reset back to 120s on refresh.
- **Fallback:** `initPreviewTimer(120)` only initializes when `previewDeadlineAt` is genuinely missing unexpectedly.

At expiry:

- compose runs exactly once
- UI shows `PROCESSING...`
- successful compose routes to `/result`
- failure exits processing state and allows retry

### Result timer

`/result` owns its own countdown:

- 300 seconds before print
- 60-second grace period after successful print
- then route to `/closing`

Do not show the global session timer on `/result` because it would compete with the result-specific timer.

---

## 8. Camera Architecture

### Current preferred provider

When:

```env
PHOBO_CAMERA_CAPTURE_MODE=digicamcontrol
```

the preferred live preview provider is digiCamControl.

Browser `getUserMedia()` remains a fallback.

### Verified digiCamControl endpoints

digiCamControl local webserver default:

```text
http://127.0.0.1:5513
```

Verified live-view frame endpoint:

```text
GET /liveview.jpg
```

Verified live-view activation command:

```text
GET /?CMD=LiveViewWnd_Show
```

These were verified from the local digiCamControl WebServer HTML, not guessed.

### Why Phobo uses a custom raw TCP DCC client

The digiCamControl webserver can produce malformed/nonstandard HTTP behavior, including duplicate or unreliable `Content-Length` handling and sockets that do not close normally.

The adapter therefore uses a specialized raw TCP client in:

```text
src/lib/camera/digicamcontrol-adapter.ts
```

Do not replace this with a plain `fetch()`/Node HTTP call without physically validating it against the installed DCC version.

### Live preview pipeline

```text
/liveview.jpg
-> Phobo server proxy
-> CameraLiveView
-> decode frame
-> offscreen canvas
-> chroma key
-> selected background
-> customer preview
```

### DCC Polling Cadence and SHA-256 Freshness

1. **Polling interval:**
   `CameraLiveView` polls `/api/camera/live-frame` at `DCC_POLL_INTERVAL_MS = 500` (native DCC webserver cadence), avoiding socket exhaustion.
2. **SHA-256 Frame Hashing:**
   `getDccLiveViewFrameWithMeta` computes a SHA-256 hash (`crypto.createHash("sha256").update(buffer).digest("hex")`) across the entire JPEG buffer.
3. **Advancing Frame Contract:**
   Frames are only accepted as fresh if `X-Frame-New === "1"` and `seq > lastSeq`. Stale frames with advancing timestamps are rejected.
4. **Readiness Contract:**
   Live view requires at least 2 consecutive fresh advancing frames (`consecutiveFreshFramesRef.current >= 2`) before reporting ready; any intervening stale or repeated frame resets the counter back to 0.

### Browser-video fallback & Terminal Recovery

If DCC live view cannot initialize or if recovery times out across 2 restart attempts in `recoverDccPreview`, Phobo executes a terminal fallback to:

```text
navigator.mediaDevices.getUserMedia(...)  (provider: browser-video)
```

This unfreezes the preview and ensures the customer is never trapped behind a stuck overlay.

### DSLR shutter capture

Actual final photo capture remains separate from live preview:

```text
Phobo SHOOT
-> /api/camera/capture
-> digiCamControl command
-> physical Canon shutter
-> full-resolution JPEG
-> public/results/{sessionId}/captures/
-> session capturedPhotos
```

The Canon JPEG is committed before preview recovery logic runs.

### Capture safety rules

Do not break these invariants:

- one customer SHOOT = one Canon shutter
- duplicate taps must not create duplicate captures
- selected background at shutter time is authoritative
- captured JPEG must survive preview recovery failure
- shot count increments exactly once
- preview frame is never used as the final DSLR photo

---

## 9. Camera Freeze / Recovery Lifecycle

Camera UI states:

```text
idle
countdown
capturing
recovering
recovered
recovery-warning
```

Normal physical sequence:

```text
3
2
1
SMILE
-> freeze last good preview frame
-> trigger Canon shutter
-> store Canon JPEG
-> recover active preview provider
-> require stable/advancing frames
-> settle
-> remove freeze
```

Overlay copy:

- capturing: `MENGAMBIL FOTO...`
- recovering: `MEMULIHKAN KAMERA...`
- long recovery: `FOTO TERSIMPAN / MENUNGGU PREVIEW KAMERA...` with red `RETRY KAMERA` button

### Camera Interaction Lock (`previewRecoveryBlocking`)

To prevent camera freeze surviving between shots or operations occurring behind the freeze overlay:
1. `previewRecoveryBlocking` is engaged during `countdown`, `capturing`, `recovering`, `recovery-warning`, or while `freezeFrameUrl !== null`.
2. While engaged:
   - `handleShoot()` is strictly rejected.
   - `handleSelectBackground()` is strictly rejected.
   - SHOOT button is disabled.
   - NEXT button is disabled.
   - `BackgroundPicker` is disabled.
3. When recovery completes and freeze is cleared, newly selected backgrounds update the live preview immediately without requiring another shutter press.
4. If recovery times out, the `recovery-warning` overlay renders a high-visibility `RETRY KAMERA` button allowing the customer or operator to re-trigger preview recovery directly.

The camera HUD must stay visible above the freeze overlay.

Current intended z-index hierarchy:

```text
countdown overlay      100
session HUD             95
freeze overlay          85
live camera             lower
```

Do not clear the freeze just because a video element has dimensions. Recovery needs actual stable frames.

---

## 10. Green Screen / Background Processing & Aperture Geometry

The live customer preview applies chroma-key processing on a canvas.

Relevant tuning fields:

```text
applyChromaKey
greenMin
greenTolerance
spillReduction
edgeSoftness
```

Background is selectable during camera flow. Newly selected backgrounds reflect immediately on the live view.

For each captured photo, the background active at shutter time is stored with the photo so later preview/composition can preserve per-shot background choice.

### Non-Rectangular Aperture Geometry (No White Gaps)

For circular, ellipse, rounded, or custom-masked frame slots (e.g. Frame 8 Heart, Frame 10 Ellipse):
- `PreviewComposer` (`src/components/kiosk.tsx`) forces `object-fit: cover` (never `contain`).
- `composeFinalImages` (`src/lib/image-processing/compose-final.ts`) and `computePhotoFit` (`src/lib/image-processing/fit-math.ts`) force fit mode `"cover"` whenever `isMaskedOrNonRect` is true.
- This prevents letterboxing and eliminates white background gaps inside non-rectangular apertures.

Frame slot geometry comes from:

```text
public/assets/frames/frame-slots.json
```

Do not casually change frame masks, slot geometry, composition scaling, or sticker coordinate behavior because those have already gone through physical parity fixes.

---

## 11. Preview / Sticker Behavior

In `/preview` the user can:

- assign captured photos to frame slots
- replace an existing photo in a slot
- drag/drop using IR touch/pointer events
- use tap fallback
- add/move/remove stickers
- wait for automatic compose when the 2-minute edit timer expires

The preview compose request is protected against:

- double NEXT click
- timeout + NEXT race
- React rerender duplicate compose

Compose has a bounded client timeout.

If compose fails, expected customer message:

```text
GAGAL MEMPROSES HASIL — COBA LAGI
```

---

## 12. Result Composition

Result files are stored under:

```text
public/results/{sessionId}/
```

Important generated assets:

```text
final_screen.png
final_print.jpg
compose-manifest.json
captures/
```

`final_screen.png` is used for the customer result/QR/share flow.

`final_print.jpg` is the printer asset.

Compose is designed to be idempotent when inputs are unchanged.

Google Drive upload is non-fatal. A Drive problem must not destroy a successfully composed local result.

Drive upload currently has a bounded timeout so the kiosk does not remain stuck forever on processing.

---

## 13. Google Drive

Drive is optional and controlled by environment configuration.

Typical production variables:

```env
PHOBO_DRIVE_ENABLED=true
GOOGLE_DRIVE_AUTH_MODE=oauth
GOOGLE_DRIVE_FOLDER_ID=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REFRESH_TOKEN=...
```

Never commit real OAuth secrets or refresh tokens.

If Drive upload fails but local composition succeeds, the result should still exist locally.

---

## 14. Printing

Target printer:

```text
Canon SELPHY CP1500
```

Current production print intent:

```text
4R / Japanese Postcard
1181 x 1748 px
portrait
single image
fill
```

Typical production configuration:

```env
PHOBO_PRINTER_MODE=windows
PHOBO_PRINTER_NAME=Canon SELPHY CP1500
PHOBO_PRINT_COMMAND_MODE=direct-dotnet
PHOBO_PRINT_DRY_RUN=false
PHOBO_PRINT_FIT=fill
PHOBO_PRINT_WIDTH_PX=1181
PHOBO_PRINT_HEIGHT_PX=1748
```

Important print behavior:

- one API request = one physical print job
- Basic -> 1 sequential request
- Duo/Premium -> 2 sequential requests
- result print is protected by a persisted one-shot lock
- do not re-enable repeated print button behavior after print commit

Physical printer output has already been tested successfully.

---

## 15. Payment Architecture

Supported providers:

```text
midtrans
operator
mock
```

Production target:

```env
PHOBO_PAYMENT_PROVIDER=midtrans
MIDTRANS_ENABLED=true
MIDTRANS_IS_PRODUCTION=true
```

### Midtrans

Phobo uses Midtrans Core API QRIS.

Server-side pricing is authoritative. Do not trust customer-supplied amounts.

The QR displayed to customers must come only from:

- valid Midtrans `qr_string`
- valid Midtrans QR action URL

Never synthesize a QR from an order ID.

A previous bug generated a fake QR from text such as:

```text
MIDTRANS-ORDER-...
```

That behavior was removed and must never be reintroduced.

If no authentic QRIS source exists, return an error/503 instead of displaying a fake QR.

### Midtrans network requirement

The production Mini PC must be able to reach:

```text
api.midtrans.com:443
```

Useful checks:

```powershell
Test-NetConnection api.midtrans.com -Port 443
```

```bash
node -e "fetch('https://api.midtrans.com').then(r=>console.log('HTTP',r.status)).catch(e=>console.error(e,e.cause))"
```

Any HTTP response proves basic HTTPS reachability. A Node `fetch failed` requires network/DNS/TLS diagnosis.

### Operator fallback

Operator/static QRIS mode remains available as fallback.

Do not remove it until Midtrans has passed full physical production validation.

---

## 16. Additional Print Flow & Physical Acceptance Guarantees

Customers can purchase an additional physical print for +Rp20.000,00 from the `/result` page.

### Add-Print State Reset (`beginAdditionalPrint`)

Clicking the `ADD PRINT · +20.000,00` button on `/result` invokes `beginAdditionalPrint()` before navigating to `/additional-frame`.
This clears all previous additional-print state:
- resets `additionalFrameId` to undefined
- clears slot assignments (`additionalPhotoSlotAssignments`, `additionalSelectedPhotoIndices`)
- clears `additionalStickers` to `[]`
- resets `addPrintPaymentStatus` to `"unpaid"`
- clears add-print order IDs and payment URLs
- clears `additionalPrintImageUrl`, `additionalPrintStatus` (`"idle"`), and `additionalPrintCommitted` (`false`)
- clears `additionalPreviewStartedAt` and `additionalPreviewDeadlineAt`

**Critical Preservation:**
`beginAdditionalPrint()` strictly preserves all already captured photos (`session.capturedPhotos`), the active package, and main result assets (`finalImageUrl`, `printImageUrl`, `driveUrl`).

### 120-Second Additional Preview Timer

Upon entering `/additional-preview`, the session timer checks `additionalPreviewDeadlineAt`:
- If missing or if the deadline has already expired (`deadline <= Date.now()`), `initAdditionalPreviewTimer(120)` immediately initializes a fresh 120-second countdown (`02:00`).
- This guarantees customers always receive their full editing duration without dead-ends.

### Strict Non-Auto-Navigation on Slot Completion

Filling all frame slots in `/additional-preview` updates `isReady` to true but **never** triggers auto-navigation.
Auto-navigation to `/add-print-payment` only occurs when the edit timer strictly reaches `00:00` (`isExpired && isReady`).
Customers can continue adjusting photos and stickers until they explicitly click `NEXT` or the timer expires.

### Add-Print Payment & Single Physical Print Execution

In `/add-print-payment`:
1. When `process.env.NEXT_PUBLIC_PAYMENT_DEBUG === "true"`, a `SIMULATE ADD-PRINT PAYMENT` button is rendered to mark the payment paid.
2. Once marked `"paid"`, an automated pipeline:
   - Sets `additionalPrintCommitted = true` and `additionalPrintStatus = "composing"` (with one-shot duplicate protection).
   - Calls `/api/results/compose-additional` to compose `additional_screen.png` and `additional_print.jpg`.
   - Sends exactly **one** physical print request (`POST /api/printer/print`) to the Canon SELPHY CP1500 (`Copies=1`).
   - Sets status to `"printed"` and smoothly navigates to `/closing` after 1.5 seconds.

---

## 17. Environment Configuration

Do not commit `.env.local`.

A production-like configuration looks conceptually like this:

```env
# Camera
PHOBO_CAMERA_MODE=browser-video
PHOBO_CAMERA_CAPTURE_MODE=digicamcontrol
PHOBO_DIGICAM_BASE_URL=http://127.0.0.1:5513
PHOBO_CAMERA_PREVIEW_ENABLED=true
NEXT_PUBLIC_CAMERA_DEBUG=false

# Printer
PHOBO_PRINTER_MODE=windows
PHOBO_PRINTER_NAME=Canon SELPHY CP1500
PHOBO_PRINT_COMMAND_MODE=direct-dotnet
PHOBO_PRINT_DRY_RUN=false
PHOBO_PRINT_FIT=fill
PHOBO_PRINT_WIDTH_PX=1181
PHOBO_PRINT_HEIGHT_PX=1748

# Storage
PHOBO_STORAGE_MODE=local
PHOBO_RESULTS_DIR=public/results
PHOBO_STICKERS_ENABLED=true

# Google Drive
PHOBO_DRIVE_ENABLED=true
GOOGLE_DRIVE_AUTH_MODE=oauth
GOOGLE_DRIVE_FOLDER_ID=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REFRESH_TOKEN=...

# Payment
PHOBO_PAYMENT_PROVIDER=midtrans
MIDTRANS_ENABLED=true
MIDTRANS_IS_PRODUCTION=true
MIDTRANS_SERVER_KEY=...
MIDTRANS_CLIENT_KEY=...
MIDTRANS_MERCHANT_ID=...

# Operator fallback
PHOBO_OPERATOR_PAYMENT_ENABLED=true
PHOBO_OPERATOR_QRIS_IMAGE=/assets/payment/qris.png
PHOBO_OPERATOR_PIN=...
PHOBO_OPERATOR_COOKIE_SECURE=false

# Debug
NEXT_PUBLIC_PAYMENT_DEBUG=false
PHOBO_DEBUG_LOGS=false
```

The exact values live only on the production machine.

### Secret handling

Treat these as secrets:

- `MIDTRANS_SERVER_KEY`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- operator PIN

Do not paste real values into GitHub, README, source code, issue comments, or chat logs.

If a real value is accidentally exposed, rotate it.

---

## 17. Important Routes

Customer:

```text
/
/payment
/frames
/camera
/preview
/result
/closing
/additional-frame
/additional-preview
/add-print-payment
```

Operator/admin:

```text
/admin
/admin/payments
/hardware-check
/api/diagnostics
```

Key APIs:

```text
/api/camera/capture
/api/camera/live-frame
/api/camera/dcc-live-frame
/api/results/compose
/api/results/print-template
/api/printer/print
/api/payment/create
/api/payment/status
/api/payment/qris
/api/payment/expire
```

---

## 18. Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful:

```text
http://localhost:3000/hardware-check
http://localhost:3000/admin
http://localhost:3000/api/diagnostics
```

Development mode should not be used as the normal event-launch procedure.

---

## 19. Production Build / Update Procedure

When code changes are intentionally deployed to the Mini PC:

```bat
cd C:\Users\DELL\Downloads\Phobo_live

git pull origin main
npm.cmd install
rmdir /S /Q .next
npm.cmd run build
```

Then run:

```bat
npm.cmd run start -- -H 0.0.0.0
```

Open:

```text
http://localhost:3000
```

Do not run `git pull`, `npm install`, or `npm build` casually during a live customer session.

---

## 20. Operator Runbook

The operator is expected to operate hardware, not maintain the codebase.

Before opening the booth:

```text
1. Turn on Canon camera.
2. Turn on Canon SELPHY CP1500.
3. Open digiCamControl.
4. Confirm Canon is detected.
5. Confirm DCC live view works.
6. Start Phobo production server.
7. Open customer kiosk in fullscreen/kiosk mode.
8. Perform one camera test.
9. Perform one print test.
10. Confirm payment mode is correct.
```

Quick DCC live-view check:

```text
http://127.0.0.1:5513/liveview.jpg
```

If this does not show a Canon frame, fix digiCamControl/camera before opening the booth.

### Intended operator simplification

A dedicated one-click `START PHOBO` / `STOP PHOBO` production launcher is desirable so the operator never needs Git/npm/terminal commands.

If those launcher scripts do not yet exist in the repository, treat that as an operations improvement task, not a customer-flow redesign.

---

## 21. Production Physical Acceptance Checklist

Before declaring a release event-ready:

### Camera

- DCC live view displays inside Phobo
- background changes update preview
- green screen remains active
- 3-2-1-SMILE works
- one SHOOT triggers one shutter
- freeze frame appears during shutter
- no black/rainbow frame leaks to customer
- preview recovers automatically
- captured JPEG appears exactly once
- multiple consecutive shots work

### Preview

- all required photos appear
- slot replacement works
- IR-touch drag/tap works
- stickers work
- `EDIT 02:00` is visible
- edit timer does not overlap sticker UI
- timeout composes exactly once
- successful compose goes to result

### Result

- final image loads
- QR scans
- no competing global session timer is shown
- print button is one-shot
- post-print 60-second closing timer works

### Printer

- Basic prints once
- Duo prints twice sequentially
- Premium prints twice sequentially
- physical orientation/crop is correct

### Payment

- real QRIS opens in banking/e-wallet app
- paid transaction is confirmed automatically
- kiosk advances only after confirmation
- failed network does not falsely confirm payment
- operator fallback remains available

---

## 22. Test Commands

Run after camera/session/result changes:

```bat
npx.cmd tsx scripts/test-dslr-pipeline.mjs
npx.cmd tsx scripts/test-production-ux.mjs
npx.cmd tsx scripts/test-interaction-parity.mjs
npx.cmd tsx scripts/test-package-contract.mjs
npm.cmd run build
```

For payment changes also run the payment-specific tests available in `scripts/`.

For printer changes also run the printer-specific tests available in `scripts/`.

Automated tests do not replace physical Canon, SELPHY, touch, QRIS, and network validation.

---

## 23. Troubleshooting

### DCC works but Phobo camera preview does not

Check:

```text
http://127.0.0.1:5513/liveview.jpg
```

Then inspect:

- active preview provider
- `/api/camera/live-frame`
- DCC recovery state
- browser-video fallback
- debug logs

With:

```env
NEXT_PUBLIC_CAMERA_DEBUG=true
```

the UI may expose preview provider/state diagnostics.

Return it to `false` for production customer operation.

### DSLR capture works but preview remains frozen

Do not delete the captured photo.

The JPEG is committed before recovery.

Investigate provider recovery and advancing-frame detection, not the shutter pipeline.

### Midtrans QR says invalid

Never create a fallback QR from the order ID.

The QR must originate from authentic Midtrans QRIS data.

### Midtrans status shows `fetch failed`

Run:

```powershell
Test-NetConnection api.midtrans.com -Port 443
```

and Node fetch diagnostics.

Typical causes:

- DNS
- firewall
- TLS/certificate interception
- unstable internet/proxy

Do not disable TLS verification as a production fix.

### Result compose appears stuck

Check:

- compose API logs
- image processing errors
- Drive timeout
- local result directory

A Google Drive failure should be non-fatal if local composition succeeded.

### Printer does not print

Check:

- SELPHY power
- USB/Windows printer availability
- exact Windows printer name
- paper/media
- `PHOBO_PRINTER_MODE=windows`
- `PHOBO_PRINT_DRY_RUN=false`

Do not change image geometry before first confirming the printer itself is reachable.

---

## 24. Stable Areas — Avoid Unnecessary Changes

These areas have already received repeated physical/debug hardening:

- Canon shutter semantics
- DCC raw TCP capture
- DCC live-view provider
- per-shot background lock
- preview drag/touch behavior
- stickers
- frame masks/slot geometry
- final composition
- 1181x1748 print asset
- sequential copy orchestration
- result one-shot print lock
- session timer lifecycle
- preview timeout compose lock
- Midtrans fake-QR prevention

If a future task is unrelated, do not refactor these areas opportunistically.

---

## 25. Current Known Follow-Ups

As of the baseline noted at the top of this README:

1. **Physical retest the DCC-primary preview on the Mini PC**
   - confirm acceptable preview smoothness
   - confirm recovery after repeated shutters
   - confirm no stale/rainbow frames

2. **Complete Midtrans production acceptance**
   - Mini PC network to `api.midtrans.com:443`
   - real QRIS scan
   - real payment confirmation
   - expiry flow

3. **Operator launch simplification**
   - one-click `START PHOBO`
   - one-click `STOP PHOBO`
   - simple Indonesian operator instructions

Do not treat these as reasons to rewrite already-working photo/print logic.

---

## 26. Git / Release Discipline

Before starting work:

```bash
git status
git log -1 --oneline
```

Before committing:

```bash
git diff
npm run build
```

After committing:

```bash
git push origin main
git log -1 --oneline
git status --short
```

Never:

- commit `.env.local`
- commit credentials
- reset a dirty production working tree without inspecting it
- rewrite hardware integration because a tooling agent timed out
- infer that an Antigravity/Gemini API error means Phobo itself is broken

---

## 27. Documentation

Existing supplementary docs:

- [Windows Kiosk Deployment](docs/WINDOWS_KIOSK_DEPLOYMENT.md)
- [Operator Guide](docs/OPERATOR_GUIDE.md)
- [Maintenance Guide](docs/MAINTENANCE_GUIDE.md)
- [Handover Video Script](docs/HANDOVER_VIDEO_SCRIPT.md)
- [CRCS Hardware Bring-Up](docs/CRCS_HARDWARE_BRINGUP.md)
- [Green Screen Testing](docs/GREEN_SCREEN_TESTING.md)

Some older documents may describe earlier mock/EOS-watch architecture. When a document conflicts with current code, this README plus the current `main` branch are the authoritative project state.

---

## 28. Handover Note for Future AI/Coding Sessions

When continuing this project in a new conversation/session:

1. Read this README first.
2. Check the latest commit on `main`.
3. Inspect the relevant current files before proposing architecture changes.
4. Preserve the hardware behavior documented above.
5. Do not ask the project owner to re-explain the entire historical context.
6. If current code conflicts with this README, current code wins and this README should be updated in the same change.
7. Never include real secrets in generated prompts, patches, logs, documentation, or commits.

The project owner should only need to provide the new issue/observation and, when relevant, new physical test logs/screenshots.
