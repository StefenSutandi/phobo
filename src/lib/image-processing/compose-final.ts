import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { applyChromaKeyIfEnabled, parseHexColor, type ChromaKeyOptions } from "./chroma-key";
import { bufferToDataUrl, loadImage, normalizeImageBuffer } from "./load-image";
import { getBackgroundById, getFrameById } from "../phobo-data";
import { getPhoboEnv } from "../config/phobo-env";

export const FINAL_SCREEN_WIDTH_PX = 1200;
export const FINAL_SCREEN_HEIGHT_PX = 1800;

export type PhotoInput = {
  raw: string;
  display?: string;
  backgroundId?: string;
  width?: number;
  height?: number;
};

export type SlotAssignmentInput = {
  slotIndex: number;
  photoRaw: string;
  backgroundId?: string;
};

export type ComposeFinalRequest = { 
  sessionId: string; 
  capturedPhotos: (PhotoInput | string)[]; 
  selectedFrameId: string; 
  selectedBackgroundId: string; 
  slotAssignments?: SlotAssignmentInput[];
  stickers?: any[]; 
  options?: ChromaKeyOptions 
};

export type ComposedFinalImages = { finalScreenPng: Buffer; processedPhotoDataUrls: string[]; warnings: string[] };

export async function composeFinalImages({
  sessionId,
  capturedPhotos,
  selectedFrameId,
  selectedBackgroundId,
  slotAssignments,
  stickers = [],
  options = {}
}: ComposeFinalRequest): Promise<ComposedFinalImages> {
  const env = getPhoboEnv();
  const warnings: string[] = [];
  const frame = getFrameById(selectedFrameId);
  const globalBg = getBackgroundById(selectedBackgroundId);
  const template = await normalizeImageBuffer(frame.templateUrl, { width: frame.width, height: frame.height, fit: "fill" });
  
  // Normalize photo array
  const normalizedPhotos: PhotoInput[] = (capturedPhotos || []).map((item) => {
    if (typeof item === "string") {
      return { raw: item, backgroundId: selectedBackgroundId };
    }
    return {
      raw: item.raw || item.display || "",
      display: item.display || item.raw,
      backgroundId: item.backgroundId || selectedBackgroundId,
      width: item.width,
      height: item.height,
    };
  }).filter((p) => Boolean(p.raw));

  const { computePhotoFit } = await import("./fit-math");
  const composites = [];
  const processedPhotoBuffers: Buffer[] = [];
  
  for (let index = 0; index < frame.photoSlots.length; index++) {
    const photoSlot = frame.photoSlots[index];
    
    // Resolve photo assignment for this slot
    let slotRaw = "";
    let slotBgId = selectedBackgroundId;

    if (Array.isArray(slotAssignments) && slotAssignments.length > index && slotAssignments[index]) {
      const sa = slotAssignments[index];
      slotRaw = sa.photoRaw;
      slotBgId = sa.backgroundId || selectedBackgroundId;
    } else if (normalizedPhotos.length > 0) {
      const photoItem = normalizedPhotos[index % normalizedPhotos.length];
      slotRaw = photoItem.raw;
      slotBgId = photoItem.backgroundId || selectedBackgroundId;
    }

    if (!slotRaw) {
      warnings.push(`Slot ${index} has no photo assigned`);
      continue;
    }

    const slotBg = getBackgroundById(slotBgId) || globalBg;

    try {
      // 1. Load photo buffer and process chroma key for this specific photo with its specific background
      const loaded = await loadImage(slotRaw);
      const transparentSubject = await applyChromaKeyIfEnabled(
        loaded.buffer,
        { color: slotBg.color, imageUrl: slotBg.imageUrl },
        options
      );
      processedPhotoBuffers.push(transparentSubject);

      // 2. Draw this photo's background into the slot
      let bgBuffer;
      if (slotBg.imageUrl) {
        bgBuffer = await normalizeImageBuffer(slotBg.imageUrl, { width: photoSlot.width, height: photoSlot.height, fit: "cover" });
      } else {
        const { r, g, b } = parseHexColor(slotBg.color);
        bgBuffer = await sharp({ create: { width: photoSlot.width, height: photoSlot.height, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
      }

      // 3. Draw transparent subject into the slot using computePhotoFit
      const meta = await sharp(transparentSubject).metadata();
      const sWidth = meta.width ?? 1;
      const sHeight = meta.height ?? 1;
      
      const fit = computePhotoFit(sWidth, sHeight, photoSlot.width, photoSlot.height, "smart-cover");
      
      const extractedSubject = await sharp(transparentSubject).extract({
        left: fit.sx,
        top: fit.sy,
        width: fit.sw,
        height: fit.sh
      }).resize({ width: fit.dw, height: fit.dh }).toBuffer();
      
      let slotComposedBuffer = await sharp(bgBuffer)
        .composite([{ input: extractedSubject, left: fit.dx, top: fit.dy }])
        .png()
        .toBuffer();

      // 4. Apply shape alpha mask for non-rectangular openings (ellipse, circle, rounded)
      if (photoSlot.shape && photoSlot.shape !== "rect") {
        let svgShape = "";
        if (photoSlot.shape === "ellipse") {
          const rx = photoSlot.width / 2;
          const ry = photoSlot.height / 2;
          svgShape = `<ellipse cx="${rx}" cy="${ry}" rx="${rx}" ry="${ry}" fill="#ffffff" />`;
        } else if (photoSlot.shape === "circle") {
          const r = Math.min(photoSlot.width, photoSlot.height) / 2;
          const cx = photoSlot.width / 2;
          const cy = photoSlot.height / 2;
          svgShape = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" />`;
        } else if (photoSlot.shape === "rounded") {
          const br = photoSlot.borderRadius || 16;
          svgShape = `<rect width="${photoSlot.width}" height="${photoSlot.height}" rx="${br}" ry="${br}" fill="#ffffff" />`;
        }

        if (svgShape) {
          const svgMask = Buffer.from(
            `<svg width="${photoSlot.width}" height="${photoSlot.height}" xmlns="http://www.w3.org/2000/svg">${svgShape}</svg>`
          );
          slotComposedBuffer = await sharp(slotComposedBuffer)
            .ensureAlpha()
            .composite([{ input: svgMask, blend: "dest-in" }])
            .png()
            .toBuffer();
        }
      }

      composites.push({ input: slotComposedBuffer, left: photoSlot.x, top: photoSlot.y });

      if (env.debugLogs || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
        console.log(`[Compose Slot] Slot ${index} | shape=${photoSlot.shape || 'rect'} | bg=${slotBgId} | photoRaw=${slotRaw.slice(0, 30)} | sDims=${sWidth}x${sHeight} | slotDims=${photoSlot.width}x${photoSlot.height} | fitMode=${fit.finalMode} | extract=(${fit.sx},${fit.sy},${fit.sw},${fit.sh}) -> dest=(${photoSlot.x + fit.dx},${photoSlot.y + fit.dy},${fit.dw},${fit.dh})`);
      }
    } catch (error) {
      warnings.push(`Failed to compose slot ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  composites.push({ input: template, left: 0, top: 0 });

  const sortedStickers = [...stickers].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  for (const sticker of sortedStickers) {
    if (!sticker.src || !sticker.src.startsWith('/stickers/') || sticker.src.includes('..')) continue;
    if (!Number.isFinite(sticker.x) || !Number.isFinite(sticker.y) || !Number.isFinite(sticker.width) || sticker.width <= 0) {
      warnings.push(`Skipped sticker with invalid geometry: ${JSON.stringify(sticker)}`);
      continue;
    }
    
    try {
      const stickerPath = path.join(process.cwd(), "public", sticker.src);
      await fs.access(stickerPath);
      
      let s = sharp(stickerPath).resize({ width: Math.round(sticker.width) });
      if (sticker.rotation && Number.isFinite(sticker.rotation)) {
        s = s.rotate(sticker.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
      }
      const stickerBuffer = await s.toBuffer();
      const meta = await sharp(stickerBuffer).metadata();
      const finalWidth = meta.width ?? sticker.width;
      const finalHeight = meta.height ?? sticker.width;
      
      const left = Math.round(sticker.x - finalWidth / 2);
      const top = Math.round(sticker.y - finalHeight / 2);
      
      composites.push({ input: stickerBuffer, left, top });
    } catch (error) {
      warnings.push(`Failed to composite sticker ${sticker.src}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const finalScreenPng = await sharp({ create: { width: frame.width, height: frame.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png()
    .toBuffer();

  const processedPhotoDataUrls = await Promise.all(
    processedPhotoBuffers.map((b) => bufferToDataUrl(b))
  );

  return { finalScreenPng, processedPhotoDataUrls, warnings };
}
