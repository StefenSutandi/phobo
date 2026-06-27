import sharp from "sharp";
import { applyChromaKeyIfEnabled, type ChromaKeyOptions } from "./chroma-key";
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
  const composites=(await Promise.all(frame.photoSlots.map(async (photoSlot,index)=>{
    const source=processedPhotos[index%frame.requiredPhotos];
    if(!source) return null;
    try { return { input:await normalizeImageBuffer(source,{width:photoSlot.width,height:photoSlot.height,fit:"cover"}),left:photoSlot.x,top:photoSlot.y }; }
    catch(error) { warnings.push(`Failed to compose slot ${index}: ${error instanceof Error?error.message:String(error)}`); return null; }
  }))).filter((item):item is {input:Buffer;left:number;top:number}=>item!==null);
  // The supplied RGB templates are opaque bases. Photos cover their gray slots.
  const finalScreenPng=await sharp(template).composite(composites).png().toBuffer();
  return { finalScreenPng, processedPhotoDataUrls:await Promise.all(processedPhotos.filter((photo):photo is Buffer=>photo!==null).map(photo=>bufferToDataUrl(photo))), warnings };
}
