# Current Phobo Status

## Completed Features

- Figma-matched kiosk UI flow for landing, package, payment, frame, camera, preview, and result.
- Local session state with recovery controls in Admin.
- Mock camera capture flow.
- Configurable Windows camera command adapter scaffold behind `PHOBO_CAMERA_MODE`.
- Local result storage under `public/results/{sessionId}`.
- QR result sharing using `final_screen.png`.
- MVP photo compositing from captured photos, selected frame, and selected background.
- MVP chroma key / green screen processing with configurable thresholds.
- 4R print output generation as `final_print.jpg` at `1748 x 1181 px`.
- Mock print flow.
- Windows SELPHY print adapter foundation behind `PHOBO_PRINTER_MODE`.
- Hardware check and diagnostics pages.
- Windows kiosk deployment, operator, maintenance, and handover documentation.

## Pending Hardware Validations

- Canon 700D command-line capture with the selected Windows capture tool.
- Canon 700D save path, latency, focus, power stability, and USB reliability.
- SELPHY CP1500 silent or operator-safe Windows printing from `final_print.jpg`.
- 4R output crop behavior on real postcard paper.
- Android TV overscan/scaling on the final install location.
- IR touch alignment after final TV placement.
- LAN access for QR result downloads from guest phones.

## Next Test Order

1. Keep `.env.local` in mock camera and mock printer mode.
2. Run `npm install`, `npm run build`, then start the app.
3. Verify Android TV display scaling and IR touch alignment.
4. Complete one full mock session and confirm `final_screen.png` plus `final_print.jpg`.
5. Confirm QR result opens on the Mini PC and a phone on the same network.
6. Confirm manual Windows printing of `final_print.jpg` to SELPHY CP1500.
7. Validate Canon 700D capture command outside Phobo.
8. Enable `PHOBO_CAMERA_MODE=command` only after the command works manually.
9. Validate Windows print adapter only after manual SELPHY printing is stable.
10. Return to mock modes immediately if real hardware behavior is unreliable.
