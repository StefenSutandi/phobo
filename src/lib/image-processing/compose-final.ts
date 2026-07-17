import sharp from "sharp";
import { applyChromaKeyIfEnabled, parseHexColor, type ChromaKeyOptions } from "./chroma-key";
import { bufferToDataUrl, loadImage, normalizeImageBuffer } from "./load-image";
import { getBackgroundById, getFrameById } from "@/lib/phobo-data";

export const FINAL_SCREEN_WIDTH_PX = 1200;
export const FINAL_SCREEN_HEIGHT_PX = 1800;

export type ComposeFinalRequest = { sessionId:string; capturedPhotos:string[]; selectedFrameId:string; selectedBackgroundId:string; options?:ChromaKeyOptions };
export type ComposedFinalImages = { finalScreenPng:Buffer; processedPhotoDataUrls:string[]; warnings:string[] };

export async function composeFinalImages({ capturedPhotos, selectedFrameId, selectedBackgroundId, options={} }:ComposeFinalRequest):Promise<ComposedFinalImages> {
  const warnings:string[]=[];
  const frame=getFrameById(selectedFrameId);
  const background=getBackgroundById(selectedBackgroundId);
  const template=await normalizeImageBuffer(frame.templateUrl,{width:frame.width,height:frame.height,fit:"fill"});
  const processedPhotos=await Promise.all(capturedPhotos.slice(0,frame.requiredPhotos).map(async photoUrl=>{
    try { const loaded=await loadImage(photoUrl); return await applyChromaKeyIfEnabled(loaded.buffer,{color:background.color,imageUrl:background.imageUrl},options); }
    catch(error) { warnings.push(`Failed to process photo ${photoUrl}: ${error instanceof Error?error.message:String(error)}`); return null; }
  }));
  const { computePhotoFit } = await import("./fit-math");
  const composites = [];
  
  for (let index = 0; index < frame.photoSlots.length; index++) {
    const photoSlot = frame.photoSlots[index];
    const source = processedPhotos[index % Math.max(1, processedPhotos.length)];
    if (!source) continue;
    
    try {
      // 1. Draw background into the slot
      let bgBuffer;
      if (background.imageUrl) {
        bgBuffer = await normalizeImageBuffer(background.imageUrl, { width: photoSlot.width, height: photoSlot.height, fit: "cover" });
      } else {
        const { r, g, b } = parseHexColor(background.color);
        bgBuffer = await sharp({ create: { width: photoSlot.width, height: photoSlot.height, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
      }
      composites.push({ input: bgBuffer, left: photoSlot.x, top: photoSlot.y });

      // 2. Draw transparent subject into the slot using computePhotoFit
      const meta = await sharp(source).metadata();
      const sWidth = meta.width ?? 1;
      const sHeight = meta.height ?? 1;
      
      const fit = computePhotoFit(sWidth, sHeight, photoSlot.width, photoSlot.height, "smart-cover");
      
      const extractedSubject = await sharp(source).extract({
        left: fit.sx,
        top: fit.sy,
        width: fit.sw,
        height: fit.sh
      }).resize({ width: fit.dw, height: fit.dh }).toBuffer();
      
      composites.push({ input: extractedSubject, left: photoSlot.x + fit.dx, top: photoSlot.y + fit.dy });
    } catch (error) {
      warnings.push(`Failed to compose slot ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  composites.push({ input: template, left: 0, top: 0 });

  const finalScreenPng=await sharp({
    create: { width: frame.width, height: frame.height, channels: 4, background: background.color }
  }).composite(composites).png().toBuffer();
  return { finalScreenPng, processedPhotoDataUrls:await Promise.all(processedPhotos.filter((photo):photo is Buffer=>photo!==null).map(photo=>bufferToDataUrl(photo))), warnings };
}
