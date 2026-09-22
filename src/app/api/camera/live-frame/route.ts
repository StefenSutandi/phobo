import { NextResponse } from "next/server";
import { getDccLiveViewFrameWithMeta } from "@/lib/camera/digicamcontrol-adapter";

export const runtime = "nodejs";

export async function GET() {
  const frame = await getDccLiveViewFrameWithMeta();

  if (!frame || !frame.buffer || frame.buffer.length < 100) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: "DCC live view frame unavailable" }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Pragma": "no-cache",
        },
      }
    );
  }

  return new NextResponse(new Uint8Array(frame.buffer), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "X-Frame-Sequence": String(frame.sequence),
      "X-Frame-Timestamp": String(frame.timestamp),
      "X-Frame-New": frame.isNew ? "1" : "0",
      "X-Provider": "digicamcontrol",
    },
  });
}
