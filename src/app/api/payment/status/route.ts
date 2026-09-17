import { NextResponse } from "next/server";
import { getPaymentStatus, setPaymentStatus } from "@/lib/payment/status-store";
import { getOperatorOrder } from "@/lib/payment/operator-store";
import { getMidtransTransactionStatus, normalizeMidtransStatus } from "@/lib/payment/midtrans";
import { getPhoboEnv } from "@/lib/config/phobo-env";
import type { PaymentStatus } from "@/lib/session/session-types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
  }

  const env = getPhoboEnv();
  const provider = env.paymentProvider;
  let status: PaymentStatus = "pending";

  try {
    if (provider === "operator" && env.operatorPaymentEnabled) {
      const order = await getOperatorOrder(orderId);
      if (order) {
        status = order.status;
      } else {
        status = await getPaymentStatus(orderId);
      }
    } else if (provider === "midtrans") {
      // 1. Check local cache first; if already confirmed, avoid unnecessary external API roundtrip
      const cachedStatus = await getPaymentStatus(orderId);
      if (cachedStatus === "confirmed") {
        status = "confirmed";
      } else {
        try {
          const midtransStatus = await getMidtransTransactionStatus(orderId);
          if (midtransStatus.notFound) {
            status = cachedStatus || "pending";
          } else {
            status = normalizeMidtransStatus(
              midtransStatus.transactionStatus,
              midtransStatus.fraudStatus
            );
            setPaymentStatus(orderId, status);
          }
        } catch (apiError: any) {
          // Network resilience: do not immediately fail on transient network hiccups during polling
          console.warn(`[Payment Status Polling] Network warning for ${orderId}:`, apiError?.message || apiError);
          status = cachedStatus || "pending";
        }
      }
    } else {
      // Mock mode / fallback
      status = await getPaymentStatus(orderId);
    }

    return NextResponse.json({
      ok: true,
      provider,
      orderId,
      status,
    });
  } catch (error: any) {
    console.error(`[Payment Status] Error querying status for ${orderId}:`, error?.message || error);
    return NextResponse.json({
      ok: true,
      provider,
      orderId,
      status: "pending",
    });
  }
}