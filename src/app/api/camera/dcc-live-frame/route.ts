import { NextResponse } from "next/server";
import { getDccLiveViewFrame } from "@/lib/camera/digicamcontrol-adapter";

export const runtime = "nodejs";

export async function GET() {
  const frameBuffer = await getDccLiveViewFrame();

  if (!frameBuffer) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(frameBuffer), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}
