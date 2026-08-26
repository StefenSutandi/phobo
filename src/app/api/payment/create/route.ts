import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync } from "node:fs";
import { createSnapTransaction } from "@/lib/payment/midtrans";
import { createOperatorOrder } from "@/lib/payment/operator-store";
import { getPhoboEnv } from "@/lib/config/phobo-env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { sessionId, packageId, packageName, amount, paymentPurpose = "main-package" } = await request.json();

    if (!sessionId || !amount) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const env = getPhoboEnv();
    const provider = env.paymentProvider;

    if (provider === "operator") {
      const qrisRelativePath = env.operatorQrisImage;
      const qrisDiskPath = path.join(process.cwd(), "public", qrisRelativePath.replace(/^\//, ""));
      const qrisExists = existsSync(qrisDiskPath);

      const order = await createOperatorOrder({
        sessionId,
        paymentPurpose: paymentPurpose === "add-print" ? "add-print" : "main-package",
        baseAmount: Number(amount),
      });

      return NextResponse.json({
        ok: true,
        mode: "operator",
        provider: "operator",
        orderId: order.orderId,
        baseAmount: order.baseAmount,
        uniqueCode: order.uniqueCode,
        payableAmount: order.payableAmount,
        qrisImageUrl: qrisRelativePath,
        qrisConfigured: qrisExists,
        qrisMessage: qrisExists ? undefined : "QRIS merchant belum dikonfigurasi.",
      });
    }

    if (provider === "mock") {
      return NextResponse.json({ ok: false, mode: "mock", provider: "mock", reason: "mock" }, { status: 200 });
    }

    // Default Midtrans mode
    const orderId = `phobo-${sessionId.replace(/[^a-zA-Z0-9-]/g, "")}-${Date.now()}`;
    
    const { token, redirectUrl } = await createSnapTransaction({
      orderId,
      grossAmount: amount,
      sessionId,
    });

    return NextResponse.json({
      ok: true,
      mode: "midtrans",
      provider: "midtrans",
      orderId,
      token,
      redirectUrl
    });
  } catch (error) {
    console.error("[Payment Create] Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to create payment transaction" }, { status: 500 });
  }
}
