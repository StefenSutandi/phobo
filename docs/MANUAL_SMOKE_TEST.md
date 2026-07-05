# Phobo Manual Smoke Test Checklist

**Note: Build pass is not equivalent to browser flow validation.** A successful `npm run build` only guarantees type safety and compilation success, not logical correctness or UI flow behavior in a real browser.

This document serves as a guide to manually validating the end-to-end Phobo software flow. Do not claim a flow is verified unless it was actually clicked and tested in the browser.

---

## 1. Core Local Mode

**Environment Configuration:**
- `PHOBO_DRIVE_ENABLED=false`
- `MIDTRANS_ENABLED=false`
- `PHOBO_PRINTER_MODE=mock`
- `PHOBO_CAMERA_MODE=browser-video`
- `PHOBO_DEBUG_LOGS=false`

**Test Flow:**
Navigate to `/admin` → Start New Session → `/packages` → `/payment` (manual confirm) → `/frames` → `/camera` → `/preview` → `/result` → `/closing`

**Expected Behavior:**
- [ ] No application crashes at any point in the flow.
- [ ] Session reset works correctly from `/admin`.
- [ ] Selected package selection persists correctly to the payment page.
- [ ] Selected frame choice persists into the camera and preview screens.
- [ ] The shoot count correctly follows the selected package limits.
- [ ] The `requiredPhotos` guard works (cannot proceed to preview until required photos are taken).
- [ ] The result QR appears successfully and uses the local fallback URL.
- [ ] The closing page loads cleanly and finishes the session.

---

## 2. Google Drive Mode

**Environment Configuration:**
- `PHOBO_DRIVE_ENABLED=true`
- `MIDTRANS_ENABLED=false`

**Expected Behavior:**
- [ ] **Valid Credentials:** The QR code on the `/result` page uses the Google Drive URL and the UI status says "Uploaded to Drive".
- [ ] **Invalid/Missing Credentials:** The application does not crash. It gracefully falls back to the local QR code URL and logs the error in the backend safely.

---

## 3. Midtrans Disabled Mode

**Environment Configuration:**
- `MIDTRANS_ENABLED=false`

**Expected Behavior:**
- [ ] The manual confirm payment button is visible and works.
- [ ] Clicking the manual confirm button successfully proceeds to `/frames`.

---

## 4. Midtrans Sandbox Mode

**Environment Configuration:**
- `MIDTRANS_ENABLED=true`
- `MIDTRANS_IS_PRODUCTION=false`

**Expected Behavior:**
- [ ] A Midtrans payment transaction is successfully created on the backend.
- [ ] The payment UI/QR code appears on the `/payment` screen.
- [ ] If the webhook confirms the payment as paid, the app automatically proceeds to `/frames`.
- [ ] **Missing Keys:** If Midtrans keys are missing, the fallback/manual payment path remains usable without a crash.

---

## 5. Result Checks

**Expected Behavior:**
- [ ] QR code size is easily readable by standard smartphone cameras.
- [ ] QR target URL is visible or inspectable in the UI.
- [ ] The final composed image exists in `public/results/session-...`.
- [ ] Both `final_print.jpg` and `final_screen.png` are successfully generated in the session folder.

---

## Bug Logging Template

When an issue is encountered, please use the following template to log the bug:

```markdown
**Page:** (e.g., /camera, /payment)
**Env Mode:** (e.g., Core Local Mode, Google Drive Mode)

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**
What should have happened.

**Actual Behavior:**
What actually happened.

**Terminal Log Excerpt:**
```
(Paste relevant backend logs here, ensure no secrets are exposed)
```

**Screenshot Path:**
(Path or link to the screenshot)

**Severity:** (Blocker / High / Medium / Low)
```
