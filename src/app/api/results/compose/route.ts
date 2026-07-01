import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { composeFinalImages } from "@/lib/image-processing/compose-final";
import { generate4RPrintTemplate } from "@/lib/print/print-template";
import { sanitizeSessionId } from "@/lib/results/result-storage";
import { bufferToDataUrl } from "@/lib/image-processing/load-image";
import { uploadFileToGoogleDrive } from "@/lib/storage/google-drive";

export const runtime = "nodejs";

type ComposeRequest = {
  sessionId?: unknown;
  capturedPhotos?: unknown;
  selectedFrameId?: unknown;
  selectedBackgroundId?: unknown;
  options?: unknown;
};

type ComposeOptions = {
  applyChromaKey?: boolean;
  greenMin?: number;
  greenTolerance?: number;
  spillReduction?: number;
  edgeSoftness?: number;
};

function parseOptions(options: unknown): ComposeOptions {
  if (!options || typeof options !== "object") {
    return {};
  }

  const source = options as Record<string, unknown>;

  return {
    applyChromaKey:
      typeof source.applyChromaKey === "boolean" ? source.applyChromaKey : undefined,
    greenMin: typeof source.greenMin === "number" ? source.greenMin : undefined,
    greenTolerance:
      typeof source.greenTolerance === "number" ? source.greenTolerance : undefined,
    spillReduction:
      typeof source.spillReduction === "number" ? source.spillReduction : undefined,
    edgeSoftness:
      typeof source.edgeSoftness === "number" ? source.edgeSoftness : undefined,
  };
}

export async function POST(request: Request) {
  let body: ComposeRequest;

  try {
    body = (await request.json()) as ComposeRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (typeof body.sessionId !== "string" || body.sessionId.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "sessionId is required" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.capturedPhotos)) {
    return NextResponse.json(
      { ok: false, error: "capturedPhotos is required" },
      { status: 400 },
    );
  }

  if (typeof body.selectedFrameId !== "string" || body.selectedFrameId.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "selectedFrameId is required" },
      { status: 400 },
    );
  }

  if (
    typeof body.selectedBackgroundId !== "string" ||
    body.selectedBackgroundId.trim().length === 0
  ) {
    return NextResponse.json(
      { ok: false, error: "selectedBackgroundId is required" },
      { status: 400 },
    );
  }

  const safeSessionId = sanitizeSessionId(body.sessionId);

  if (!safeSessionId) {
    return NextResponse.json(
      { ok: false, error: "sessionId must contain at least one safe character" },
      { status: 400 },
    );
  }

  try {
    const capturedPhotos = body.capturedPhotos.filter(
      (photoUrl): photoUrl is string => typeof photoUrl === "string" && photoUrl.length > 0,
    );

    const outputDirectory = path.join(process.cwd(), "public", "results", safeSessionId);
    const finalScreenPath = path.join(outputDirectory, "final_screen.png");
    const finalPrintPath = path.join(outputDirectory, "final_print.jpg");
    const manifestPath = path.join(outputDirectory, "compose-manifest.json");

    const payloadHash = JSON.stringify({
      capturedPhotos,
      selectedFrameId: body.selectedFrameId,
      selectedBackgroundId: body.selectedBackgroundId,
      options: body.options,
    });

    try {
      await access(finalScreenPath);
      await access(finalPrintPath);
      const existingManifest = await readFile(manifestPath, "utf-8");
      if (existingManifest === payloadHash) {
        console.log(`[Compose API] Inputs unchanged, skipping compose for ${safeSessionId}`);
        return NextResponse.json({
          ok: true,
          finalImageUrl: `/results/${safeSessionId}/final_screen.png`,
          printImageUrl: `/results/${safeSessionId}/final_print.jpg`,
          warnings: []
        });
      }
    } catch {
      // files missing or manifest mismatch, proceed to compose
    }

    console.log(`[Compose API] Starting compose for session: ${safeSessionId}`);
    console.log(`[Compose API] Captured photos: ${capturedPhotos.join(", ")}`);
    console.log(`[Compose API] Selected frame: ${body.selectedFrameId}`);
    console.log(`[Compose API] Selected background: ${body.selectedBackgroundId}`);
    console.log(`[Compose API] Stage: composeFinalImages`);

    const composed = await composeFinalImages({
      sessionId: body.sessionId,
      capturedPhotos,
      selectedFrameId: body.selectedFrameId,
      selectedBackgroundId: body.selectedBackgroundId,
      options: parseOptions(body.options),
    });
    const printBuffer = await generate4RPrintTemplate({
      sessionId: body.sessionId,
      finalImageUrl: await bufferToDataUrl(composed.finalScreenPng),
      selectedFrameId: body.selectedFrameId,
      selectedBackgroundId: body.selectedBackgroundId,
    });
    console.log(`[Compose API] Stage: saving files to ${outputDirectory}`);
    
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(finalScreenPath, composed.finalScreenPng);
    await writeFile(finalPrintPath, printBuffer);
    await writeFile(manifestPath, payloadHash);
    
    let driveUrl = undefined;
    
    if (process.env.PHOBO_DRIVE_ENABLED === "true") {
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (folderId) {
        try {
          const uploadResult = await uploadFileToGoogleDrive({
            filePath: finalScreenPath,
            fileName: `phobo_${safeSessionId}.png`,
            mimeType: "image/png",
            folderId: folderId
          });
          driveUrl = uploadResult.webViewLink;
          console.log(`[Compose API] Drive upload success for ${safeSessionId}: ${driveUrl}`);
        } catch (uploadError) {
          console.error(`[Compose API] Drive upload failed for ${safeSessionId}:`, uploadError);
          // Fallback, don't throw
        }
      } else {
        console.warn(`[Compose API] PHOBO_DRIVE_ENABLED is true but GOOGLE_DRIVE_FOLDER_ID is missing.`);
      }
    } else {
      console.log(`[Compose API] Google Drive upload disabled for ${safeSessionId}.`);
    }

    return NextResponse.json({
      ok: true,
      finalImageUrl: `/results/${safeSessionId}/final_screen.png`,
      printImageUrl: `/results/${safeSessionId}/final_print.jpg`,
      driveUrl: driveUrl,
      warnings: composed.warnings
    });
  } catch (error) {
    console.error(`[Compose API] Error:`, error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to compose result",
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 },
    );
  }
}
