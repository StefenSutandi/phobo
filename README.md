# Phobo Photobox Kiosk System

A next-generation photobox kiosk software built with Next.js and TypeScript.

## Architecture

- **Controller**: Mini PC
- **Capture**: Canon 700D (via USB)
- **Display & Touch Input**: Android TV with Infrared Touch Screen Panel
- **Printer**: Canon SELPHY CP1500

*Note: The browser UI does not directly control hardware. All hardware control goes through a local backend/device service via adapters.*

## Development

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## CRCS Hardware Bring-Up Checklist

- [ ] Mini PC OS running correctly
- [ ] Android TV HDMI connected and displaying
- [ ] Infrared touch input registered by Mini PC as mouse/touch
- [ ] Canon 700D USB detection successful
- [ ] Canon 700D remote capture test passing
- [ ] Canon SELPHY CP1500 driver installed and test print passing
- [ ] Kiosk fullscreen mode active
