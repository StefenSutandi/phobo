# Venue Hardware Checklist

Use this checklist during on-site deployment to ensure all hardware components are connected and functioning correctly before opening the booth to guests.

## 1. Camera
- [ ] Browser camera (fallback) appears if DSLR is unavailable.
- [ ] Correct physical camera is connected and recognized.
- [ ] Preview feed displays correctly in landscape orientation.
- [ ] Pressing SHOOT correctly saves the image.
- [ ] The captured result successfully reaches the preview screen.

## 2. Green Screen
- [ ] Physical green backdrop is securely installed without wrinkles.
- [ ] Lighting is evenly distributed across the green screen.
- [ ] No strong or harsh shadows cast by the subjects.
- [ ] Subject is not standing too close to the green screen (avoid green spill).
- [ ] Debug mode is accessible and working (set `NEXT_PUBLIC_CAMERA_DEBUG=true`).
- [ ] Background replacement has been tested and works cleanly with the selected ITB background.

## 3. Printer (SELPHY)
- [ ] Printer is powered on and connected to the kiosk via USB/Wi-Fi.
- [ ] The correct printer name is set in the environment (`PHOBO_PRINTER_NAME`).
- [ ] Mock print fallback mode has been tested (`PHOBO_PRINTER_MODE=mock`).
- [ ] Manual print fallback procedure is understood by the operator.

## 4. Internet
- [ ] Stable internet connection established.
- [ ] Google Drive upload test is successful.
- [ ] Result QR can be successfully scanned from a mobile phone and opens the Drive link.
- [ ] Operator knows how to switch to local fallback if Drive fails.

## 5. TV / Touch Panel / Kiosk
- [ ] Browser is running in full-screen (F11/Kiosk mode).
- [ ] Touch interface is responsive and accurate.
- [ ] UI buttons are large enough for touch interaction.
- [ ] No scrollbars are visible on any screen.
- [ ] The three closing page QR codes on the left side are readable and scannable by a mobile phone.

## 6. End-to-End Event Rehearsal
Run 3 to 5 complete sessions to simulate real usage:
- [ ] Click "Start New Session" from `/admin`.
- [ ] Package selection works seamlessly.
- [ ] Manual payment mode tested and verified.
- [ ] Frame selection is responsive.
- [ ] Camera capture sequence completes without crashing.
- [ ] Preview screen allows reviewing and proceeding.
- [ ] Google Drive Result QR generates and scans correctly.
- [ ] Closing page loads cleanly and resets the session automatically.
- [ ] App returns to the home page successfully.
