import { NextResponse } from "next/server";
import { capturePhoto } from "@/lib/hardware/camera-adapter";

export const runtime = "nodejs";

type CaptureRequest = {
  sessionId?: unknown;
};

export async function POST(request: Request) {
  let body: CaptureRequest;

  try {
    body = (await request.json()) as CaptureRequest;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        mode: process.env.PHOBO_CAMERA_MODE === "command" ? "command" : process.env.PHOBO_CAMERA_MODE === "eos-watch" ? "eos-watch" : "mock",
        error: "Request body must be valid JSON",
      },
      { status: 400 },
    );
  }

  if (typeof body.sessionId !== "string" || body.sessionId.trim().length === 0) {
    return NextResponse.json(
      {
        ok: false,
        mode: process.env.PHOBO_CAMERA_MODE === "command" ? "command" : process.env.PHOBO_CAMERA_MODE === "eos-watch" ? "eos-watch" : "mock",
        error: "sessionId is required",
      },
      { status: 400 },
    );
  }

  const result = await capturePhoto({
    sessionId: body.sessionId,
    fileName: `capture-${Date.now()}`,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
