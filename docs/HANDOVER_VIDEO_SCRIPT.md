# Handover Video Script

Target length: 5-8 minutes.

## 1. Intro Hardware

- Show the Windows Mini PC.
- Show Android TV as the display.
- Show IR touch panel input.
- Show Canon 700D and SELPHY CP1500 as future hardware integration points.
- State that current event-safe mode is mock camera and mock printer unless real modes have been validated.

## 2. Starting App

- Open PowerShell in the Phobo repository.
- Run:

```powershell
.\scripts\start-phobo.ps1
```

- Open the browser:

```powershell
.\scripts\open-kiosk.ps1
```

- Show `http://localhost:3000`.

## 3. Run One Mock Session

- Tap landing continue.
- Select a package.
- Use dev payment confirm.
- Select a frame.
- Select a background.
- Tap shoot.
- Show preview.
- Tap next.

## 4. Result QR

- Show the Result page.
- Explain that QR points to `final_screen.png`.
- Open the final result link.

## 5. Print File Generation

- Show the generated `final_print.jpg`.
- Explain 4R target: `1748 x 1181 px`, landscape.
- Explain mock print vs future Windows print mode.

## 6. Admin Recovery

- Open `/admin`.
- Show confirm payment.
- Show reset session.
- Show test camera.
- Show compose result.
- Show generate print file.
- Show test print.

## 7. Hardware Check

- Open `/hardware-check`.
- Show camera mode, printer mode, result directory, and diagnostics link.
- Open `/api/diagnostics`.

## 8. Shutdown and Maintenance

- Close the kiosk browser.
- Stop the app terminal with `Ctrl+C` if running interactively.
- Explain results folder:

```text
public/results/{sessionId}
```

- Remind: do not commit `.env.local` or generated `public/results` files.
