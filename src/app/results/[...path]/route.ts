import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".json": "application/json",
  ".txt": "text/plain",
};

export function resolveResultsFilePath(pathSegments: string[]): {
  ok: boolean;
  fullPath?: string;
  mimeType?: string;
  errorStatus?: number;
  errorMessage?: string;
} {
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) {
    return { ok: false, errorStatus: 400, errorMessage: "Missing path" };
  }

  // 1. Check for invalid characters, null bytes, or traversal attempts
  for (const segment of pathSegments) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("\0") ||
      segment.includes("\\") ||
      segment.includes(":")
    ) {
      return { ok: false, errorStatus: 403, errorMessage: "Path traversal rejected" };
    }
  }

  const resultsRootDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public", "results");
  const fullPath = path.resolve(resultsRootDir, ...pathSegments);

  // 2. Strict root directory containment check
  const relative = path.relative(resultsRootDir, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false, errorStatus: 403, errorMessage: "Access outside results directory forbidden" };
  }

  // 3. Check existence and ensure it is a regular file
  if (!existsSync(fullPath)) {
    return { ok: false, errorStatus: 404, errorMessage: "File not found" };
  }

  try {
    const stat = statSync(fullPath);
    if (!stat.isFile()) {
      return { ok: false, errorStatus: 404, errorMessage: "Requested path is not a file" };
    }
  } catch {
    return { ok: false, errorStatus: 404, errorMessage: "Unable to inspect file" };
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || "application/octet-stream";

  return { ok: true, fullPath, mimeType };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  try {
    const resolvedParams = await context.params;
    const pathSegments = resolvedParams?.path || [];

    const resolved = resolveResultsFilePath(pathSegments);
    if (!resolved.ok || !resolved.fullPath) {
      return new NextResponse(resolved.errorMessage || "Not found", {
        status: resolved.errorStatus || 404,
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-store",
        },
      });
    }

    const fileBuffer = await fs.readFile(resolved.fullPath);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": resolved.mimeType || "application/octet-stream",
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[Results Route] Error serving file:", error);
    return new NextResponse("Internal server error", {
      status: 500,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      },
    });
  }
}
