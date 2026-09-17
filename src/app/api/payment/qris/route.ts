import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getMidtransOrder } from "@/lib/payment/status-store";
import { fetchMidtransQrisImage, getMidtransTransactionStatus } from "@/lib/payment/midtrans";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    }

    const order = getMidtransOrder(orderId);

    // 1. If we have the direct Midtrans QR action URL cached
    if (order?.qrActionUrl) {
      try {
        const { buffer, contentType } = await fetchMidtransQrisImage(order.qrActionUrl);
        return new Response(new Uint8Array(buffer), {
          status: 200,
          headers: {
            "Content-Type": contentType || "image/png",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      } catch (fetchErr) {
        console.warn(`[Payment QRIS Proxy] Failed to proxy action URL for ${orderId}:`, fetchErr);
      }
    }

    // 2. If we have a QR string payload (e.g., standard QRIS EMVCo string)
    if (order?.qrString) {
      const qrBuffer = await QRCode.toBuffer(order.qrString, {
        type: "png",
        margin: 1,
        width: 400,
        errorCorrectionLevel: "M",
      });
      return new Response(new Uint8Array(qrBuffer), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // 3. Fallback: Query status from Midtrans
    try {
      const statusRes = await getMidtransTransactionStatus(orderId);
      if (!statusRes.notFound) {
        // Generate QR code with order ID if direct image unavailable
        const qrBuffer = await QRCode.toBuffer(`MIDTRANS-ORDER-${orderId}`, {
          type: "png",
          margin: 1,
          width: 400,
        });
        return new Response(new Uint8Array(qrBuffer), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      }
    } catch {
      // Ignored
    }

    return NextResponse.json({ ok: false, error: "QRIS not found" }, { status: 404 });
  } catch (error: any) {
    console.error("[Payment QRIS Proxy] Error:", error?.message || error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
