import { NextResponse } from "next/server";
import crypto from "crypto";
import { setPaymentStatus } from "@/lib/payment/status-store";
import { normalizeMidtransStatus } from "@/lib/payment/midtrans";
import type { PaymentStatus } from "@/lib/session/session-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const serverKey = process.env.MIDTRANS_SERVER_KEY || "";

    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
    } = body;

    if (!order_id || !signature_key) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // Verify signature: SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)
    const hash = crypto.createHash("sha512");
    hash.update(`${order_id}${status_code}${gross_amount}${serverKey}`);
    const expectedSignature = hash.digest("hex");

    if (signature_key !== expectedSignature) {
      console.warn(`[Midtrans Webhook] Invalid signature for order ${order_id}`);
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 403 });
    }

    // Map transaction_status consistently
    const status: PaymentStatus = normalizeMidtransStatus(transaction_status, fraud_status);

    console.log(`[Midtrans Webhook] Order ${order_id} updated to ${status}`);
    setPaymentStatus(order_id, status);

    return NextResponse.json({ ok: true, orderId: order_id, status });
  } catch (error: any) {
    console.error("[Midtrans Webhook] Error:", error?.message || error);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}

