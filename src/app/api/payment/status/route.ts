import { NextResponse } from "next/server";
import { getPaymentStatus } from "@/lib/payment/status-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
  }

  const status = getPaymentStatus(orderId) || "pending";

  return NextResponse.json({ ok: true, status });
}
