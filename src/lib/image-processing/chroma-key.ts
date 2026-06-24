import sharp from "sharp";
import { normalizeImageBuffer } from "./load-image";

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

function parseHexColor(color: string) {
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
  const greenMin = clampByte(options.greenMin ?? 90);
  const greenTolerance = clampByte(options.greenTolerance ?? 35);
  // TODO: implement advanced real tuning for spillReduction and edgeSoftness
  const spillReduction = Math.min(100, Math.max(0, options.spillReduction ?? 0));
  const edgeSoftness = Math.min(20, Math.max(0, options.edgeSoftness ?? 0));
  
  const greenDominance = clampByte(options.greenDominance ?? 35);
  const raw = await sharp(photoBuffer)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer();

  for (let index = 0; index < raw.length; index += 4) {
    const red = raw[index];
    const green = raw[index + 1];
    const blue = raw[index + 2];
    const isGreen =
      green >= greenMin &&
      green - red >= greenDominance &&
      green - blue >= greenDominance &&
      green > red + greenTolerance * 0.4 &&
      green > blue + greenTolerance * 0.4;

    if (isGreen) {
      raw[index + 3] = 0;
    }
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
  const backgroundBuffer = await createBackgroundBuffer({
    background,
    width,
    height,
  });

  return sharp(backgroundBuffer)
    .composite([{ input: keyedPhoto, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

export async function applyChromaKeyIfEnabled(
  photoBuffer: Buffer,
  background: ChromaKeyBackground,
  options: ChromaKeyOptions = {},
) {
  if (options.applyChromaKey === false) {
    return photoBuffer;
  }

  return applyChromaKey(photoBuffer, background, options);
}
