import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { parseDataUrl } from "@/lib/results/result-storage";

export const PRINT_WIDTH_PX = 1181;
export const PRINT_HEIGHT_PX = 1748;

export type GeneratePostcardPrintRequest = {
  sessionId?: string;
  finalImageUrl?: string;
  finalImageBuffer?: Buffer;
  selectedFrameId?: string;
  selectedBackgroundId?: string;
  showSafeGuide?: boolean;
};

// Backward-compatible type alias
export type Generate4RPrintTemplateRequest = GeneratePostcardPrintRequest & {
  capturedPhotos?: string[];
};

const mimeByExtension: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function publicImageUrlToDataUrl(imageUrl: string): Promise<string | null> {
  if (imageUrl.startsWith("data:")) {
    const parsed = parseDataUrl(imageUrl);
    return `data:${parsed.mimeType};base64,${parsed.buffer.toString("base64")}`;
  }

  const pathname = imageUrl.startsWith("http://") || imageUrl.startsWith("https://")
    ? new URL(imageUrl).pathname
    : imageUrl;

  if (!pathname.startsWith("/")) {
    return null;
  }

  const publicRoot = path.join(process.cwd(), "public");
  const resolvedPath = path.resolve(publicRoot, `.${pathname}`);
  const relativePath = path.relative(publicRoot, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  try {
    await access(resolvedPath, constants.F_OK);
  } catch {
    return null;
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  const mimeType = mimeByExtension[extension];

  if (!mimeType) {
    return null;
  }

  const buffer = await readFile(resolvedPath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/**
 * Generates a single portrait 100 x 148 mm postcard print JPEG (1181 x 1748 px @ 300 DPI)
 * directly from the authoritative final composed image (final_screen).
 *
 * Uses Sharp with fit: "cover" and position: "centre" to ensure full-bleed portrait printing
 * without distorting image aspect ratio or duplicating copies side-by-side.
 */
export async function generatePostcardPrint({
  finalImageUrl,
  finalImageBuffer,
}: GeneratePostcardPrintRequest): Promise<Buffer> {
  let sourceBuffer: Buffer | null = null;

  if (finalImageBuffer && Buffer.isBuffer(finalImageBuffer)) {
    sourceBuffer = finalImageBuffer;
  } else if (finalImageUrl) {
    if (finalImageUrl.startsWith("data:")) {
      const parsed = parseDataUrl(finalImageUrl);
      sourceBuffer = parsed.buffer;
    } else {
      const dataUrl = await publicImageUrlToDataUrl(finalImageUrl);
      if (dataUrl) {
        sourceBuffer = parseDataUrl(dataUrl).buffer;
      }
    }
  }

  if (!sourceBuffer) {
    throw new Error("Final composed image is required for postcard printing");
  }

  return sharp(sourceBuffer)
    .flatten({ background: "#ffffff" })
    .resize(PRINT_WIDTH_PX, PRINT_HEIGHT_PX, {
      fit: "cover",
      position: "centre",
    })
    .jpeg({
      quality: 94,
      mozjpeg: true,
    })
    .toBuffer();
}

// Backward-compatibility export
export const generate4RPrintTemplate = generatePostcardPrint;
