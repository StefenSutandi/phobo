# Phobo Production Mini PC Deployment Guide

Target Machine: **Windows Mini PC**  
Target Directory: `C:\Users\DELL\Downloads\Phobo_live`

---

## 1. Quick Automated Deployment & Startup

Run the helper script directly:
```cmd
scripts\deploy-minipc.cmd
```

---

## 2. Manual Standard Deployment Sequence

```cmd
cd /d C:\Users\DELL\Downloads\Phobo_live

# 1. Pull latest code
git pull origin main

# 2. Check native binaries (do NOT blindly delete node_modules)
node -e "require('lightningcss'); console.log('LIGHTNINGCSS OK')"
node -e "const sharp=require('sharp'); console.log('SHARP OK', sharp.versions.sharp)"

# If native dependencies fail:
npm.cmd ci --include=optional

# 3. Clean stale build cache
rmdir /S /Q .next

# 4. Build optimized production bundle
npm.cmd run build

# 5. Start kiosk application server
npm.cmd run start
```

---

## 3. Environment Configuration (`.env.local`)

Ensure `.env.local` is present in `C:\Users\DELL\Downloads\Phobo_live`:

```env
PHOBO_CAMERA_MODE=browser-video
PHOBO_CAMERA_CAPTURE_MODE=digicamcontrol
PHOBO_DIGICAM_BASE_URL=http://127.0.0.1:5513

# Customer Camera Live Preview Toggle:
# true  -> Normal live HDMI stream / browser video preview
# false -> Safe event fallback (displays "MOHON LIHAT KE LENSA KAMERA", bypasses HDMI stream)
PHOBO_CAMERA_PREVIEW_ENABLED=true

# Payment Configuration (Static QRIS + Base Price + Operator Confirm)
PHOBO_PAYMENT_PROVIDER=operator
PHOBO_OPERATOR_PAYMENT_ENABLED=true
PHOBO_OPERATOR_QRIS_IMAGE=/assets/payment/qris.png
PHOBO_OPERATOR_PIN=8888

# Storage & Google Drive Configuration
PHOBO_STORAGE_MODE=local
PHOBO_DRIVE_ENABLED=true
GOOGLE_DRIVE_AUTH_MODE=oauth
GOOGLE_DRIVE_FOLDER_ID=1Rphb7-Va_F2eyvJgf0Bba_MLCivykd5U
GOOGLE_OAUTH_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
GOOGLE_OAUTH_REFRESH_TOKEN=your_refresh_token

# Printer Configuration
PHOBO_PRINTER_MODE=mock
# When SELPHY is connected:
# PHOBO_PRINTER_MODE=powershell
# PHOBO_PRINTER_NAME=Canon SELPHY CP1500
```

---

## 4. Pre-Event Validation & Diagnostics

Run the deterministic test suite before event opening:

```cmd
# 1. Test DSLR & image composition pipeline
npx tsx scripts/test-dslr-pipeline.mjs

# 2. Test operator payment & order state machine
npx tsx scripts/test-payment.mjs

# 3. Test Google Drive OAuth authentication & upload
npx tsx scripts/test-drive-upload.mjs
```

---

## 5. Operational Modes & Fallbacks

1. **Static QRIS + Manual Operator Confirmation (Event Payment)**:
   - Customers scan merchant static QRIS on screen.
   - Price displayed is the exact base price (e.g. Rp 45.000 for Package, Rp 20.000 for Additional Print).
   - Operator monitors `/admin/payments` on a mobile phone or secondary browser tab to confirm payments.
   - Kiosk automatically proceeds once operator confirms.

2. **Camera Preview Fallback**:
   - If Canon HDMI preview suffers from capture card drops or autofocus boxes, set `PHOBO_CAMERA_PREVIEW_ENABLED=false`.
   - The kiosk displays `"MOHON LIHAT KE LENSA KAMERA"` while maintaining 100% full-resolution DSLR capture.

3. **Google Drive Non-Fatal Fallback**:
   - If Google Drive encounters `invalid_grant` or token expiration, the local photo composition, local results viewer, and SELPHY printing will continue to work without disruption.
   - Customers can still scan the local network QR code on the result screen.
