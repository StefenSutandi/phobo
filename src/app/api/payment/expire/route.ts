import { NextResponse } from "next/server";
import { getPaymentStatus, setPaymentStatus } from "@/lib/payment/status-store";
import { getOperatorOrder, updateOperatorOrderStatus } from "@/lib/payment/operator-store";
import {
  getMidtransTransactionStatus,
  expireMidtransTransaction,
  normalizeMidtransStatus,
} from "@/lib/payment/midtrans";
import { getPhoboEnv } from "@/lib/config/phobo-env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { orderId } = await request.json().catch(() => ({}));

    if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
      return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    }

    const env = getPhoboEnv();
    const provider = env.paymentProvider;

    // 1. Operator Mode Expiry
    if (provider === "operator") {
      const order = await getOperatorOrder(orderId);
      if (order && order.status === "confirmed") {
        return NextResponse.json({
          ok: true,
          provider: "operator",
          orderId,
          status: "confirmed",
          expired: false,
        });
      }

      await updateOperatorOrderStatus(orderId, "cancel");
      setPaymentStatus(orderId, "timeout");
      return NextResponse.json({
        ok: true,
        provider: "operator",
        orderId,
        status: "timeout",
        expired: true,
      });
    }

    // 2. Midtrans Mode Expiry with T=119s Settlement Race Protection
    if (provider === "midtrans") {
      // Step A: Perform final authoritative status check before expiring
      try {
        const currentStatus = await getMidtransTransactionStatus(orderId);
        if (!currentStatus.notFound) {
          const normalized = normalizeMidtransStatus(
            currentStatus.transactionStatus,
            currentStatus.fraudStatus
          );

          if (normalized === "confirmed") {
            setPaymentStatus(orderId, "confirmed");
            return NextResponse.json({
              ok: true,
              provider: "midtrans",
              orderId,
              status: "confirmed",
              expired: false,
            });
          }
        }
      } catch (checkErr) {
        console.warn(`[Payment Expire] Pre-expiry status check failed for ${orderId}:`, checkErr);
      }

      // Step B: Expire the pending transaction at Midtrans
      try {
        await expireMidtransTransaction(orderId);
      } catch (expireErr: any) {
        console.warn(`[Payment Expire] Midtrans expire call warning for ${orderId}:`, expireErr?.message || expireErr);
      }

      setPaymentStatus(orderId, "timeout");
      return NextResponse.json({
        ok: true,
        provider: "midtrans",
        orderId,
        status: "timeout",
        expired: true,
      });
    }

    // Mock Mode
    setPaymentStatus(orderId, "timeout");
    return NextResponse.json({
      ok: true,
      provider: "mock",
      orderId,
      status: "timeout",
      expired: true,
    });
  } catch (error: any) {
    console.error("[Payment Expire] Error:", error?.message || error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
