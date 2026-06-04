import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const mimeExtensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

export type ParsedDataUrl = {
  mimeType: string;
  buffer: Buffer;
  extension: string;
};

export type SavedResult = {
  resultUrl: string;
  localFilePath: string;
  mimeType: string;
};

export function sanitizeSessionId(sessionId: string) {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const commaIndex = dataUrl.indexOf(",");

  if (!dataUrl.startsWith("data:") || commaIndex === -1) {
    throw new Error("finalImageDataUrl must be a valid data URL");
  }

  const metadata = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const metadataParts = metadata.split(";");
  const mimeType = metadataParts[0];
  const base64Flag = metadataParts.includes("base64");
  const extension = mimeExtensions[mimeType];

  if (!extension) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }

  const buffer = base64Flag
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  if (buffer.length === 0) {
    throw new Error("finalImageDataUrl contains no image data");
  }

  return {
    mimeType,
    buffer,
    extension,
  };
}

export function getResultPublicUrl(sessionId: string, extension: string) {
  const safeSessionId = sanitizeSessionId(sessionId);
  return `/results/${safeSessionId}/final.${extension}`;
}

export async function saveResultFile(
  sessionId: string,
  finalImageDataUrl: string,
): Promise<SavedResult> {
  const safeSessionId = sanitizeSessionId(sessionId);

  if (!safeSessionId) {
    throw new Error("sessionId must contain at least one safe character");
  }

  const parsed = parseDataUrl(finalImageDataUrl);
  const outputDirectory = path.join(process.cwd(), "public", "results", safeSessionId);
  const localFilePath = path.join(outputDirectory, `final.${parsed.extension}`);

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(localFilePath, parsed.buffer);

  return {
    resultUrl: getResultPublicUrl(sessionId, parsed.extension),
    localFilePath,
    mimeType: parsed.mimeType,
  };
}
