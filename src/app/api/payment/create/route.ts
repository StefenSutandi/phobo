import { NextResponse } from "next/server";
import path from "node:path";
import { existsSync } from "node:fs";
import { createQrisTransaction } from "@/lib/payment/midtrans";
import { createOperatorOrder } from "@/lib/payment/operator-store";
import { saveMidtransOrder, findPendingMidtransOrder } from "@/lib/payment/status-store";
import { getPhoboEnv } from "@/lib/config/phobo-env";
import { getPackageById, ADD_PRINT_PRICE } from "@/lib/phobo-data";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { sessionId, packageId, paymentPurpose = "main-package" } = body;

    if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
      return NextResponse.json({ ok: false, error: "Missing sessionId" }, { status: 400 });
    }

    const purpose: "main-package" | "add-print" =
      paymentPurpose === "add-print" ? "add-print" : "main-package";

    // Server-Authoritative Amount Resolution (Never trust client amount)
    let amount: number;
    let packageName: string;

    if (purpose === "add-print") {
      amount = ADD_PRINT_PRICE;
      packageName = "Additional Print";
    } else {
      if (!packageId || typeof packageId !== "string") {
        return NextResponse.json({ ok: false, error: "Missing or invalid packageId" }, { status: 400 });
      }
      const pkg = getPackageById(packageId);
      if (!pkg || (pkg.id !== "basic" && pkg.id !== "duo" && pkg.id !== "premium")) {
        return NextResponse.json({ ok: false, error: `Invalid packageId: ${packageId}` }, { status: 400 });
      }
      amount = pkg.price;
      packageName = pkg.name;
    }

    const env = getPhoboEnv();
    const provider = env.paymentProvider;

    // 1. Operator Mode (Static merchant QRIS + operator dashboard confirmation)
    if (provider === "operator") {
      const qrisRelativePath = env.operatorQrisImage;
      const qrisDiskPath = path.join(process.cwd(), "public", qrisRelativePath.replace(/^\//, ""));
      const qrisExists = existsSync(qrisDiskPath);

      const order = await createOperatorOrder({
        sessionId,
        paymentPurpose: purpose,
        baseAmount: amount,
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

    // 2. Mock Mode (Development & testing)
    if (provider === "mock") {
      const orderId = `PHOBO-MOCK-${Date.now()}`;
      return NextResponse.json({
        ok: true,
        mode: "mock",
        provider: "mock",
        orderId,
        payableAmount: amount,
        qrisImageUrl: "/assets/payment/qris.png",
      });
    }

    // 3. Midtrans Core API QRIS Mode
    // Check for existing pending transaction to prevent duplicate charges on re-renders
    const existingOrder = findPendingMidtransOrder(sessionId, purpose);
    if (existingOrder && existingOrder.status === "pending" && (existingOrder.qrString || existingOrder.qrActionUrl)) {
      return NextResponse.json({
        ok: true,
        mode: "midtrans",
        provider: "midtrans",
        orderId: existingOrder.orderId,
        payableAmount: existingOrder.amount,
        qrisImageUrl: `/api/payment/qris?orderId=${encodeURIComponent(existingOrder.orderId)}`,
        expiryTime: existingOrder.expiryTime,
      });
    }

    const prefix = purpose === "add-print" ? "PHOBO-ADD" : "PHOBO-MAIN";
    const cleanSession = sessionId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 8);
    const orderId = `${prefix}-${cleanSession}-${Date.now()}`;

    const qrisRes = await createQrisTransaction({
      orderId,
      grossAmount: amount,
      sessionId,
      paymentPurpose: purpose,
    });

    if (!qrisRes.qrString && !qrisRes.qrActionUrl) {
      console.error(`[Payment Create] Order ${orderId} has neither qrString nor qrActionUrl`);
      return NextResponse.json(
        {
          ok: false,
          error: "QRIS MIDTRANS TIDAK TERSEDIA. SILAKAN HUBUNGI OPERATOR.",
        },
        { status: 502 }
      );
    }

    saveMidtransOrder({
      orderId,
      sessionId,
      paymentPurpose: purpose,
      amount,
      qrActionUrl: qrisRes.qrActionUrl,
      qrString: qrisRes.qrString,
      expiryTime: qrisRes.expiryTime,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      mode: "midtrans",
      provider: "midtrans",
      orderId,
      payableAmount: amount,
      qrisImageUrl: `/api/payment/qris?orderId=${encodeURIComponent(orderId)}`,
      expiryTime: qrisRes.expiryTime,
    });
  } catch (error: any) {
    console.error("[Payment Create] Error:", error?.message || error);
    const safeError = error?.message?.includes("QRIS MIDTRANS TIDAK TERSEDIA")
      ? error.message
      : "QRIS MIDTRANS TIDAK TERSEDIA. SILAKAN HUBUNGI OPERATOR.";
    return NextResponse.json(
      {
        ok: false,
        error: safeError,
      },
      { status: 502 }
    );
  }
}