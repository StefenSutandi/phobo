# Midtrans Payment Gateway Setup

Phobo integrates with Midtrans to allow guests to pay via QRIS or other methods seamlessly during an event. This document outlines how to configure Midtrans for both Sandbox testing and live Production.

## 1. Sandbox Validation
Before using Midtrans at a real event, you must validate the integration using your Midtrans Sandbox account.

1. Create a Midtrans Sandbox account if you haven't already.
2. In the Midtrans Dashboard, navigate to **Settings > Access Keys**.
3. Copy your Sandbox **Server Key** and **Client Key**.
4. In your `.env.local` file, configure the following:

```env
MIDTRANS_ENABLED=true
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_SERVER_KEY=SB-Mid-server-your_sandbox_server_key
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=SB-Mid-client-your_sandbox_client_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Local Testing with Webhooks
To test the full payment loop locally, Midtrans needs a way to send payment notifications (webhooks) to your local server.
1. Run `ngrok http 3000` in your terminal.
2. Copy the generated ngrok HTTPS domain (e.g., `https://1234-abcd.ngrok-free.app`).
3. In the Midtrans Sandbox Dashboard, go to **Settings > Configuration**.
4. Set the **Payment Notification URL** to: `https://your-ngrok-domain/api/payment/notification`
5. Run your app (`npm run dev`) and complete a test transaction using the [Midtrans Simulator](https://simulator.sandbox.midtrans.com/).

## 2. Production Mode
Production mode requires a fully approved Midtrans account.

1. Once approved, switch to the Production environment in the Midtrans Dashboard.
2. Go to **Settings > Access Keys** and copy your Production **Server Key** and **Client Key**.
3. Update your `.env.local` (and server environment variables):

```env
MIDTRANS_ENABLED=true
MIDTRANS_IS_PRODUCTION=true
MIDTRANS_SERVER_KEY=Mid-server-your_production_server_key
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=Mid-client-your_production_client_key
# Ensure NEXT_PUBLIC_APP_URL is set to your production domain!
```

4. Set the **Payment Notification URL** in the Production Dashboard to your real production domain: `https://your-domain.com/api/payment/notification`.

> **SECURITY WARNING**: NEVER commit `.env.local` or your Midtrans Server Keys to version control. Keep your keys strictly secure.

## 3. Fallback / Manual Mode
If Midtrans experiences downtime during an event, simply set `MIDTRANS_ENABLED=false` and restart the app. The system will fall back to manual payment confirmation mode, allowing the operator to click "CONFIRM PAYMENT" to keep the booth running smoothly.
