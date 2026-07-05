# Phobo Software Checklist

## WFH / Dev Mode (No Hardware)
To run Phobo on your local machine for development or WFH without external hardware:

1. **Environment Setup**
   Copy `.env.example` to `.env.local` and ensure:
   - `PHOBO_CAMERA_MODE=browser-video`
   - `PHOBO_PRINTER_MODE=mock`
   - `PHOBO_STORAGE_MODE=local`
   - `PHOBO_DRIVE_ENABLED=false`
   - `MIDTRANS_ENABLED=false`
   - `PHOBO_DEBUG_LOGS=true` (optional, for detailed logs)

2. **Starting the App**
   - Run `npm install`
   - Run `npm run dev`
   - Open `http://localhost:3000/admin` to start a new session.

## Event Mode (Real Hardware)
For an actual event, ensure the following are configured correctly:

1. **Environment Setup**
   - Configure `.env.local` based on your hardware:
   - `PHOBO_CAMERA_MODE=command` (or `eos-watch`)
   - `PHOBO_PRINTER_MODE=powershell-printto`
   - `PHOBO_STORAGE_MODE=local` (or `drive`)
   - `PHOBO_DRIVE_ENABLED=true`
   - `MIDTRANS_ENABLED=true` (if using payment)

2. **Google Drive QR Checklist**
   - Ensure `GOOGLE_APPLICATION_CREDENTIALS` is set to the path of your service account JSON file.
   - Ensure `GOOGLE_DRIVE_FOLDER_ID` is set to a valid, shared Drive folder ID.
   - **Fallback**: If Drive fails or credentials are missing, the app will automatically use the local URL for the QR code and will log a failure without crashing.

3. **Midtrans Checklist**
   - Ensure `MIDTRANS_SERVER_KEY` and `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` are valid.
   - Ensure `MIDTRANS_IS_PRODUCTION` is set appropriately.
   - **Fallback**: If Midtrans fails, the app returns a server error which gracefully falls back to the manual payment confirmation mode, so the event can continue.

4. **Printer Fallback**
   - If the real printer fails or isn't connected, change `PHOBO_PRINTER_MODE=mock`. The session will still generate the print file and save it, allowing manual printing later.

## Pre-Event Software Rehearsal Flow
Before the event starts, run through the complete flow to ensure everything works:

1. Navigate to `/admin` and click "Start New Session".
2. Select a package on the `/packages` page.
3. Complete payment (or use manual fallback) on `/payment`.
4. Select a frame on `/frames`.
5. Take required photos on `/camera`. Ensure the camera works and saves files.
6. Review photos on `/preview` and proceed.
7. Scan the generated QR code on `/result`.
8. Wait for the session to finish and reset via `/closing` (or manually finish). Note that the three QR codes on the `/closing` page (Feedback, Frame Request, Event Registration) are static PNG assets loaded from `public/assets/qr/`. Ensure these image files are present for the event.

## Session Reset
If a session gets stuck, you can always reset it by navigating directly to `/admin` and clicking "Start New Session". This clears the current store state and creates a new empty session.

## Operator Fallback & Troubleshooting Notes
During a live event, rapid recovery is critical. If a component fails, use the following workarounds to keep the booth running:

* **If Google Drive fails:** The system will automatically use the local URL for the QR code. You can also explicitly disable Drive by setting `PHOBO_DRIVE_ENABLED=false` and restarting the app.
* **If Midtrans fails:** Ensure `MIDTRANS_ENABLED=false` is set in your `.env.local` and use the manual "CONFIRM PAYMENT" button to bypass the payment gateway.
* **If Printer fails:** Change `PHOBO_PRINTER_MODE=mock`. The session will still generate and save the print file locally, allowing you to manually print the photos later from the `public/results/` folder.
* **If Green Screen fails:** Capture without background replacement, or retune the lighting/chroma key thresholds later. Keep the line moving.
* **If Camera fails:** Restart the browser and the app. Check USB connections and OS permissions. If the physical camera is completely dead, switch to fallback mode (`PHOBO_CAMERA_MODE=browser-video`) to use a webcam.
