import { NextResponse } from "next/server";
import path from "node:path";
import { readFile, writeFile, stat } from "node:fs/promises";
import { capturePhoto } from "@/lib/hardware/camera-adapter";
import { captureDccPhoto } from "@/lib/camera/digicamcontrol-adapter";
import { getPhoboEnv } from "@/lib/config/phobo-env";
import { getBackgroundById } from "@/lib/phobo-data";
import { applyChromaKeyIfEnabled } from "@/lib/image-processing/chroma-key";

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
        : undefined;

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
      return NextResponse.json(
        {
          ok: false,
          mode: "digicamcontrol",
          error: dccResult.error || "Kamera belum siap. Silakan coba lagi.",
        },
        { status: 500 }
      );
    }

    // 2. Read raw Canon DSLR JPEG buffer directly from disk
    let rawBuffer: Buffer;
    let rawSize = 0;
    try {
      rawBuffer = await readFile(dccResult.localFilePath);
      const rawStats = await stat(dccResult.localFilePath);
      rawSize = rawStats.size;
    } catch (err) {
      console.error(`[DCC Capture Error] Failed to read raw DSLR JPEG at ${dccResult.localFilePath}:`, err);
      return NextResponse.json(
        {
          ok: false,
          mode: "digicamcontrol",
          error: "File foto DSLR Canon tidak dapat dibaca dari disk.",
        },
        { status: 500 }
      );
    }

    // 3. Process chroma key on that high-resolution DSLR JPEG to generate transparent display PNG
    const safeSessionId = body.sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
    const fileNameNoExt = dccResult.fileName ? dccResult.fileName.replace(/\.[^.]+$/, "") : `capture-${Date.now()}`;
    const displayFileName = `${fileNameNoExt}-display.png`;
    const displayDiskPath = path.join(process.cwd(), "public", "results", safeSessionId, "captures", displayFileName);
    const displayUrl = `/results/${safeSessionId}/captures/${displayFileName}`;

    let displaySize = 0;
    let chromaApplied = false;

    try {
      const bgObj = getBackgroundById(bgId);
      const options = body.greenScreenTuning && typeof body.greenScreenTuning === "object" ? (body.greenScreenTuning as any) : {};

      // Apply chroma keying to generate transparent PNG subject buffer
      const transparentBuffer = await applyChromaKeyIfEnabled(
        rawBuffer,
        { color: bgObj.color, imageUrl: bgObj.imageUrl },
        options
      );

      await writeFile(displayDiskPath, transparentBuffer);
      const displayStats = await stat(displayDiskPath);
      displaySize = displayStats.size;
      chromaApplied = options.applyChromaKey !== false;

      console.log(`[DCC Capture]\nrawPath=${dccResult.localFilePath}\nrawSize=${rawSize}\ndisplayPath=${displayDiskPath}\ndisplaySize=${displaySize}\nchromaApplied=${chromaApplied}\nbackgroundId=${bgId}`);
    } catch (err) {
      console.error(`[DCC Capture Error] Chroma key generation failed for ${dccResult.localFilePath}:`, err);
      return NextResponse.json(
        {
          ok: false,
          mode: "digicamcontrol",
          error: "Gagal memproses chroma key pada foto DSLR Canon. Silakan coba lagi.",
        },
        { status: 500 }
      );
    }

    // 4. Return successful response with distinct raw and display URLs + backgroundId
    return NextResponse.json({
      ok: true,
      mode: "digicamcontrol",
      capturedPhotoUrl: dccResult.relativeUrl,
      displayPhotoUrl: displayUrl,
      raw: dccResult.relativeUrl,
      display: displayUrl,
      backgroundId: bgId,
    });
  }

  // Legacy fallback execution
  const result = await capturePhoto({
    sessionId: body.sessionId,
    fileName: `capture-${Date.now()}`,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
