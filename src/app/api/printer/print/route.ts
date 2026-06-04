import { NextResponse } from "next/server";
import { printer } from "@/lib/hardware/printer-adapter";

type PrintRequest = {
  sessionId?: unknown;
  resultUrl?: unknown;
};

export async function POST(request: Request) {
  let body: PrintRequest;

  try {
    body = (await request.json()) as PrintRequest;
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

  if (typeof body.resultUrl !== "string" || body.resultUrl.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "resultUrl is required" },
      { status: 400 },
    );
  }

  try {
    const printed = await printer.print(body.resultUrl);

    if (!printed) {
      return NextResponse.json(
        { ok: false, mode: "mock", error: "Mock print failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "mock",
      message: "Mock print queued",
      jobId: `mock-${Date.now()}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mode: "mock",
        error: error instanceof Error ? error.message : "Mock print failed",
      },
      { status: 500 },
    );
  }
}
