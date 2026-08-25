import { NextResponse } from "next/server";
import { getPaymentStatus } from "@/lib/payment/status-store";
import { getPhoboEnv } from "@/lib/config/phobo-env";
import { getPayments } from "@/lib/payment-db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
  }

  const env = getPhoboEnv();
  let status = "pending";

  if (env.paymentProvider === "operator") {
    // Membaca status dari file JSON jika mode operator
    const payments = getPayments();
    const payment = payments.find((p: any) => p.orderId === orderId);
    
    if (payment) {
      status = payment.status;
    } else {
      // Fallback jika tidak ada di JSON tapi mungkin tersimpan di operator-store bawaanmu
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