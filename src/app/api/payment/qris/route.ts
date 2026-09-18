import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getMidtransOrder } from "@/lib/payment/status-store";
import { fetchMidtransQrisImage, isValidQrisString } from "@/lib/payment/midtrans";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");

    if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
      return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    }

    const cleanOrderId = orderId.trim();
    const order = getMidtransOrder(cleanOrderId);

    if (!order) {
      console.error(`[Payment QRIS] OrderId=${cleanOrderId} | Source=none | Result=503`);
      return NextResponse.json(
        { ok: false, error: "QRIS SEDANG TIDAK TERSEDIA. SILAKAN HUBUNGI OPERATOR." },
        { status: 503, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
      );
    }

    // STRICT PRECEDENCE:
    // 1. If cached Midtrans order has valid qrString:
    //    generate PNG locally from qrString with width 500, margin 4, errorCorrectionLevel M.
    if (isValidQrisString(order.qrString)) {
      const qrBuffer = await QRCode.toBuffer(order.qrString, {
        type: "png",
        width: 500,
        margin: 4,
        errorCorrectionLevel: "M",
      });
      console.log(`[Payment QRIS] OrderId=${cleanOrderId} | Source=qr_string`);
      return new Response(new Uint8Array(qrBuffer), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Phobo-Qris-Source": "qr_string",
        },
      });
    }

    // 2. Else if cached order has qrActionUrl:
    //    proxy/download the actual Midtrans QR image.
    if (order.qrActionUrl) {
      try {
        const { buffer, contentType } = await fetchMidtransQrisImage(order.qrActionUrl);
        console.log(`[Payment QRIS] OrderId=${cleanOrderId} | Source=midtrans_action_url`);
        return new Response(new Uint8Array(buffer), {
          status: 200,
          headers: {
            "Content-Type": contentType || "image/png",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "X-Phobo-Qris-Source": "midtrans_action_url",
          },
        });
      } catch (fetchErr: any) {
        console.error(`[Payment QRIS] OrderId=${cleanOrderId} | Source=midtrans_action_url | FetchFailed: ${fetchErr?.message || fetchErr}`);
      }
    }

    // 3. Else: HTTP 503 with clean error.
    // NEVER generate QR from orderId, URL text, placeholder text, synthetic prefix, or transactionId.
    console.error(`[Payment QRIS] OrderId=${cleanOrderId} | Source=none | Result=503`);
    return NextResponse.json(
      { ok: false, error: "QRIS SEDANG TIDAK TERSEDIA. SILAKAN HUBUNGI OPERATOR." },
      { status: 503, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error: any) {
    console.error("[Payment QRIS] Error:", error?.message || error);
    return NextResponse.json(
      { ok: false, error: "QRIS SEDANG TIDAK TERSEDIA. SILAKAN HUBUNGI OPERATOR." },
      { status: 503, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }
}

