import { NextResponse } from "next/server";
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { getPhoboEnv } from "@/lib/config/phobo-env";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, imageDataUrl, displayImageDataUrl } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ ok: false, error: "Missing or invalid sessionId" }, { status: 400 });
    }

    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return NextResponse.json({ ok: false, error: "Missing or invalid imageDataUrl" }, { status: 400 });
    }

    // Validate data URL
    const matches = imageDataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return NextResponse.json({ ok: false, error: "Invalid image data format" }, { status: 400 });
    }

    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    const env = getPhoboEnv();
    const captureFileName = `capture-${Date.now()}.jpg`;
    
    // Determine target directory (public/results/{sessionId}/captures/)
    const sessionDir = path.join(process.cwd(), env.resultsDir, sessionId);
    const captureDir = path.join(sessionDir, "captures");
    const filePath = path.join(captureDir, captureFileName);
    
    // Ensure directories exist
    await mkdir(captureDir, { recursive: true });
    
    // Save raw to disk
    await writeFile(filePath, buffer);
    if (process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
      console.log(`[BrowserFrameAPI DIAGNOSTICS] capture stored raw photo: yes`);
    }

    let displayPhotoUrl = `/results/${sessionId}/captures/${captureFileName}`;
    let storedPreview = false;
    if (displayImageDataUrl && typeof displayImageDataUrl === "string") {
      const displayMatches = displayImageDataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
      if (displayMatches && displayMatches.length === 3) {
        const displayBuffer = Buffer.from(displayMatches[2], "base64");
        const displayFileName = `capture-${Date.now()}-display.png`;
        const displayFilePath = path.join(captureDir, displayFileName);
        await writeFile(displayFilePath, displayBuffer);
        displayPhotoUrl = `/results/${sessionId}/captures/${displayFileName}`;
        storedPreview = true;
      }
    }
    
    if (process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
      console.log(`[BrowserFrameAPI DIAGNOSTICS] capture stored preview/keyed photo: ${storedPreview ? "yes" : "no"}`);
    }

    return NextResponse.json({
      ok: true,
      mode: "browser-video",
      capturedPhotoUrl: `/results/${sessionId}/captures/${captureFileName}`,
      displayPhotoUrl: displayPhotoUrl,
      filePath,
      size: buffer.length
    });

  } catch (error) {
    console.error("[BrowserFrameAPI] Capture error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save browser frame" },
      { status: 500 }
    );
  }
}
