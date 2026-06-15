import sharp from "sharp";
import { applyChromaKeyIfEnabled, type ChromaKeyOptions } from "./chroma-key";
import { bufferToDataUrl, loadImage, normalizeImageBuffer } from "./load-image";
import { getBackgroundById, getFrameById, type BackgroundData, type PhotoSlot } from "@/lib/phobo-data";

export const FINAL_SCREEN_WIDTH_PX = 900;
export const FINAL_SCREEN_HEIGHT_PX = 1200;

export type ComposeFinalRequest = {
  sessionId: string;
  capturedPhotos: string[];
  selectedFrameId: string;
  selectedBackgroundId: string;
  options?: ChromaKeyOptions;
};

export type ComposedFinalImages = {
  finalScreenPng: Buffer;
  processedPhotoDataUrls: string[];
};

function hexToRgb(color: string) {
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

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function createScreenBackground(background: BackgroundData) {
  if (background.imageUrl) {
    return normalizeImageBuffer(background.imageUrl, {
      width: FINAL_SCREEN_WIDTH_PX,
      height: FINAL_SCREEN_HEIGHT_PX,
      fit: "cover",
    });
  }

  const { r, g, b } = hexToRgb(background.color);

  return sharp({
    create: {
      width: FINAL_SCREEN_WIDTH_PX,
      height: FINAL_SCREEN_HEIGHT_PX,
      channels: 4,
      background: { r, g, b, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function createPlaceholder(slot: PhotoSlot, index: number) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${slot.width}" height="${slot.height}" viewBox="0 0 ${slot.width} ${slot.height}">
      <rect width="${slot.width}" height="${slot.height}" rx="26" fill="#d9d9d9"/>
      <rect x="24" y="24" width="${slot.width - 48}" height="${slot.height - 48}" rx="20" fill="#c8c8c8"/>
      <text x="${slot.width / 2}" y="${slot.height / 2 + 14}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#535a64">PHOTO ${index + 1}</text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function processPhoto({
  photoUrl,
  background,
  options,
}: {
  photoUrl: string;
  background: BackgroundData;
  options: ChromaKeyOptions;
}) {
  const loaded = await loadImage(photoUrl);
  return applyChromaKeyIfEnabled(loaded.buffer, {
    color: background.color,
    imageUrl: background.imageUrl,
  }, options);
}

function frameOverlaySvg({
  frameName,
  backgroundName,
  slots,
}: {
  frameName: string;
  backgroundName: string;
  slots: PhotoSlot[];
}) {
  const slotBorders = slots.map((slot) => `
    <rect x="${slot.x - 10}" y="${slot.y - 10}" width="${slot.width + 20}" height="${slot.height + 20}" rx="34" fill="none" stroke="#ffffff" stroke-width="16" opacity="0.94"/>
    <rect x="${slot.x - 10}" y="${slot.y - 10}" width="${slot.width + 20}" height="${slot.height + 20}" rx="34" fill="none" stroke="#591f42" stroke-width="4"/>
  `).join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${FINAL_SCREEN_WIDTH_PX}" height="${FINAL_SCREEN_HEIGHT_PX}" viewBox="0 0 ${FINAL_SCREEN_WIDTH_PX} ${FINAL_SCREEN_HEIGHT_PX}">
      <rect x="52" y="54" width="${FINAL_SCREEN_WIDTH_PX - 104}" height="${FINAL_SCREEN_HEIGHT_PX - 108}" rx="42" fill="none" stroke="#ffffff" stroke-width="12" opacity="0.92"/>
      ${slotBorders}
      <rect x="212" y="1080" width="476" height="70" rx="35" fill="#591f42"/>
      <text x="${FINAL_SCREEN_WIDTH_PX / 2}" y="1127" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#ffffff">Phobo</text>
      <text x="${FINAL_SCREEN_WIDTH_PX / 2}" y="1180" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#ffffff" opacity="0.82">${escapeXml(`${frameName} / ${backgroundName}`)}</text>
    </svg>
  `;
}

export async function composeFinalImages({
  capturedPhotos,
  selectedFrameId,
  selectedBackgroundId,
  options = {},
}: ComposeFinalRequest): Promise<ComposedFinalImages> {
  const frame = getFrameById(selectedFrameId);
  const background = getBackgroundById(selectedBackgroundId);
  const screenBackground = await createScreenBackground(background);
  const processedPhotos = await Promise.all(
    capturedPhotos.slice(0, Math.max(frame.requiredPhotos, frame.photoSlots.length)).map((photoUrl) =>
      processPhoto({
        photoUrl,
        background,
        options,
      }),
    ),
  );
  const composites = await Promise.all(
    frame.photoSlots.map(async (slot, index) => {
      const source = processedPhotos.length
        ? processedPhotos[index % processedPhotos.length]
        : await createPlaceholder(slot, index);
      const input = await normalizeImageBuffer(source, {
        width: slot.width,
        height: slot.height,
        fit: "cover",
      });

      return {
        input,
        left: slot.x,
        top: slot.y,
      };
    }),
  );
  const overlay = Buffer.from(frameOverlaySvg({
    frameName: frame.name,
    backgroundName: background.name,
    slots: frame.photoSlots,
  }));
  const finalScreenPng = await sharp(screenBackground)
    .composite([
      { input: overlay, left: 0, top: 0 },
      ...composites,
      { input: overlay, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
  const processedPhotoDataUrls = await Promise.all(
    processedPhotos.map((photo) => bufferToDataUrl(photo)),
  );

  return {
    finalScreenPng,
    processedPhotoDataUrls,
  };
}
