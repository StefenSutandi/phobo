import { NextResponse } from "next/server";
import { getPaymentStatus } from "@/lib/payment/status-store";
import { getPhoboEnv } from "@/lib/config/phobo-env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
  }

  const env = getPhoboEnv();
  const status = await getPaymentStatus(orderId);

  return NextResponse.json({
    ok: true,
    provider: env.paymentProvider,
    orderId,
    status,
  });
}
