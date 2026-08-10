import { NextResponse } from "next/server";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { capturePhoto } from "@/lib/hardware/camera-adapter";
import { captureDccPhoto } from "@/lib/camera/digicamcontrol-adapter";
import { getPhoboEnv } from "@/lib/config/phobo-env";
import { getBackgroundById } from "@/lib/phobo-data";
import { loadImage, bufferToDataUrl } from "@/lib/image-processing/load-image";
import { applyChromaKeyIfEnabled } from "@/lib/image-processing/chroma-key";

export const runtime = "nodejs";

type CaptureRequest = {
  sessionId?: unknown;
  shotIndex?: unknown;
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
    const shotIndex = typeof body.shotIndex === "number" ? body.shotIndex : undefined;
    
    // Execute real DSLR tethered capture via digiCamControl
    const dccResult = await captureDccPhoto({
      sessionId: body.sessionId,
      shotIndex,
    });

    if (!dccResult.ok || !dccResult.relativeUrl || !dccResult.localFilePath) {
      return NextResponse.json(
        {
          ok: false,
          mode: "digicamcontrol",
          error: dccResult.error || "Kamera belum siap. Silakan coba lagi.",
        },
        { status: 500 }
      );
    }

    // Process chroma key on the real Canon DSLR JPEG for display preview
    let displayUrl = dccResult.relativeUrl;

    try {
      const bgId = typeof body.selectedBackgroundId === "string" ? body.selectedBackgroundId : "background-01";
      const bgObj = getBackgroundById(bgId);
      const options = body.greenScreenTuning && typeof body.greenScreenTuning === "object" ? (body.greenScreenTuning as any) : {};

      const loaded = await loadImage(dccResult.localFilePath);
      const transparentBuffer = await applyChromaKeyIfEnabled(
        loaded.buffer,
        { color: bgObj.color, imageUrl: bgObj.imageUrl },
        options
      );

      const safeSessionId = body.sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
      const fileNameNoExt = dccResult.fileName ? dccResult.fileName.replace(/\.[^.]+$/, "") : `capture-${Date.now()}`;
      const displayFileName = `${fileNameNoExt}-display.png`;
      const displayDiskPath = path.join(process.cwd(), "public", "results", safeSessionId, "captures", displayFileName);

      await writeFile(displayDiskPath, transparentBuffer);
      displayUrl = `/results/${safeSessionId}/captures/${displayFileName}`;
    } catch (err) {
      console.warn("[Capture API] Chroma key display processing failed, using raw JPEG fallback:", err);
    }

    return NextResponse.json({
      ok: true,
      mode: "digicamcontrol",
      capturedPhotoUrl: dccResult.relativeUrl,
      displayPhotoUrl: displayUrl,
      raw: dccResult.relativeUrl,
      display: displayUrl,
    });
  }

  // Legacy fallback execution
  const result = await capturePhoto({
    sessionId: body.sessionId,
    fileName: `capture-${Date.now()}`,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
