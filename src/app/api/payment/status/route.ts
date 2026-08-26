import { NextResponse } from "next/server";
import { getPaymentStatus } from "@/lib/payment/status-store";
import { getOperatorOrder } from "@/lib/payment/operator-store";
import { getPhoboEnv } from "@/lib/config/phobo-env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
  }

  const env = getPhoboEnv();
  let status = "pending";

  if (process.env.PHOBO_PAYMENT_PROVIDER === "qris" && process.env.PHOBO_OPERATOR_PAYMENT_ENABLED === "true") {
    // Membaca status dari operator-store.ts jika mode operator
    const order = await getOperatorOrder(orderId);
    if (order) {
      status = order.status;
    } else {
      status = await getPaymentStatus(orderId);
    }
  } else {
    // Logika asli untuk Midtrans / mock
    status = await getPaymentStatus(orderId);
  }

  return NextResponse.json({
    ok: true,
    provider: env.paymentProvider,
    orderId,
    status,
  });
}