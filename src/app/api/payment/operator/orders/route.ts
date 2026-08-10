import { NextResponse } from "next/server";
import { getAllOperatorOrders } from "@/lib/payment/operator-store";
import { isOperatorAuthenticated } from "@/lib/payment/operator-auth";

export const runtime = "nodejs";

export async function GET() {
  const authenticated = await isOperatorAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ ok: false, error: "Unauthorized operator session" }, { status: 401 });
  }

  try {
    const orders = await getAllOperatorOrders(100);
    return NextResponse.json({ ok: true, orders });
  } catch (error) {
    console.error("[Operator Orders API] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch orders" }, { status: 500 });
  }
}
