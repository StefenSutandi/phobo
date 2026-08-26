import { NextResponse } from "next/server";
import { getPaymentStatus } from "@/lib/payment/status-store";
import { getOperatorOrder } from "@/lib/payment/operator-store";
import { getPhoboEnv } from "@/lib/config/phobo-env";
import type { PaymentStatus } from "@/lib/session/session-types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
  }

  const env = getPhoboEnv();
  let status: PaymentStatus = "pending";

  if (env.paymentProvider === "operator" && env.operatorPaymentEnabled) {
    const order = await getOperatorOrder(orderId);
    if (order) {
      status = order.status;
    } else {
      status = await getPaymentStatus(orderId);
    }
  } else {
    status = await getPaymentStatus(orderId);
  }

  return NextResponse.json({
    ok: true,
    provider: env.paymentProvider,
    orderId,
    status,
  });
}