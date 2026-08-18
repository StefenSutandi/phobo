import sharp from "sharp";
import { normalizeImageBuffer } from "./load-image";
import { getPhoboEnv } from "../config/phobo-env";

export type ChromaKeyOptions = {
  applyChromaKey?: boolean;
  greenMin?: number;
  greenTolerance?: number;
  greenDominance?: number;
  spillReduction?: number;
  edgeSoftness?: number;
};

export type ChromaKeyBackground = {
  color: string;
  imageUrl?: string;
};

function clampByte(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function parseHexColor(color: string) {
  const normalized = color.replace("#", "");

  if (normalized.length !== 6) {
    return { r: 217, g: 217, b: 217 };
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

async function createBackgroundBuffer({
  background,
  width,
  height,
}: {
  background: ChromaKeyBackground;
  width: number;
  height: number;
}) {
  if (background.imageUrl) {
    return normalizeImageBuffer(background.imageUrl, {
      width,
      height,
      fit: "cover",
    });
  }

  const { r, g, b } = parseHexColor(background.color);

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r, g, b, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

export async function applyChromaKey(
  photoBuffer: Buffer,
  background: ChromaKeyBackground,
  options: ChromaKeyOptions = {},
) {
  const metadata = await sharp(photoBuffer).metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const greenMin = clampByte(options.greenMin ?? 70);
  const greenTolerance = clampByte(options.greenTolerance ?? 35);
  const spillReduction = Math.min(100, Math.max(0, options.spillReduction ?? 30));
  const edgeSoftness = Math.min(20, Math.max(0, options.edgeSoftness ?? 2));
  
  const raw = await sharp(photoBuffer)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer();

  for (let index = 0; index < raw.length; index += 4) {
    const red = raw[index];
    const green = raw[index + 1];
    const blue = raw[index + 2];
    
    const maxRB = Math.max(red, blue);
    const diff = green - maxRB;
    const threshold = greenTolerance * 0.5;

    let alpha = 255;
    if (green >= greenMin && diff > threshold && green > maxRB * 1.1) {
      if (edgeSoftness > 0 && diff < threshold + edgeSoftness * 2) {
        alpha = Math.floor(255 * (1 - (diff - threshold) / (edgeSoftness * 2)));
      } else {
        alpha = 0;
      }
    }
    
    // Spill reduction: if it's not fully keyed, but it's very green, reduce green channel
    if (alpha > 0 && spillReduction > 0) {
      if (green > maxRB) {
        const spillAmount = (green - maxRB) * (spillReduction / 100);
        raw[index + 1] = clampByte(green - spillAmount);
      }
    }

    raw[index + 3] = alpha;
  }

  const keyedPhoto = await sharp(raw, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
  if (getPhoboEnv().debugLogs) {
    console.log(`[Chroma Key] Extracted subject with greenMin=${greenMin}, tolerance=${greenTolerance}, edgeSoftness=${edgeSoftness}`);
  }

  return keyedPhoto;
}

export async function applyChromaKeyIfEnabled(
  photoBuffer: Buffer,
  background: ChromaKeyBackground,
  options: ChromaKeyOptions = {},
) {
  if (options.applyChromaKey === false) {
    if (getPhoboEnv().debugLogs || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
      console.log(`[Chroma Key] SKIPPED because applyChromaKey is false. Returning raw green-screen photo.`);
    }
    return photoBuffer;
  }

  if (getPhoboEnv().debugLogs || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
    console.log(`[Chroma Key] applyChromaKey is true. Proceeding with applyChromaKey().`);
  }
  return applyChromaKey(photoBuffer, background, options);
}
