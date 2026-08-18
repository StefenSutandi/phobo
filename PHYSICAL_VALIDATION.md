# Phobo Physical Validation Checklist (Mini PC & Hardware)

> **Status Note**: All physical hardware tests below are currently **[ PENDING ON-SITE MINI PC VALIDATION ]**.

---

| # | Step Name | Procedure & Expected Action | Proving Evidence / File / Log | Status |
|---|---|---|---|---|
| **1** | Diagnostics Check | Open `GET http://localhost:3000/api/diagnostics` | Response returns `ok: true`, `cameraCaptureMode: "digicamcontrol"`, `cameraPreviewEnabled: true` | **PENDING** |
| **2** | DCC Reachability | Check DCC webserver on `http://127.0.0.1:5513` | `/api/diagnostics` returns `dccReachable: true`, `dccLastCaptured: "..."` | **PENDING** |
| **3** | Single Shutter Fire | Send `POST /api/camera/capture` or click SHOOT on `/camera` | Canon EOS 600D physically fires mechanical shutter | **PENDING** |
| **4** | Raw JPEG Existence | Check `public/results/<session>/captures/` | `capture-1-raw.jpg` exists, size > 5 MB (e.g. ~8.8 MB) | **PENDING** |
| **5** | Display PNG Existence | Check `public/results/<session>/captures/` | `capture-1-raw-display.png` exists, size > 200 KB, has 4 channels (RGBA) | **PENDING** |
| **6** | Inspect Raw Photo | Open `capture-1-raw.jpg` in photo viewer | Full-resolution Canon 5184x3456 JPEG with subject on green screen | **PENDING** |
| **7** | Inspect Display PNG | Open `capture-1-raw-display.png` in image editor | Green background is transparent (0 alpha), subject intact | **PENDING** |
| **8** | Shoot Photo 1 (BG01) | Select Background 1 (`background-01`), click SHOOT | Console logs `backgroundAtShutter=background-01`, saves P1 with BG01 | **PENDING** |
| **9** | Shoot Photo 2 (BG04) | Select Background 4 (`background-04`), click SHOOT | Console logs `backgroundAtShutter=background-04`, saves P2 with BG04 | **PENDING** |
| **10** | Shoot Photo 3 (BG08) | Select Background 8 (`background-08`), click SHOOT | Console logs `backgroundAtShutter=background-08`, saves P3 with BG08 | **PENDING** |
| **11** | Verify Thumbnails | Navigate to `/preview`, inspect "HASIL FOTO" strip | Thumbnail 1 has BG01, Thumbnail 2 has BG04, Thumbnail 3 has BG08 | **PENDING** |
| **12** | Reorder Slots | Drag P3 to Slot 1, P1 to Slot 2, P2 to Slot 3 | Slot 1 shows P3, Slot 2 shows P1, Slot 3 shows P2 | **PENDING** |
| **13** | Background Follows Photo | Inspect frame slots on `/preview` | Slot 1 uses BG08 (P3's bg), Slot 2 uses BG01 (P1's bg), Slot 3 uses BG04 (P2's bg) | **PENDING** |
| **14** | Compose Final Result | Click NEXT on `/preview` to trigger `/api/results/compose` | Returns HTTP 200 `ok: true`, `finalImageUrl`, `printImageUrl` | **PENDING** |
| **15** | Inspect `final_screen.png` | Open `public/results/<session>/final_screen.png` | 1200x1800 PNG has Frame template + Slot 1 (BG08) + Slot 2 (BG01) + Slot 3 (BG04) | **PENDING** |
| **16** | Inspect `final_print.jpg` | Open `public/results/<session>/final_print.jpg` | 1748x1181 4R 300DPI print template with correct layout geometry | **PENDING** |
| **17** | HDMI Recovery Test | Observe customer screen during SHOOT on `/camera` | Screen freezes clean frame ("MENGAMBIL FOTO..."), shutter fires, NO color bars visible, live preview resumes smoothly | **PENDING** |
| **18** | Preview Fallback Test | Set `PHOBO_CAMERA_PREVIEW_ENABLED=false` in `.env.local` | `/camera` shows "MOHON LIHAT KE LENSA KAMERA", SHOOT triggers Canon shutter, real DSLR JPEG arrives | **PENDING** |
| **19** | Drive Upload Test | Set valid OAuth credentials in `.env.local`, set `PHOBO_DRIVE_ENABLED=true` | Result uploaded to Drive folder; if auth invalid, falls back gracefully to local link without error | **PENDING** |
| **20** | SELPHY Printer Test | Connect Canon SELPHY CP1500, set `PHOBO_PRINTER_MODE=powershell`, trigger PRINT on `/result` | SELPHY draws paper and prints physical 4R photo sheet | **PENDING** |

---

## Instructions for Tester on Mini PC
1. Run `git pull origin main`.
2. Follow `DEPLOYMENT.md` to build and start the server.
3. Perform each numbered step sequentially.
4. Record actual logs and mark each step **PASS** or **FAIL**.
