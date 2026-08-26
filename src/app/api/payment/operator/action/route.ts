import { NextResponse } from "next/server";
import { updateOperatorOrderStatus } from "@/lib/payment/operator-store";
import { setPaymentStatus } from "@/lib/payment/status-store";
import { isOperatorAuthenticated } from "@/lib/payment/operator-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authenticated = await isOperatorAuthenticated(request);
  if (!authenticated) {
    return NextResponse.json({ ok: false, error: "Unauthorized operator session" }, { status: 401 });
  }

  try {
    const { orderId, action } = await request.json();

    if (!orderId || !action) {
      return NextResponse.json({ ok: false, error: "Missing orderId or action" }, { status: 400 });
    }

    if (action !== "confirm" && action !== "cancel") {
      return NextResponse.json({ ok: false, error: "Action must be confirm or cancel" }, { status: 400 });
    }

    const result = await updateOperatorOrderStatus(orderId, action);

    if (!result.ok || !result.order) {
      return NextResponse.json({ ok: false, error: result.error || "Failed to update order" }, { status: 400 });
    }

    // Update in-memory status store to trigger immediate polling sync for kiosk
    setPaymentStatus(result.order.orderId, result.order.status);

    return NextResponse.json({ ok: true, order: result.order });
  } catch (error) {
    console.error("[Operator Action API] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to perform operator action" }, { status: 500 });
  }
}
