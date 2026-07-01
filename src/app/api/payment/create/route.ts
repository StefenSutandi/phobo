import { NextResponse } from "next/server";
import { createSnapTransaction } from "@/lib/payment/midtrans";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (process.env.MIDTRANS_ENABLED !== "true") {
      return NextResponse.json({ ok: false, reason: "disabled" }, { status: 200 });
    }

    const { sessionId, packageId, packageName, amount } = await request.json();

    if (!sessionId || !amount) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const orderId = `phobo-${sessionId.replace(/[^a-zA-Z0-9-]/g, "")}-${Date.now()}`;
    
    const { token, redirectUrl } = await createSnapTransaction({
      orderId,
      grossAmount: amount,
      sessionId,
    });

    return NextResponse.json({
      ok: true,
      orderId,
      token,
      redirectUrl
    });
  } catch (error) {
    console.error("[Payment Create] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to create payment transaction" }, { status: 500 });
  }
}
