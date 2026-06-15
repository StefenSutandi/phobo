import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { generate4RPrintTemplate } from "@/lib/print/print-template";
import { sanitizeSessionId } from "@/lib/results/result-storage";

export const runtime = "nodejs";

type PrintTemplateRequest = {
  sessionId?: unknown;
  finalImageUrl?: unknown;
  capturedPhotos?: unknown;
  selectedFrameId?: unknown;
  selectedBackgroundId?: unknown;
  showSafeGuide?: unknown;
};

export async function POST(request: Request) {
  let body: PrintTemplateRequest;

  try {
    body = (await request.json()) as PrintTemplateRequest;
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

  const safeSessionId = sanitizeSessionId(body.sessionId);

  if (!safeSessionId) {
    return NextResponse.json(
      { ok: false, error: "sessionId must contain at least one safe character" },
      { status: 400 },
    );
  }

  try {
    const jpegBuffer = await generate4RPrintTemplate({
      sessionId: body.sessionId,
      finalImageUrl: typeof body.finalImageUrl === "string" ? body.finalImageUrl : undefined,
      capturedPhotos: Array.isArray(body.capturedPhotos)
        ? body.capturedPhotos.filter((photoUrl): photoUrl is string => typeof photoUrl === "string")
        : undefined,
      selectedFrameId: typeof body.selectedFrameId === "string" ? body.selectedFrameId : undefined,
      selectedBackgroundId:
        typeof body.selectedBackgroundId === "string" ? body.selectedBackgroundId : undefined,
      showSafeGuide: body.showSafeGuide === true,
    });
    const outputDirectory = path.join(process.cwd(), "public", "results", safeSessionId);
    const localFilePath = path.join(outputDirectory, "final_print.jpg");

    await mkdir(outputDirectory, { recursive: true });
    await writeFile(localFilePath, jpegBuffer);

    return NextResponse.json({
      ok: true,
      printUrl: `/results/${safeSessionId}/final_print.jpg`,
      localFilePath,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to generate print template",
      },
      { status: 500 },
    );
  }
}
