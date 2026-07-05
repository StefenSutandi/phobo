# Backup Mode / Fallback Profile

If any external service (Internet, Google Drive, Midtrans, Camera Hardware, or Printer) fails during an event, you can switch Phobo into **Backup Mode** to keep the booth running and serve guests.

## When to use Backup Mode
- The physical camera is disconnected or broken.
- Internet connection drops at the venue.
- Google Drive API quota is exhausted or credentials fail.
- Midtrans payment gateway fails or times out.
- The physical SELPHY printer is jammed or out of ink.

## Backup Environment Configuration
To enable the full backup mode, update your `.env.local` to match the following:

```env
PHOBO_CAMERA_MODE=browser-video
PHOBO_PRINTER_MODE=mock
PHOBO_STORAGE_MODE=local
PHOBO_DRIVE_ENABLED=false
MIDTRANS_ENABLED=false
PHOBO_DEBUG_LOGS=false
```

## What is Disabled in Backup Mode
- **Google Drive QR Upload**: QR codes on the result page will not point to Google Drive.
- **Midtrans Payment Gateway**: Guests cannot scan QR to pay automatically.
- **Physical Printing**: The system will not send commands to the connected SELPHY printer.
- **DSLR Camera**: The app will not connect to the physical camera.

## What Still Works
- **Local QR Code**: The result QR will point to a local Phobo URL (`http://localhost:3000/...`).
- **Manual Payment**: The operator can click the "CONFIRM PAYMENT" button manually to proceed.
- **Mock Printing**: Print template files are still generated and saved locally, which can be printed manually later.
- **Browser Camera**: The app will fallback to using a connected USB webcam or the laptop's built-in camera.

## How to Apply Changes
After editing `.env.local`:
1. Stop the running app (e.g., `Ctrl+C` in the terminal).
2. Start the server again (`npm run dev` or `npm run start`).
3. Refresh the browser and click "Start New Session".

## Recovering Local Results
All final compositions and print templates are safely stored locally on the PC, even if Drive is disabled.
- Go to `public/results/` in the project directory.
- Each session has its own folder containing `final_screen.png` and `final_print.jpg`.
- You can manually upload these folders to Google Drive later or copy them to a flash drive for the guests.
