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

# Payment Configuration
PHOBO_PAYMENT_PROVIDER=operator
PHOBO_OPERATOR_PAYMENT_ENABLED=true
PHOBO_OPERATOR_QRIS_IMAGE=/assets/payment/qris.png

# Printer Configuration
PHOBO_PRINTER_MODE=mock
# When SELPHY is connected:
# PHOBO_PRINTER_MODE=powershell
# PHOBO_PRINTER_NAME=Canon SELPHY CP1500
```

---

## 4. Operational Fallback Modes

1. **Camera Preview Fallback**:
   - If the Canon 600D HDMI feed exhibits unfixable auto-focus box overlays or capture card sync drops, set `PHOBO_CAMERA_PREVIEW_ENABLED=false` in `.env.local`.
   - The kiosk will display a clean `"MOHON LIHAT KE LENSA KAMERA"` viewport while still firing the real Canon shutter and saving multi-megabyte DSLR JPEGs.

2. **Operator Payment Fallback**:
   - `PHOBO_PAYMENT_PROVIDER=operator` uses unique-amount static QRIS with operator manual confirmation via `/admin/payments`.
