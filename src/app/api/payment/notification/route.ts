import { NextResponse } from "next/server";
import crypto from "crypto";
import { setPaymentStatus } from "@/lib/payment/status-store";
import type { PaymentStatus } from "@/lib/session/session-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const serverKey = process.env.MIDTRANS_SERVER_KEY || "";

    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status
    } = body;

    // Verify signature: SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)
    const hash = crypto.createHash("sha512");
    hash.update(`${order_id}${status_code}${gross_amount}${serverKey}`);
    const expectedSignature = hash.digest("hex");

    if (signature_key !== expectedSignature) {
      console.warn(`[Midtrans Webhook] Invalid signature for order ${order_id}`);
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 403 });
    }

    // Map transaction_status
    let status: PaymentStatus = "pending";
    if (transaction_status === "settlement" || transaction_status === "capture") {
      status = "confirmed";
    } else if (transaction_status === "expire") {
      status = "timeout";
    } else if (transaction_status === "cancel" || transaction_status === "deny" || transaction_status === "failure") {
      status = "failed";
    } else if (transaction_status === "pending") {
      status = "pending";
    }

    console.log(`[Midtrans Webhook] Order ${order_id} updated to ${status}`);
    setPaymentStatus(order_id, status);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Midtrans Webhook] Error:", error);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}
