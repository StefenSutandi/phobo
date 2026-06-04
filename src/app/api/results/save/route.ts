import { NextResponse } from "next/server";
import { saveResultFile } from "@/lib/results/result-storage";

type SaveResultRequest = {
  sessionId?: unknown;
  finalImageDataUrl?: unknown;
};

export async function POST(request: Request) {
  let body: SaveResultRequest;

  try {
    body = (await request.json()) as SaveResultRequest;
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

  if (
    typeof body.finalImageDataUrl !== "string" ||
    body.finalImageDataUrl.trim().length === 0
  ) {
    return NextResponse.json(
      { ok: false, error: "finalImageDataUrl is required" },
      { status: 400 },
    );
  }

  try {
    const savedResult = await saveResultFile(
      body.sessionId,
      body.finalImageDataUrl,
    );

    return NextResponse.json({
      ok: true,
      ...savedResult,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save result",
      },
      { status: 500 },
    );
  }
}
