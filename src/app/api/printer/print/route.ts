import { NextResponse } from "next/server";
import { printer } from "@/lib/hardware/printer-adapter";

export const runtime = "nodejs";

type PrintRequest = {
  sessionId?: unknown;
  printUrl?: unknown;
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

  const printUrl = typeof body.printUrl === "string"
    ? body.printUrl
    : typeof body.resultUrl === "string"
      ? body.resultUrl
      : "";

  if (printUrl.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "printUrl is required" },
      { status: 400 },
    );
  }

  try {
    const result = await printer.printImage({
      sessionId: body.sessionId,
      printUrl,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mode: process.env.PHOBO_PRINTER_MODE === "windows" ? "windows" : "mock",
        error: error instanceof Error ? error.message : "Print failed",
      },
      { status: 500 },
    );
  }
}
