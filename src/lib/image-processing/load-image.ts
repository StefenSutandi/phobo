import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type FitEnum } from "sharp";
import { parseDataUrl } from "../results/result-storage";
import { getPhoboEnv } from "../config/phobo-env";

const mimeByExtension: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function isSvg(buffer: Buffer): boolean {
  return buffer.slice(0, 100).toString("utf-8").toLowerCase().includes("<svg") ||
         buffer.slice(0, 100).toString("utf-8").toLowerCase().includes("<?xml");
}

export type LoadedImage = {
  buffer: Buffer;
  mimeType: string;
  dataUrl: string;
};

export async function loadImage(source: string): Promise<LoadedImage> {
  // 1. Data URL
  if (source.startsWith("data:")) {
    const parsed = parseDataUrl(source);

    return {
      buffer: parsed.buffer,
      mimeType: parsed.mimeType,
      dataUrl: `data:${parsed.mimeType};base64,${parsed.buffer.toString("base64")}`,
    };
  }

  // 2. Absolute filesystem path (Windows C:\... or Unix /...)
  if (path.isAbsolute(source)) {
    try {
      await access(source, constants.F_OK);
      const extension = path.extname(source).toLowerCase();
      const mimeType = mimeByExtension[extension] || "image/jpeg";
      const buffer = await readFile(source);

      return {
        buffer,
        mimeType,
        dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
      };
    } catch {
      // If direct absolute path access fails, attempt publicRoot resolution below
    }
  }

  // 3. App-local public URL or relative path
  let pathname = source.startsWith("http://") || source.startsWith("https://")
    ? new URL(source).pathname
    : source;

  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  const publicRoot = path.join(process.cwd(), "public");
  const resolvedPath = path.resolve(publicRoot, `.${pathname}`);

  await access(resolvedPath, constants.F_OK);

  const extension = path.extname(resolvedPath).toLowerCase();
  const mimeType = mimeByExtension[extension] || "image/jpeg";

  const buffer = await readFile(resolvedPath);

  if (getPhoboEnv().debugLogs) {
    console.log(`[loadImage] Loaded asset: ${resolvedPath} | ext: ${extension} | size: ${buffer.length} bytes`);
  }

  return {
    buffer,
    mimeType,
    dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
  };
}

export async function normalizeImageBuffer(
  source: string | Buffer,
  options: { width?: number; height?: number; fit?: keyof FitEnum } = {},
) {
  let input: Buffer;
  let sourceName = "buffer";

  if (typeof source === "string") {
    sourceName = source;
    input = (await loadImage(source)).buffer;
  } else {
    input = source;
  }

  try {
    const isSvgBuffer = isSvg(input);
    const sharpOptions = isSvgBuffer ? { unlimited: true, limitInputPixels: false, density: 300 } : {};
    const pipeline = sharp(input, sharpOptions).rotate();

    if (options.width && options.height) {
      pipeline.resize(options.width, options.height, {
        fit: options.fit ?? "cover",
        position: "center",
      });
    }

    return await pipeline.png().toBuffer();
  } catch (error) {
    throw new Error(`Failed to process image (${sourceName}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function bufferToDataUrl(buffer: Buffer, mimeType = "image/png") {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
