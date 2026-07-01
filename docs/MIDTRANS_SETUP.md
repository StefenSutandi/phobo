# Midtrans Payment Integration Setup

This guide explains how to configure Midtrans Snap payments for the Phobo kiosk application.

## Prerequisites
- A Midtrans account (Sandbox or Production).
- Node.js running the Next.js server.

## 1. Environment Variables
Create or update your `.env.local` file at the root of the project:

```env
# Enable or disable Midtrans payment flow
MIDTRANS_ENABLED=true

# Set to true for Production, false for Sandbox
MIDTRANS_IS_PRODUCTION=false

# Found in Midtrans Dashboard -> Settings -> Access Keys
MIDTRANS_SERVER_KEY="SB-Mid-server-xxxxxxxxxxxxxxxxxxxxxxxx"
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY="SB-Mid-client-xxxxxxxxxxxxxxxx"

# App URL for webhook testing (can be an ngrok url for local dev)
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## 2. Notification URL (Webhook) Setup
Midtrans needs to notify the kiosk when a payment is successful.
Since the kiosk app uses a local server (and an in-memory store for session statuses), the webhook URL must be reachable by Midtrans.

1. Go to Midtrans Dashboard -> Settings -> Configuration.
2. Under **Payment Notification URL**, enter your public URL:
   `https://your-public-url.com/api/payment/notification`
3. If you are developing locally, you must use a tunneling service like [ngrok](https://ngrok.com/) to expose your local port 3000 to the internet.
   - Run: `ngrok http 3000`
   - Use the generated URL (e.g., `https://abcdef.ngrok.app/api/payment/notification`) in the Midtrans dashboard.

> [!WARNING]
> If you test locally without ngrok, Midtrans cannot reach your `localhost`, and the kiosk UI will never advance automatically when a customer pays!

## 3. Production Switch Checklist
When moving to a real production environment:
- [ ] Change `MIDTRANS_IS_PRODUCTION=true`.
- [ ] Replace `MIDTRANS_SERVER_KEY` with the Production Server Key.
- [ ] Replace `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` with the Production Client Key.
- [ ] Update the Payment Notification URL in the Production Midtrans Dashboard.

## 4. Disabling Midtrans (Manual Fallback)
If the internet connection goes down or you want to bypass Midtrans, simply set:
```env
MIDTRANS_ENABLED=false
```
The app will automatically gracefully degrade to the local manual payment confirmation mode without crashing.
