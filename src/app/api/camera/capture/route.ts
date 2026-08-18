import { NextResponse } from "next/server";
import path from "node:path";
import { capturePhoto } from "@/lib/hardware/camera-adapter";
import { captureDccPhoto } from "@/lib/camera/digicamcontrol-adapter";
import { getPhoboEnv } from "@/lib/config/phobo-env";
import { getBackgroundById } from "@/lib/phobo-data";
import { generateDccDisplayImage } from "@/lib/image-processing/dcc-display";

export const runtime = "nodejs";

type CaptureRequest = {
  sessionId?: unknown;
  shotIndex?: unknown;
  count?: unknown;
  backgroundId?: unknown;
  selectedBackgroundId?: unknown;
  greenScreenTuning?: unknown;
};

export async function POST(request: Request) {
  let body: CaptureRequest;

  try {
    body = (await request.json()) as CaptureRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON" },
      { status: 400 }
    );
  }

  if (typeof body.sessionId !== "string" || body.sessionId.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "sessionId is required" },
      { status: 400 }
    );
  }

  const env = getPhoboEnv();

  if (env.cameraCaptureMode === "digicamcontrol") {
    const shotIndex = typeof body.shotIndex === "number" 
      ? body.shotIndex 
      : typeof body.count === "number" 
        ? body.count 
        : 1;

    const bgId = typeof body.backgroundId === "string"
      ? body.backgroundId
      : typeof body.selectedBackgroundId === "string"
        ? body.selectedBackgroundId
        : "background-01";
    
    // 1. Execute real DSLR tethered capture via digiCamControl
    const dccResult = await captureDccPhoto({
      sessionId: body.sessionId,
      shotIndex,
    });

    if (!dccResult.ok || !dccResult.relativeUrl || !dccResult.localFilePath) {
      console.error(`[Capture] DSLR shutter/capture failed:`, dccResult.error);
      return NextResponse.json(
        {
          ok: false,
          mode: "digicamcontrol",
          error: dccResult.error || "Kamera belum siap. Silakan coba lagi.",
        },
        { status: 500 }
      );
    }

    // 2. Generate transparent display PNG directly from the captured DSLR JPEG file
    const safeSessionId = body.sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
    const fileNameNoExt = dccResult.fileName ? dccResult.fileName.replace(/\.[^.]+$/, "") : `capture-${Date.now()}`;
    const displayFileName = `${fileNameNoExt}-display.png`;
    const displayDiskPath = path.join(process.cwd(), "public", "results", safeSessionId, "captures", displayFileName);
    const displayUrl = `/results/${safeSessionId}/captures/${displayFileName}`;

    try {
      const bgObj = getBackgroundById(bgId);
      const options = body.greenScreenTuning && typeof body.greenScreenTuning === "object" ? (body.greenScreenTuning as any) : {};

      const displayResult = await generateDccDisplayImage({
        rawFilePath: dccResult.localFilePath,
        displayFilePath: displayDiskPath,
        background: { color: bgObj.color, imageUrl: bgObj.imageUrl },
        greenScreenTuning: options,
      });

      if (env.debugLogs || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
        console.log(`[Capture]\nshot=${shotIndex}\nmode=digicamcontrol\nraw=${dccResult.relativeUrl}\ndisplay=${displayUrl}\nbackgroundAtShutter=${bgId}\nrawDimensions=${displayResult.width}x${displayResult.height}\ndisplayDimensions=${displayResult.width}x${displayResult.height}\ndisplayHasAlpha=${displayResult.hasAlpha}`);
      }

      // 3. Return successful response with distinct raw and display URLs + backgroundId + dimensions
      return NextResponse.json({
        ok: true,
        mode: "digicamcontrol",
        capturedPhotoUrl: dccResult.relativeUrl,
        displayPhotoUrl: displayUrl,
        raw: dccResult.relativeUrl,
        display: displayUrl,
        backgroundId: bgId,
        width: displayResult.width,
        height: displayResult.height,
      });
    } catch (err) {
      console.error(`[Capture Error] Chroma key generation failed for ${dccResult.localFilePath}:`, err);
      return NextResponse.json(
        {
          ok: false,
          mode: "digicamcontrol",
          error: "Gagal memproses chroma key pada foto DSLR Canon. Silakan coba lagi.",
        },
        { status: 500 }
      );
    }
  }

  // Legacy fallback execution
  const result = await capturePhoto({
    sessionId: body.sessionId,
    fileName: `capture-${Date.now()}`,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
