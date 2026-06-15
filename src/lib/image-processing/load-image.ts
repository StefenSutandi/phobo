import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { parseDataUrl } from "@/lib/results/result-storage";

const mimeByExtension: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export type LoadedImage = {
  buffer: Buffer;
  mimeType: string;
  dataUrl: string;
};

export async function loadImage(source: string): Promise<LoadedImage> {
  if (source.startsWith("data:")) {
    const parsed = parseDataUrl(source);

    return {
      buffer: parsed.buffer,
      mimeType: parsed.mimeType,
      dataUrl: `data:${parsed.mimeType};base64,${parsed.buffer.toString("base64")}`,
    };
  }

  const pathname = source.startsWith("http://") || source.startsWith("https://")
    ? new URL(source).pathname
    : source;

  if (!pathname.startsWith("/")) {
    throw new Error("Image source must be a data URL or app-local public URL");
  }

  const publicRoot = path.join(process.cwd(), "public");
  const resolvedPath = path.resolve(publicRoot, `.${pathname}`);
  const relativePath = path.relative(publicRoot, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Image source resolved outside the public directory");
  }

  await access(resolvedPath, constants.F_OK);

  const extension = path.extname(resolvedPath).toLowerCase();
  const mimeType = mimeByExtension[extension];

  if (!mimeType) {
    throw new Error(`Unsupported image extension: ${extension}`);
  }

  const buffer = await readFile(resolvedPath);

  return {
    buffer,
    mimeType,
    dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
  };
}

export async function normalizeImageBuffer(
  source: string | Buffer,
  options: { width?: number; height?: number; fit?: keyof sharp.FitEnum } = {},
) {
  const input = typeof source === "string" ? (await loadImage(source)).buffer : source;
  const pipeline = sharp(input).rotate();

  if (options.width && options.height) {
    pipeline.resize(options.width, options.height, {
      fit: options.fit ?? "cover",
      position: "center",
    });
  }

  return pipeline.png().toBuffer();
}

export async function bufferToDataUrl(buffer: Buffer, mimeType = "image/png") {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
