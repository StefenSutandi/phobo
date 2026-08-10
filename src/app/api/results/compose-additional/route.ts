import { NextResponse } from "next/server";
import { composeFinalImages } from "@/lib/image-processing/compose-final";
import { generate4RPrintTemplate } from "@/lib/print/print-template";
import { getPhoboEnv } from "@/lib/config/phobo-env";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { bufferToDataUrl } from "@/lib/image-processing/load-image";

function parseOptions(options?: any) {
  if (!options) return undefined;
  return {
    applyChromaKey: Boolean(options.applyChromaKey),
    greenMin: Number(options.greenMin) || 70,
    greenTolerance: Number(options.greenTolerance) || 35,
    spillReduction: Number(options.spillReduction) || 30,
    edgeSoftness: Number(options.edgeSoftness) || 2
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.sessionId || !body.capturedPhotos || !body.additionalFrameId) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const safeSessionId = body.sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
    const outputDirectory = path.join(process.cwd(), "public", "results", safeSessionId);
    
    // We only need the print template, but composeFinalImages gives us the final screen PNG first
    // Save to additional_screen.png and additional_print.jpg
    const additionalScreenPath = path.join(outputDirectory, "additional_screen.png");
    const additionalPrintPath = path.join(outputDirectory, "additional_print.jpg");

    const capturedPhotos = Array.isArray(body.capturedPhotos) 
      ? body.capturedPhotos.map((p: any) => {
          if (typeof p === "object" && p !== null) {
            return {
              raw: typeof p.raw === "string" ? p.raw : p.display || "",
              display: typeof p.display === "string" ? p.display : p.raw || "",
              backgroundId: typeof p.backgroundId === "string" ? p.backgroundId : undefined,
            };
          }
          return { raw: String(p) };
        }).filter((p: any) => Boolean(p.raw))
      : [];

    const slotAssignments = Array.isArray(body.slotAssignments) ? body.slotAssignments : undefined;

    const stickers = Array.isArray(body.stickers)
      ? body.stickers.map((s: any) => ({
          ...s,
          src: typeof s.src === 'string' && s.src.startsWith('/stickers/') && !s.src.includes('..') ? s.src : null,
        })).filter((s: any) => s.src !== null)
      : [];

    const env = getPhoboEnv();

    const composed = await composeFinalImages({
      sessionId: body.sessionId,
      capturedPhotos,
      selectedFrameId: body.additionalFrameId,
      selectedBackgroundId: body.selectedBackgroundId,
      slotAssignments,
      stickers,
      options: parseOptions(body.options),
    });

    const printBuffer = await generate4RPrintTemplate({
      sessionId: body.sessionId,
      finalImageUrl: await bufferToDataUrl(composed.finalScreenPng),
      selectedFrameId: body.additionalFrameId,
      selectedBackgroundId: body.selectedBackgroundId,
    });
    
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(additionalScreenPath, composed.finalScreenPng);
    await writeFile(additionalPrintPath, printBuffer);

    return NextResponse.json({
      ok: true,
      printImageUrl: `/results/${safeSessionId}/additional_print.jpg`,
      warnings: composed.warnings
    });
  } catch (error) {
    console.error(`[Compose API] Error composing additional print:`, error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to compose additional result"
      },
      { status: 500 }
    );
  }
}
